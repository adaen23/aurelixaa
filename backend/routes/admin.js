const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Deployment = require('../models/Deployment');
const router = express.Router();

// ===== ADMIN LOGIN =====
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }
    const token = jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== GET ALL USERS (Admin + Mod) =====
router.get('/users', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin && !decoded.mod) return res.status(403).json({ error: 'Admin or Mod only' });
    
    const users = await User.find({}).select('-password');
    const usersWithStats = await Promise.all(users.map(async (user) => {
      const deployments = await Deployment.find({ userId: user._id });
      let totalVisits = 0;
      deployments.forEach(d => totalVisits += (d.visits || 0));
      return { ...user.toObject(), totalVisits };
    }));
    
    res.json({ users: usersWithStats });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== UPDATE USER PLAN (Admin + Mod) =====
router.put('/user/:userId/plan', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin && !decoded.mod) return res.status(403).json({ error: 'Admin or Mod only' });
    
    const { userId } = req.params;
    const { plan } = req.body;
    
    if (!['free', 'pro', 'elite', 'lifetime'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }
    
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.plan = plan;
    await user.save();
    
    res.json({ success: true, user: { id: user._id, email: user.email, plan: user.plan, discord: user.discord, lastIp: user.lastIp, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== UPDATE USER ROLE (Admin only) =====
router.put('/user/:userId/role', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ error: 'Admin only' });
    
    const { userId } = req.params;
    const { role } = req.body;
    
    if (!['user', 'mod', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.role = role;
    await user.save();
    
    res.json({ success: true, user: { id: user._id, email: user.email, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== DELETE USER (Admin only) =====
router.delete('/user/:userId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ error: 'Admin only' });
    
    const { userId } = req.params;
    
    // Delete user
    const user = await User.findByIdAndDelete(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Delete all their deployments
    await Deployment.deleteMany({ userId });
    
    res.json({ success: true, message: 'User and all deployments deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== BLACKLIST IP (Admin only) =====
router.post('/blacklist', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ error: 'Admin only' });
    
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP is required' });
    
    // Find all users with this IP and blacklist them
    const users = await User.find({ lastIp: ip });
    for (const user of users) {
      user.blacklisted = true;
      await user.save();
    }
    
    res.json({ success: true, message: `Blacklisted ${users.length} users with IP ${ip}` });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== REMOVE BLACKLIST (Admin only) =====
router.delete('/blacklist/:userId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ error: 'Admin only' });
    
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.blacklisted = false;
    await user.save();
    
    res.json({ success: true, message: 'User removed from blacklist' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== GET STATS =====
router.get('/stats', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin && !decoded.mod) return res.status(403).json({ error: 'Admin or Mod only' });
    
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
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
