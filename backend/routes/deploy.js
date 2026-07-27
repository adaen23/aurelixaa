// ===== EXPORT DATA (CSV) =====
router.get('/export/:subdomain', checkToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || (user.plan !== 'pro' && user.plan !== 'elite' && user.plan !== 'lifetime')) {
      return res.status(403).json({ error: 'Upgrade to Pro or higher to export data' });
    }
    
    const deployment = await Deployment.findOne({ 
      subdomain: req.params.subdomain,
      userId: req.userId 
    });
    
    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }
    
    // Genereer CSV
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
    if (!user || (user.plan !== 'pro' && user.plan !== 'elite' && user.plan !== 'lifetime')) {
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
