// ===== RAINY - Vercel Auth Function =====
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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

// Simple health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Login endpoint
app.post('/login', async (req, res) => {
  try {
    const { telegram_id, first_name, last_name, username, photo_url, init_data } = req.body;
    
    if (!telegram_id) {
      return res.status(400).json({ success: false, message: 'Missing telegram_id' });
    }

    // Simple JWT token for demo (in production, validate Telegram initData)
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: telegram_id, telegramId: telegram_id }, 
      process.env.JWT_SECRET || 'rainy_jwt_secret', 
      { expiresIn: '7d' }
    );

    res.json({ 
      success: true, 
      token,
      user: {
        id: telegram_id,
        telegram_id: telegram_id,
        first_name: first_name || 'User',
        last_name: last_name || '',
        username: username || '',
        photo_url: photo_url || '',
        balance: 0,
        total_earned: 0,
        ads_today: 0,
        ads_total: 0
      }
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Export for Vercel
module.exports = app;
