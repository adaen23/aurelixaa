const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
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
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

router.get('/my', checkToken, async (req, res) => {
  try {
    const deployments = await Deployment.find({ userId: req.userId, active: true }).sort({ createdAt: -1 });
    res.json({ deployments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/new', checkToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.blacklisted) return res.status(403).json({ error: 'Account blacklisted' });
    if (!user.webhook) return res.status(400).json({ error: 'Set Discord webhook first' });

    const today = new Date().toDateString();
    const dailyLimit = user.plan === 'pro' ? 10 : user.plan === 'elite' ? 50 : user.plan === 'lifetime' ? 999 : 2;

    if (user.lastDeployDate === today && user.dailyDeploys >= dailyLimit) {
      return res.status(429).json({ error: 'Daily limit reached', limit: dailyLimit, used: user.dailyDeploys });
    }

    const hours = user.plan === 'pro' ? 24 : user.plan === 'elite' ? 48 : user.plan === 'lifetime' ? 9999 : 1;
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
      expiresIn: `${hours} hour${hours > 1 ? 's' : ''}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:subdomain', checkToken, async (req, res) => {
  try {
    const deployment = await Deployment.findOne({ subdomain: req.params.subdomain });
    if (!deployment) return res.status(404).json({ error: 'Not found' });
    if (deployment.userId.toString() !== req.userId) return res.status(403).json({ error: 'Not yours' });

    deployment.active = false;
    await deployment.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
