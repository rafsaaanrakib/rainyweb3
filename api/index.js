// ===== RAINY - Vercel Serverless Function =====
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');

// Import routes
const authRoutes = require('../auth');
const userRoutes = require('../user');
const adsRoutes = require('../ads');
const walletRoutes = require('../wallet');
const adminRoutes = require('../admin');

const app = express();

// Initialize database on first request
let dbInitialized = false;
async function initDatabase() {
  if (!dbInitialized) {
    try {
      await require('../database').initializeDatabase();
      dbInitialized = true;
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Database initialization failed:', error);
    }
  }
}

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
}));
app.use(express.json());
app.use(morgan('combined'));

// Rate limiting
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  message: { success: false, message: 'Too many requests' },
}));

app.use('/api/ads/reward', rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: 'Rate limit exceeded for ad rewards' },
}));

// Initialize database before handling requests
app.use(async (req, res, next) => {
  await initDatabase();
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// 404 handler
app.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error('[Rainy Error]', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// Export for Vercel
module.exports = app;
