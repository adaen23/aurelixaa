const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  plan: { type: String, default: 'free' },
  role: { type: String, default: 'user' },
  dailyDeploys: { type: Number, default: 0 },
  lastDeployDate: { type: String, default: '' },
  webhook: { type: String, default: '' },
  discord: { type: String, required: true },
  lastIp: { type: String, default: '' },
  totalVisits: { type: Number, default: 0 },
  blacklisted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
