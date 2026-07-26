const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Deployment = require('../models/Deployment');
const router = express.Router();

// ADMIN LOGIN
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

// GET ALL USERS
router.get('/users', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ error: 'Admin only' });
    const users = await User.find({}).select('-password');
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// UPDATE PLAN
router.put('/user/:userId/plan', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ error: 'Admin only' });
    
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.plan = req.body.plan;
    await user.save();
    res.json({ success: true, message: 'Plan updated' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// UPDATE ROLE
router.put('/user/:userId/role', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ error: 'Admin only' });
    
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.role = req.body.role;
    await user.save();
    res.json({ success: true, message: 'Role updated' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE USER
router.delete('/user/:userId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ error: 'Admin only' });
    
    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await Deployment.deleteMany({ userId: req.params.userId });
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// BLACKLIST
router.post('/blacklist', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ error: 'Admin only' });
    
    const { ip } = req.body;
    if (!ip || ip === 'unknown' || ip === '-') {
      return res.status(400).json({ error: 'Invalid IP' });
    }
    const users = await User.find({ lastIp: ip });
    for (const user of users) {
      user.blacklisted = true;
      await user.save();
    }
    res.json({ success: true, message: `Blacklisted ${users.length} users` });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// UNBLACKLIST
router.delete('/blacklist/:userId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' '')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ error: 'Admin only' });
    
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.blacklisted = false;
    await user.save();
    res.json({ success: true, message: 'User unblacklisted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// STATS
router.get('/stats', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ error: 'Admin only' });
    
    const totalUsers = await User.countDocuments();
    const totalDeployments = await Deployment.countDocuments();
    const activeDeployments = await Deployment.countDocuments({ active: true });
    const totalVisits = await Deployment.aggregate([{ $group: { _id: null, total: { $sum: '$visits' } } }]);
    res.json({ totalUsers, totalDeployments, activeDeployments, totalVisits: totalVisits[0]?.total || 0 });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
