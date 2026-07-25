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
    
    if (!deployment) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Not Found</title>
        <style>body{background:#f0f8ff;display:flex;justify-content:center;align-items:center;height:100vh;font-family:'Segoe UI',sans-serif;margin:0}
        .box{text-align:center;color:#6a8aaa}
        h1{color:#1a5a8c;font-size:3rem}
        </style></head>
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
        <head><title>Expired</title>
        <style>body{background:#f0f8ff;display:flex;justify-content:center;align-items:center;height:100vh;font-family:'Segoe UI',sans-serif;margin:0}
        .box{text-align:center;color:#6a8aaa}
        h1{color:#e74c3c;font-size:3rem}
        </style></head>
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
    console.error(error);
    res.status(500).send('Server error');
  }
});

// ===== ROUTES =====
const authRoutes = require('./routes/auth');
const deployRoutes = require('./routes/deploy');
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhook');

app.use('/api/auth', authRoutes);
app.use('/api/deploy', deployRoutes);
app.use('/api/admin', adminRoutes);
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

app.listen(process.env.PORT, () => {
  console.log(`🚀 Server running on port ${process.env.PORT}`);
});
