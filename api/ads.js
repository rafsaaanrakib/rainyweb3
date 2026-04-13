// ===== RAINY - Vercel Ads Function =====
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import ads routes
const adsRoutes = require('../ads');
const { requireAuth } = require('../auth');

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

// Initialize database before handling requests
app.use(async (req, res, next) => {
  try {
    const { initializeDatabase } = require('../database');
    await initializeDatabase();
    next();
  } catch (error) {
    console.error('Database initialization failed:', error);
    res.status(500).json({ success: false, message: 'Database initialization failed' });
  }
});

// Routes
app.use('/', adsRoutes);

// Export for Vercel
module.exports = app;
