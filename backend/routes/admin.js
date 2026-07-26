const express = require('express');
const User = require('../models/User');
const Deployment = require('../models/Deployment');
const jwt = require('jsonwebtoken');
const router = express.Router();

console.log('✅ Admin routes loaded!');

// Admin token check
function checkAdminToken(req, res, next) {
  const authHeader = req.headers.authorization;
  console.log('🔑 Auth header:', authHeader);
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('❌ No token provided');
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  console.log('🔑 Token received:', token.substring(0, 20) + '...');
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token verified:', decoded);
    if (!decoded.admin) {
      console.log('❌ Not admin');
      return res.status(403).json({ error: 'Forbidden: Admin only' });
    }
    next();
  } catch (err) {
    console.log('❌ Token invalid:', err.message);
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }
}

// ===== ADMIN LOGIN =====
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  console.log('🔑 Admin login attempt:', username);
  
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: '24h' });
    console.log('✅ Admin logged in');
    return res.json({ token });
  }
  console.log('❌ Invalid admin credentials');
  res.status(401).json({ error: 'Invalid credentials' });
});

// ===== GET ALL USERS =====
router.get('/users', checkAdminToken, async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    console.log('📋 Users fetched:', users.length);
    res.json({ users });
  } catch (err) {
    console.error('❌ Users error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== UPDATE PLAN =====
router.put('/user/:userId/plan', checkAdminToken, async (req, res) => {
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
    res.json({ success: true, plan: user.plan, user: { id: user._id, email: user.email, plan: user.plan } });
  } catch (err) {
    console.error('❌ Update plan error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== UPDATE ROLE =====
router.put('/user/:userId/role', checkAdminToken, async (req, res) => {
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
    res.json({ success: true, role: user.role, user: { id: user._id, email: user.email, role: user.role } });
  } catch (err) {
    console.error('❌ Update role error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== DELETE USER =====
router.delete('/user/:userId', checkAdminToken, async (req, res) => {
  try {
    console.log('🗑️ Delete user - ID:', req.params.userId);
    
    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) {
      console.log('❌ User not found');
      return res.status(404).json({ error: 'User not found' });
    }
    
    await Deployment.deleteMany({ userId: req.params.userId });
    console.log('✅ User deleted:', user.email);
    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    console.error('❌ Delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== BLACKLIST =====
router.post('/blacklist', checkAdminToken, async (req, res) => {
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
    
    res.json({ success: true, count, message: `Blacklisted ${count} users with IP ${ip}` });
  } catch (err) {
    console.error('❌ Blacklist error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== UNBLACKLIST =====
router.delete('/blacklist/:userId', checkAdminToken, async (req, res) => {
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
    res.json({ success: true, message: 'User unblacklisted' });
  } catch (err) {
    console.error('❌ Unblacklist error:', err);
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
