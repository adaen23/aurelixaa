const express = require('express');
const User = require('../models/User');
const Deployment = require('../models/Deployment');
const router = express.Router();

// Admin token
const ADMIN_TOKEN = 'admin-token-123';

// ===== ADMIN LOGIN =====
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    return res.json({ token: ADMIN_TOKEN });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

// ===== MIDDLEWARE: Check admin token =====
function checkAdminToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
  const token = authHeader.split(' ')[1];
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }
  next();
}

// ===== GET ALL USERS =====
router.get('/users', checkAdminToken, async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== UPDATE PLAN =====
router.put('/user/:userId/plan', checkAdminToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.plan = req.body.plan;
    await user.save();
    res.json({ success: true, plan: user.plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== UPDATE ROLE =====
router.put('/user/:userId/role', checkAdminToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.role = req.body.role;
    await user.save();
    res.json({ success: true, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== DELETE USER =====
router.delete('/user/:userId', checkAdminToken, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await Deployment.deleteMany({ userId: req.params.userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== BLACKLIST =====
router.post('/blacklist', checkAdminToken, async (req, res) => {
  try {
    const { ip } = req.body;
    console.log('🚫 Blacklist IP:', ip);
    
    if (!ip || ip === 'unknown' || ip === '-' || ip === '') {
      return res.status(400).json({ error: 'Invalid IP address. User has no IP stored.' });
    }
    
    const users = await User.find({ lastIp: ip });
    if (users.length === 0) {
      return res.status(404).json({ error: 'No users found with this IP' });
    }
    
    let count = 0;
    for (const u of users) {
      u.blacklisted = true;
      await u.save();
      count++;
    }
    
    res.json({ success: true, count, message: `Blacklisted ${count} users with IP ${ip}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== UNBLACKLIST =====
router.delete('/blacklist/:userId', checkAdminToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.blacklisted = false;
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== STATS =====
router.get('/stats', checkAdminToken, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalDeployments = await Deployment.countDocuments();
    const activeDeployments = await Deployment.countDocuments({ active: true });
    const totalVisits = await Deployment.aggregate([{ $group: { _id: null, total: { $sum: '$visits' } } }]);
    res.json({ totalUsers, totalDeployments, activeDeployments, totalVisits: totalVisits[0]?.total || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
