const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Deployment = require('../models/Deployment');
const { generateDeployedPage } = require('../utils/deployPage');
const router = express.Router();

router.get('/my', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const deployments = await Deployment.find({ userId: decoded.userId, active: true }).sort({ createdAt: -1 });
    res.json({ deployments });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

router.post('/new', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.webhook) {
      return res.status(400).json({ error: 'Please set your Discord webhook first' });
    }

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

    let hours = 1;
    if (user.plan === 'pro') hours = 24;
    if (user.plan === 'elite') hours = 48;
    if (user.plan === 'lifetime') hours = 9999;

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + hours);

    const subdomain = `${crypto.randomBytes(4).toString('hex')}-${user._id.toString().slice(-6)}`;
    const url = `https://${subdomain}.${process.env.DOMAIN}`;

    const pageHTML = generateDeployedPage(user.webhook, subdomain);

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
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:subdomain', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { subdomain } = req.params;
    const deployment = await Deployment.findOne({ subdomain });
    if (!deployment) return res.status(404).json({ error: 'Not found' });
    if (deployment.userId.toString() !== decoded.userId) {
      return res.status(403).json({ error: 'Not yours' });
    }
    deployment.active = false;
    await deployment.save();
    res.json({ success: true, message: 'Deployment deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
