// ===== RAINY - Vercel Ads Function =====
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

// Rate limiting for ads
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: 'Rate limit exceeded for ad rewards' },
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

// Reward endpoint
app.post('/reward', requireAuth, async (req, res) => {
  try {
    const { nonce, view_duration, ad_zone } = req.body;
    
    // Simple validation
    if (!nonce || nonce.length < 16) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }

    if (!view_duration || view_duration < 15) {
      return res.status(400).json({ success: false, message: 'Ad not fully watched' });
    }

    // Mock reward for demo
    const rewardAmount = 0.50;
    const cooldownUntil = new Date(Date.now() + 180 * 1000).toISOString();

    res.json({
      success: true,
      balance: rewardAmount,
      earned_today: rewardAmount,
      total_earned: rewardAmount,
      ads_watched: 1,
      ads_remaining_today: 19,
      cooldown_until: cooldownUntil,
      reward_amount: rewardAmount
    });
  } catch (error) {
    console.error('Ads error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Export for Vercel
module.exports = app;
