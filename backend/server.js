const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const cron = require('node-cron');
const path = require('path');
const Deployment = require('./models/Deployment');

dotenv.config();

const app = express();

// ===== CORS =====
app.use(cors({
  origin: '*',
  credentials: true
}));

app.use(express.json());

// ===== SERVE STATIC FILES (HTML, CSS, JS) =====
app.use(express.static(path.join(__dirname, '../frontend')));

// ===== SERVE DEPLOYED PAGES (SUBDOMAIN ROUTE) =====
app.get('/:subdomain', async (req, res) => {
  try {
    const { subdomain } = req.params;
    
    // Skip API routes and static files
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

// ===== ROUTES =====
const authRoutes = require('./routes/auth');
const deployRoutes = require('./routes/deploy');
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhook');

app.use('/api/auth', authRoutes);
app.use('/api/deploy', deployRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/webhook', webhookRoutes);

// ===== AUTO-DELETE EXPIRED DEPLOYMENTS =====
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
