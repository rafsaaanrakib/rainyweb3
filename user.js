// ===== RAINY - routes/user.js =====
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { db } = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'rainy_jwt_secret_change_me';

// Middleware to verify JWT token
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// Get user profile and balance
router.get('/me', verifyToken, (req, res) => {
  try {
    const user = db.prepare('SELECT id, telegram_id, username, first_name, balance, total_earned, created_at FROM users WHERE telegram_id = ?')
      .get(req.user.telegramId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
        username: user.username,
        first_name: user.first_name,
        balance: user.balance,
        total_earned: user.total_earned,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('[User Error]', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get user transactions
router.get('/transactions', verifyToken, (req, res) => {
  try {
    const transactions = db.prepare(`
      SELECT id, type, amount, description, created_at 
      FROM transactions 
      WHERE user_id = (SELECT id FROM users WHERE telegram_id = ?)
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.user.telegramId);

    res.json({
      success: true,
      transactions
    });
  } catch (error) {
    console.error('[User Error]', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
