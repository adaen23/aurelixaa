const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Deployment = require('../models/Deployment');
const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }
  const token = jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

router.get('/users', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.admin) return res.status(403).json({ error: 'Admin only' });
    const users = await User.find({}).select('-password');
    res.json({ users });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

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
    const user = await User.findByIdAndUpdate(userId, { plan }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user: { id: user._id, email: user.email, plan: user.plan, discord: user.discord } });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

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
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
