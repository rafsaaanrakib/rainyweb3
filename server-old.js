// ===== RAINY BACKEND — server.js =====
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const app = express();

// ─── MIDDLEWARE ─────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
}));
app.use(express.json());
app.use(morgan('combined'));

// Global rate limiting
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 60,               // 60 requests per minute per IP
  standardHeaders: true,
  message: { success: false, message: 'Too many requests' },
}));

// Ad reward endpoint — stricter limit
app.use('/api/ads/reward', rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: 'Rate limit exceeded for ad rewards' },
}));

// ─── SERVE STATIC FILES ──────────────────────────────────
app.use(express.static(path.join(__dirname)));
app.use('/admin', express.static(path.join(__dirname)));

// ─── ROUTES ─────────────────────────────────────────────
app.use('/api/auth',   require('./auth'));
app.use('/api/user',   require('./user'));
app.use('/api/ads',    require('./ads'));
app.use('/api/wallet', require('./wallet'));
app.use('/api/admin',  require('./admin'));

// ─── HEALTH CHECK ────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ─── 404 FALLBACK ────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));

// ─── ERROR HANDLER ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Rainy Error]', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ─── START ───────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌧️  Rainy API running on port ${PORT}`);
});

module.exports = app;
