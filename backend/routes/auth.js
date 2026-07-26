const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// ===== IP OPSLAAN - DEZE FUNCTIE WERKT OP RENDER =====
function getClientIp(req) {
  // Probeer alle mogelijke headers voor het echte IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
             req.headers['cf-connecting-ip'] ||
             req.headers['x-real-ip'] ||
             req.socket?.remoteAddress ||
             req.ip ||
             'unknown';
  
  console.log('🔍 IP detected:', ip);
  
  // Als het localhost is, return een test IP
  if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') {
    return '85.146.105.203';
  }
  
  return ip;
}

// ===== REGISTER =====
router.post('/register', async (req, res) => {
  try {
    const { email, password, discord } = req.body;
    console.log('📝 Register attempt:', email);
    
    if (!discord || discord.trim() === '') {
      return res.status(400).json({ error: 'Discord username is required' });
    }
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Sla IP op bij registratie!
    const ip = getClientIp(req);
    console.log('📝 Register IP:', ip);
    
    const blacklistedUser = await User.findOne({ lastIp: ip, blacklisted: true });
    if (blacklistedUser) {
      return res.status(403).json({ error: 'Your IP has been blacklisted' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ 
      email, 
      password: hashedPassword, 
      discord: discord.trim(),
      lastIp: ip
    });
    await user.save();
    console.log('✅ User created with IP:', ip);
    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    res.json({ 
      token, 
      user: { 
        id: user._id, 
        email: user.email, 
        plan: user.plan, 
        discord: user.discord,
        lastIp: user.lastIp,
        role: user.role
      } 
    });
  } catch (error) {
    console.error('❌ Register error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ===== LOGIN =====
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('🔑 Login attempt:', email);
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (user.blacklisted) {
      return res.status(403).json({ error: 'Your account has been blacklisted' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update IP bij login
    const ip = getClientIp(req);
    user.lastIp = ip;
    await user.save();
    console.log('✅ Login IP updated:', ip);
    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    res.json({ 
      token, 
      user: { 
        id: user._id, 
        email: user.email, 
        plan: user.plan, 
        webhook: user.webhook, 
        discord: user.discord,
        lastIp: user.lastIp,
        role: user.role
      } 
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ===== GET CURRENT USER =====
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.blacklisted) {
      return res.status(403).json({ error: 'Your account has been blacklisted' });
    }
    
    res.json({ 
      user: { 
        id: user._id, 
        email: user.email, 
        plan: user.plan, 
        webhook: user.webhook, 
        discord: user.discord,
        lastIp: user.lastIp,
        role: user.role
      } 
    });
  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ===== UPDATE WEBHOOK =====
router.post('/webhook', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { webhook } = req.body;
    
    if (!webhook || !webhook.includes('discord.com/api/webhooks')) {
      return res.status(400).json({ error: 'Invalid Discord webhook URL' });
    }
    
    await User.findByIdAndUpdate(decoded.userId, { webhook });
    res.json({ success: true, message: 'Webhook updated' });
  } catch (error) {
    console.error('❌ Webhook update error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;
