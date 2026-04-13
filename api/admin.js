// ===== RAINY - Vercel Admin Function =====
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

// Simple admin login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === 'admin' && password === (process.env.ADMIN_PASSWORD || 'rainy_admin_2024')) {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { adminId: 1, username: 'admin' }, 
      process.env.JWT_SECRET || 'rainy_jwt_secret', 
      { expiresIn: '7d' }
    );
    
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// Export for Vercel
module.exports = app;
