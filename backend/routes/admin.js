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

router.put('/user
