const express = require('express');
const User = require('../models/User');
const Deployment = require('../models/Deployment');
const router = express.Router();

console.log('✅ Admin routes loaded!');

// ===== ADMIN LOGIN =====
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'aurelixa_admin_2024') {
    return res.json({ token: 'admin-token-123' });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

// ===== GET ALL USERS (GEEN TOKEN) =====
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    console.log('📋 Users fetched:', users.length);
    res.json({ users });
  } catch (err) {
    console.error('❌ Users error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== UPDATE PLAN (GEEN TOKEN) =====
router.put('/user/:userId/plan', async (req, res) => {
  try {
    console.log('📝 Update plan - User ID:', req.params.userId);
    console.log('📝 New plan:', req.body.plan);
    
    const user = await User.findById(req.params.userId);
    if (!user) {
      console.log('❌ User not found');
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.plan = req.body.plan;
    await user.save();
    console.log('✅ Plan updated for:', user.email);
    res.json({ success: true, plan: user.plan });
  } catch (err) {
    console.error('❌ Update plan error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== UPDATE ROLE (GEEN TOKEN) =====
router.put('/user/:userId/role', async (req, res) => {
  try {
    console.log('📝 Update role - User ID:', req.params.userId);
    console.log('📝 New role:', req.body.role);
    
    const user = await User.findById(req.params.userId);
    if (!user) {
      console.log('❌ User not found');
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.role = req.body.role;
    await user.save();
    console.log('✅ Role updated for:', user.email);
    res.json({ success: true, role: user.role });
  } catch (err) {
    console.error('❌ Update role error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== DELETE USER (GEEN TOKEN) =====
router.delete('/user/:userId', async (req, res) => {
  try {
    console.log('🗑️ Delete user - ID:', req.params.userId);
    
    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) {
      console.log('❌ User not found');
      return res.status(404).json({ error: 'User not found' });
    }
    
    await Deployment.deleteMany({ userId: req.params.userId });
    console.log('✅ User deleted:', user.email);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== BLACKLIST (GEEN TOKEN) =====
router.post('/blacklist', async (req, res) => {
  try {
    const { ip } = req.body;
    console.log('🚫 Blacklist IP:', ip);
    
    if (!ip || ip === 'unknown' || ip === '-' || ip === '') {
      return res.status(400).json({ error: 'Invalid IP address' });
    }
    
    const users = await User.find({ lastIp: ip });
    console.log('👤 Users found with this IP:', users.length);
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'No users found with this IP' });
    }
    
    let count = 0;
    for (const u of users) {
      u.blacklisted = true;
      await u.save();
      count++;
    }
    
    res.json({ success: true, count, message: `Blacklisted ${count} users` });
  } catch (err) {
    console.error('❌ Blacklist error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== UNBLACKLIST (GEEN TOKEN) =====
router.delete('/blacklist/:userId', async (req, res) => {
  try {
    console.log('✅ Unblacklist - ID:', req.params.userId);
    
    const user = await User.findById(req.params.userId);
    if (!user) {
      console.log('❌ User not found');
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.blacklisted = false;
    await user.save();
    console.log('✅ User unblacklisted:', user.email);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Unblacklist error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== STATS (GEEN TOKEN) =====
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalDeployments = await Deployment.countDocuments();
    const activeDeployments = await Deployment.countDocuments({ active: true });
    const totalVisits = await Deployment.aggregate([{ $group: { _id: null, total: { $sum: '$visits' } } }]);
    
    res.json({
      totalUsers,
      totalDeployments,
      activeDeployments,
      totalVisits: totalVisits[0]?.total || 0
    });
  } catch (err) {
    console.error('❌ Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
