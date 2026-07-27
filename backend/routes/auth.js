const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// ===== HARCODED OWNER =====
const OWNER_EMAIL = 'owner@aurelixa.com';
const OWNER_PASSWORD = 'Owner2024!';

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.headers['cf-connecting-ip'] ||
         req.headers['x-real-ip'] ||
         req.ip ||
         'unknown';
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, discord } = req.body;
    if (!discord?.trim()) return res.status(400).json({ error: 'Discord username is required' });
    
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: 'Email already registered' });
    
    const ip = getClientIp(req);
    const blacklisted = await User.findOne({ lastIp: ip, blacklisted: true });
    if (blacklisted) return res.status(403).json({ error: 'IP is blacklisted' });
    
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashed, discord: discord.trim(), lastIp: ip });
    await user.save();
    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    res.json({ token, user: { id: user._id, email: user.email, plan: user.plan, discord: user.discord } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // ===== CHECK OF HET DE OWNER IS =====
    if (email === OWNER_EMAIL && password === OWNER_PASSWORD) {
      const token = jwt.sign({ userId: 'owner', isOwner: true }, process.env.JWT_SECRET, { expiresIn: '24h' });
      return res.json({ 
        token, 
        user: { 
          id: 'owner', 
          email: OWNER_EMAIL, 
          plan: 'lifetime', 
          isOwner: true,
          role: 'owner'
        } 
      });
    }
    
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.blacklisted) return res.status(403).json({ error: 'Account blacklisted' });
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    
    user.lastIp = getClientIp(req);
    await user.save();
    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    res.json({ token, user: { id: user._id, email: user.email, plan: user.plan, webhook: user.webhook, discord: user.discord } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // ===== CHECK OF HET DE OWNER IS =====
    if (decoded.isOwner) {
      return res.json({ 
        user: { 
          id: 'owner', 
          email: OWNER_EMAIL, 
          plan: 'lifetime', 
          isOwner: true,
          role: 'owner'
        } 
      });
    }
    
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.blacklisted) return res.status(403).json({ error: 'Account blacklisted' });
    
    res.json({ 
      user: { 
        id: user._id, 
        email: user.email, 
        plan: user.plan, 
        webhook: user.webhook, 
        discord: user.discord
      } 
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { webhook } = req.body;
    if (!webhook?.includes('discord.com/api/webhooks')) {
      return res.status(400).json({ error: 'Invalid Discord webhook URL' });
    }
    await User.findByIdAndUpdate(decoded.userId, { webhook });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
