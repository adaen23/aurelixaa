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
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== GET ALL USERS =====
router.get('/users', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ error: 'Admin only' });
    
    const users = await User.find({}).select('-password');
    
    // Get total visits per user
    const usersWithStats = await Promise.all(users.map(async (user) => {
      const deployments = await Deployment.find({ userId: user._id });
      let totalVisits = 0;
      deployments.forEach(d => totalVisits += (d.visits || 0));
      return {
        ...user.toObject(),
        totalVisits
      };
    }));
    
    res.json({ users: usersWithStats });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ===== UPDATE USER PLAN =====
router.put('/user/:userId/plan', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ error: 'Admin only' });
    
    const { userId } = req.params;
    const { plan } = req.body;
    
    if (!['free', 'pro', 'elite', 'lifetime'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.plan = plan;
    await user.save();
    
    res.json({ 
      success: true, 
      user: { 
        id: user._id, 
        email: user.email, 
        plan: user.plan, 
        discord: user.discord,
        lastIp: user.lastIp 
      } 
    });
  } catch (error) {
    console.error('Error updating plan:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ===== GET STATS =====
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
    
    res.json({
      totalUsers,
      totalDeployments,
      activeDeployments,
      totalVisits: totalVisits[0]?.total || 0
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;
