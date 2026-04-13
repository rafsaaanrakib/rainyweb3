// ===== RAINY - Vercel User Function =====
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
}));
app.use(express.json());

// Rate limiting
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  message: { success: false, message: 'Too many requests' },
}));

// Simple auth middleware
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'rainy_jwt_secret');
    req.user = { id: decoded.userId, telegram_id: decoded.telegramId };
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// Profile endpoint
app.get('/profile', requireAuth, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      telegram_id: req.user.telegram_id,
      first_name: 'User',
      last_name: '',
      username: 'user',
      photo_url: '',
      balance: 0,
      total_earned: 0,
      ads_today: 0,
      ads_total: 0,
      last_ad_at: null,
      cooldown_until: null
    }
  });
});

// Export for Vercel
module.exports = app;
