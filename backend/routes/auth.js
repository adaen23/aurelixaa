const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, discord } = req.body;
    
    // Discord is nu verplicht!
    if (!discord || discord.trim() === '') {
      return res.status(400).json({ error: 'Discord username is required' });
    }
    
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ 
      email, 
      password: hashedPassword, 
      discord: discord.trim(),
      lastIp: req.ip || req.headers['x-forwarded-for'] || 'unknown'
    });
    await user.save();
    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    res.json({ token, user: { id: user._id, email: user.email, plan: user.plan, discord: user.discord } });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });
    
    // Update last IP on login
    user.lastIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    await user.save();
    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    res.json({ token, user: { id: user._id, email: user.email, plan: user.plan, webhook: user.webhook, discord: user.discord } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: { id: user._id, email: user.email, plan: user.plan, webhook: user.webhook, discord: user.discord, lastIp: user.lastIp } });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { webhook } = req.body;
    if (!webhook || !webhook.includes('discord.com/api/webhooks')) {
      return res.status(400).json({ error: 'Invalid Discord webhook URL' });
    }
    await User.findByIdAndUpdate(decoded.userId, { webhook });
    res.json({ success: true, message: 'Webhook updated' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
