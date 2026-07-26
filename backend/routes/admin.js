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
    res.status(500).json({ error: 'Server error: ' + error.message });
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
    
    const usersWithStats = await Promise.all(users.map(async (user) => {
      const deployments = await Deployment.find({ userId: user._id });
      let totalVisits = 0;
      deployments.forEach(d => totalVisits += (d.visits || 0));
      return { ...user.toObject(), totalVisits };
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
    
    console.log('📝 Update plan - User:', userId, 'Plan:', plan);
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.plan = plan;
    await user.save();
    
    console.log('✅ Plan updated for:', user.email);
    res.json({ 
      success: true, 
      message: 'Plan updated successfully',
      user: { id: user._id, email: user.email, plan: user.plan }
    });
  } catch (error) {
    console.error('❌ Update plan error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ===== UPDATE USER ROLE =====
router.put('/user/:userId/role', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ error: 'Admin only' });
    
    const { userId } = req.params;
    const { role } = req.body;
    
    console.log('📝 Update role - User:', userId, 'Role:', role);
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.role = role;
    await user.save();
    
    console.log('✅ Role updated for:', user.email);
    res.json({ 
      success: true, 
      message: 'Role updated successfully',
      user: { id: user._id, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('❌ Update role error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ===== DELETE USER =====
router.delete('/user/:userId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ error: 'Admin only' });
    
    const { userId } = req.params;
    console.log('🗑️ Deleting user:', userId);
    
    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    await Deployment.deleteMany({ userId });
    console.log('✅ User deleted:', user.email);
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('❌ Delete user error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ===== BLACKLIST USER BY IP =====
router.post('/blacklist', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ error: 'Admin only' });
    
    const { ip } = req.body;
    console.log('🚫 Blacklisting IP:', ip);
    
    if (!ip || ip === 'unknown' || ip === '-' || ip === '') {
      return res.status(400).json({ error: 'Invalid IP address' });
    }
    
    const users = await User.find({ lastIp: ip });
    if (users.length === 0) {
      return res.status(404).json({ error: 'No users found with this IP' });
    }
    
    let count = 0;
    for (const user of users) {
      user.blacklisted = true;
      await user.save();
      count++;
    }
    
    console.log(`✅ Blacklisted ${count} users`);
    res.json({ success: true, message: `Blacklisted ${count} users with IP ${ip}` });
  } catch (error) {
    console.error('❌ Blacklist error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ===== UNBLACKLIST USER =====
router.delete('/blacklist/:userId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ error: 'Admin only' });
    
    const { userId } = req.params;
    console.log('✅ Unblacklisting user:', userId);
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.blacklisted = false;
    await user.save();
    
    console.log('✅ User unblacklisted:', user.email);
    res.json({ success: true, message: 'User unblacklisted' });
  } catch (error) {
    console.error('❌ Unblacklist error:', error);
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
    console.error('❌ Stats error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router; // ← EEN KEER!
