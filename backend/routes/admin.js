const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Deployment = require('../models/Deployment');
const router = express.Router();

// --- Helpers ---
function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// --- Admin login ---
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin', username }, process.env.JWT_SECRET, { expiresIn: '12h' });
    return res.json({ success: true, token });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

// --- Auth middleware ---
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.admin = decoded;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

router.use(requireAdmin);

// --- Get all users ---
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Update user plan ---
router.put('/user/:userId/plan', async (req, res) => {
  try {
    const { userId } = req.params;
    const { plan } = req.body;
    if (!isValidId(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const allowedPlans = ['free', 'pro', 'elite', 'lifetime'];
    if (!allowedPlans.includes(plan)) {
      return res.status(400).json({ error: `Invalid plan. Allowed: ${allowedPlans.join(', ')}` });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.plan = plan;
    await user.save();
    res.json({ success: true, plan: user.plan });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Update user role ---
router.put('/user/:userId/role', async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    if (!isValidId(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const allowedRoles = ['user', 'mod', 'admin'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Allowed: ${allowedRoles.join(', ')}` });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.role = role;
    await user.save();
    res.json({ success: true, role: user.role });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Delete user ---
router.delete('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!isValidId(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const user = await User.findByIdAndDelete(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await Deployment.deleteMany({ userId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Blacklist user(s) op basis van IP ---
router.post('/blacklist', async (req, res) => {
  try {
    const { ip } = req.body;
    console.log('🚫 Blacklist IP:', ip);
    
    if (!ip) {
      return res.status(400).json({ error: 'IP required' });
    }
    
    // Zoek users met dit IP
    const users = await User.find({ lastIp: ip });
    console.log('👤 Users found with IP:', users.length);
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'No users found with this IP' });
    }
    
    // Blacklist alle users met dit IP
    let count = 0;
    for (const user of users) {
      user.blacklisted = true;
      await user.save();
      count++;
    }
    
    res.json({ 
      success: true, 
      count: count,
      message: `Blacklisted ${count} users with IP ${ip}`
    });
  } catch (error) {
    console.error('❌ Blacklist error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Unblacklist user ---
router.delete('/blacklist/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!isValidId(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.blacklisted = false;
    await user.save();
    res.json({ success: true, message: 'User unblacklisted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Stats ---
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalDeployments = await Deployment.countDocuments();
    const activeDeployments = await Deployment.countDocuments({ active: true });
    const totalVisitsResult = await Deployment.aggregate([
      { $group: { _id: null, total: { $sum: '$visits' } } }
    ]);
    res.json({
      totalUsers,
      totalDeployments,
      activeDeployments,
      totalVisits: totalVisitsResult[0]?.total || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
