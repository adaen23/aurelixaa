const express = require('express');
const User = require('../models/User');
const Deployment = require('../models/Deployment');
const router = express.Router();

// ===== ADMIN LOGIN =====
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'aurelixa_admin_2024') {
    return res.json({ token: 'admin-token-123' });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

// ===== GET ALL USERS (GEEN TOKEN NODIG) =====
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== UPDATE PLAN (GEEN TOKEN NODIG) =====
router.put('/user/:userId/plan', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.plan = req.body.plan;
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== UPDATE ROLE (GEEN TOKEN NODIG) =====
router.put('/user/:userId/role', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.role = req.body.role;
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== DELETE USER (GEEN TOKEN NODIG) =====
router.delete('/user/:userId', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await Deployment.deleteMany({ userId: req.params.userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== BLACKLIST (GEEN TOKEN NODIG) =====
router.post('/blacklist', async (req, res) => {
  try {
    const { ip } = req.body;
    if (!ip || ip === 'unknown' || ip === '-') {
      return res.status(400).json({ error: 'Invalid IP' });
    }
    const users = await User.find({ lastIp: ip });
    for (const u of users) {
      u.blacklisted = true;
      await u.save();
    }
    res.json({ success: true, count: users.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== UNBLACKLIST (GEEN TOKEN NODIG) =====
router.delete('/blacklist/:userId', async (req, res) => {
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

// ===== STATS (GEEN TOKEN NODIG) =====
router.get('/stats', async (req, res) => {
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
