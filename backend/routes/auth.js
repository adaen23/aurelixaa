// ===== GENERATE API KEY (LIFETIME ONLY) =====
router.post('/generate-api-key', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user || user.plan !== 'lifetime') {
      return res.status(403).json({ error: 'API access requires Lifetime plan' });
    }
    
    const apiKey = crypto.randomBytes(32).toString('hex');
    user.apiKey = apiKey;
    await user.save();
    
    res.json({ success: true, apiKey });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== API KEY MIDDLEWARE =====
function checkApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  
  User.findOne({ apiKey }).then(user => {
    if (!user) return res.status(401).json({ error: 'Invalid API key' });
    req.user = user;
    next();
  }).catch(err => res.status(500).json({ error: err.message }));
}

// ===== API ENDPOINT (GET DEPLOYMENTS) =====
router.get('/api/deployments', checkApiKey, async (req, res) => {
  try {
    const deployments = await Deployment.find({ userId: req.user._id });
    res.json({ deployments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== API ENDPOINT (GET STATS) =====
router.get('/api/stats', checkApiKey, async (req, res) => {
  try {
    const deployments = await Deployment.find({ userId: req.user._id });
    let totalVisits = 0;
    deployments.forEach(d => totalVisits += (d.visits || 0));
    res.json({
      totalDeployments: deployments.length,
      totalVisits,
      deployments
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
