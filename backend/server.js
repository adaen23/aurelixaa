const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const cron = require('node-cron');
const path = require('path');
const User = require('./models/User');
const Deployment = require('./models/Deployment');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

dotenv.config();

const app = express();

// ===== CORS =====
app.use(cors({
  origin: '*',
  credentials: true
}));

app.use(express.json());

// ===== SERVE STATIC FILES =====
app.use(express.static(path.join(__dirname, '../frontend')));

// ============================================================
// ===== ADMIN ROUTES (DIRECT IN SERVER.JS) =====
// ============================================================

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  console.log('🔑 Admin login:', username);
  
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

// Get all users
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    console.log('📋 Users fetched:', users.length);
    res.json({ users });
  } catch (err) {
    console.error('❌ Users error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update plan
app.put('/api/admin/user/:userId/plan', async (req, res) => {
  try {
    console.log('📝 Update plan - User ID:', req.params.userId);
    console.log('📝 New plan:', req.body.plan);
    
    const user = await User.findById(req.params.userId);
    if (!user) {
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

// Update role
app.put('/api/admin/user/:userId/role', async (req, res) => {
  try {
    console.log('📝 Update role - User ID:', req.params.userId);
    console.log('📝 New role:', req.body.role);
    
    const user = await User.findById(req.params.userId);
    if (!user) {
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

// Delete user
app.delete('/api/admin/user/:userId', async (req, res) => {
  try {
    console.log('🗑️ Delete user - ID:', req.params.userId);
    
    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) {
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

// Blacklist
app.post('/api/admin/blacklist', async (req, res) => {
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

// Unblacklist
app.delete('/api/admin/blacklist/:userId', async (req, res) => {
  try {
    console.log('✅ Unblacklist - ID:', req.params.userId);
    
    const user = await User.findById(req.params.userId);
    if (!user) {
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

// Stats
app.get('/api/admin/stats', async (req, res) => {
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

// ============================================================
// ===== REGULAR ROUTES =====
// ============================================================

const authRoutes = require('./routes/auth');
const deployRoutes = require('./routes/deploy');
const webhookRoutes = require('./routes/webhook');

app.use('/api/auth', authRoutes);
app.use('/api/deploy', deployRoutes);
app.use('/api/webhook', webhookRoutes);

// ===== SERVE DEPLOYED PAGES (SUBDOMAIN ROUTE) =====
app.get('/:subdomain', async (req, res) => {
  try {
    const { subdomain } = req.params;
    
    if (subdomain === 'api' || subdomain === 'favicon.ico' || subdomain.includes('.')) {
      return res.status(404).send('Not found');
    }
    
    const deployment = await Deployment.findOne({ subdomain, active: true });
    
    if (!deployment) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Not Found</title>
          <style>
            body{background:#0a0a0f;display:flex;justify-content:center;align-items:center;height:100vh;font-family:'Inter',sans-serif;margin:0}
            .box{text-align:center;color:#6a8aaa}
            h1{color:#a78bfa;font-size:3rem}
          </style>
        </head>
        <body>
          <div class="box">
            <h1>Page Not Found</h1>
            <p>This link may have expired or been deleted.</p>
          </div>
        </body>
        </html>
      `);
    }
    
    if (new Date() > deployment.expiresAt) {
      deployment.active = false;
      await deployment.save();
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Expired</title>
          <style>
            body{background:#0a0a0f;display:flex;justify-content:center;align-items:center;height:100vh;font-family:'Inter',sans-serif;margin:0}
            .box{text-align:center;color:#6a8aaa}
            h1{color:#e74c5e;font-size:3rem}
          </style>
        </head>
        <body>
          <div class="box">
            <h1>Link Expired</h1>
            <p>This link has expired. Contact the owner for a new one.</p>
          </div>
        </body>
        </html>
      `);
    }
    
    res.send(deployment.pageHTML);
  } catch (error) {
    console.error('Subdomain error:', error);
    res.status(500).send('Server error');
  }
});

// ===== AUTO-DELETE EXPIRED =====
const { deleteExpiredDeployments } = require('./utils/deployPage');
cron.schedule('*/5 * * * *', () => {
  deleteExpiredDeployments();
});

// ===== CONNECT TO MONGODB =====
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.log('❌ MongoDB error:', err));

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
