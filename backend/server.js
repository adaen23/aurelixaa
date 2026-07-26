const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const cron = require('node-cron');
const Deployment = require('./models/Deployment');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ===== SERVE DEPLOYED PAGES =====
app.get('/:subdomain', async (req, res) => {
  try {
    const { subdomain } = req.params;
    const deployment = await Deployment.findOne({ subdomain, active: true });
    if (!deployment) return res.status(404).send('Page not found');
    if (new Date() > deployment.expiresAt) {
      deployment.active = false;
      await deployment.save();
      return res.status(404).send('Page expired');
    }
    res.send(deployment.pageHTML);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

// ===== ROUTES =====
const authRoutes = require('./routes/auth');
const deployRoutes = require('./routes/deploy');
const adminRoutes = require('./routes/admin');   // <-- Zorg dat dit er is!
const webhookRoutes = require('./routes/webhook');

app.use('/api/auth', authRoutes);
app.use('/api/deploy', deployRoutes);
app.use('/api/admin', adminRoutes);              // <-- Zorg dat dit er is!
app.use('/api/webhook', webhookRoutes);

// ===== AUTO-DELETE EXPIRED =====
const { deleteExpiredDeployments } = require('./utils/deployPage');
cron.schedule('* * * * *', () => {
  deleteExpiredDeployments();
});

// ===== CONNECT TO MONGODB =====
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.log('❌ MongoDB error:', err));

app.listen(process.env.PORT || 3000, () => {
  console.log(`🚀 Server running on port ${process.env.PORT || 3000}`);
});
