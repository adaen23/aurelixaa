const mongoose = require('mongoose');

const DeploymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subdomain: { type: String, required: true, unique: true },
  url: { type: String, required: true },
  webhook: { type: String, required: true },
  pageHTML: { type: String, required: true },
  visits: { type: Number, default: 0 },
  ips: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  active: { type: Boolean, default: true }
});

module.exports = mongoose.model('Deployment', DeploymentSchema);
