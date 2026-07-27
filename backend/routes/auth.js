const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const router = express.Router();

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.headers['cf-connecting-ip'] ||
         req.headers['x-real-ip'] ||
         req.ip ||
         'unknown';
}

// ===== REGISTER =====
router.post('/register', async (req, res) => {
  try {
    const { email, password, discord } = req.body;
    console.log('📝 Register:', email);
    
    if (!discord?.trim()) {
      return res.status(400).json({ error: 'Discord username is required' });
    }
    
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const ip = getClientIp(req);
    const blacklisted = await User.findOne({ lastIp: ip, blacklisted: true });
    if (blacklisted) {
      return res.status(403).json({ error: 'Your IP has been blacklisted' });
    }
    
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ 
      email, 
      password: hashed, 
      discord: discord.trim(), 
      lastIp: ip 
    });
    await user.save();
    console.log('✅ User registered:', email);
    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    res.json({ 
      token, 
      user: { 
        id: user._id, 
        email: user.email, 
        plan: user.plan, 
        discord: user.discord 
      } 
    });
  } catch (error) {
    console.error('❌ Register error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== LOGIN =====
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('🔑 Login attempt:', email);
    
    const user = await User.findOne({ email });
    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (user.blacklisted) {
      console.log('❌ User blacklisted:', email);
      return res.status(403).json({ error: 'Account has been blacklisted' });
    }
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      console.log('❌ Invalid password:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const ip = getClientIp(req);
    user.lastIp = ip;
    await user.save();
    console.log('✅ User logged in:', email);
    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    res.json({ 
      token, 
      user: { 
        id: user._id, 
        email: user.email, 
        plan: user.plan, 
        webhook: user.webhook, 
        discord: user.discord,
        role: user.role || 'user',
        isOwner: user.role === 'owner' || false
      } 
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== GET CURRENT USER =====
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.blacklisted) {
      return res.status(403).json({ error: 'Account blacklisted' });
    }
    
    res.json({ 
      user: { 
        id: user._id, 
        email: user.email, 
        plan: user.plan, 
        webhook: user.webhook, 
        discord: user.discord,
        role: user.role || 'user',
        isOwner: user.role === 'owner' || false
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
      return res.status(401).json({ error: 'No token' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { webhook } = req.body;
    
    if (!webhook || !webhook.includes('discord.com/api/webhooks')) {
      return res.status(400).json({ error: 'Invalid Discord webhook URL' });
    }
    
    await User.findByIdAndUpdate(decoded.userId, { webhook });
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== GENERATE API KEY (LIFETIME ONLY) =====
router.post('/generate-api-key', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user || (user.plan !== 'lifetime' && user.role !== 'owner')) {
      return res.status(403).json({ error: 'API access requires Lifetime plan' });
    }
    
    const apiKey = crypto.randomBytes(32).toString('hex');
    user.apiKey = apiKey;
    await user.save();
    
    res.json({ success: true, apiKey });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
