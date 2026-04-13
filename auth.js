// ===== RAINY — routes/auth.js =====
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { db, getSetting } = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'rainy_jwt_secret_change_me';
const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN || '';

// ─── VALIDATE TELEGRAM initData ──────────────────────────
function validateTelegramInitData(initData) {
  if (!initData || !BOT_TOKEN) return true; // skip in dev

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Check hash matches
    if (expectedHash !== hash) return false;

    // Check timestamp (must be within 5 minutes)
    const authDate = parseInt(params.get('auth_date'));
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 300) return false;

    return true;
  } catch {
    return false;
  }
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { telegram_id, first_name, last_name, username, photo_url, init_data } = req.body;

  if (!telegram_id) {
    return res.status(400).json({ success: false, message: 'Missing telegram_id' });
  }

  // Validate Telegram initData signature
  if (BOT_TOKEN && !validateTelegramInitData(init_data)) {
    return res.status(401).json({ success: false, message: 'Invalid Telegram auth' });
  }

  // Upsert user
  const existing = await db.get('SELECT * FROM users WHERE telegram_id = ?', [String(telegram_id)]);

  if (existing) {
    if (existing.banned) {
      return res.status(403).json({ success: false, message: 'Account banned. Contact support.' });
    }
    // Update last_seen and profile
    await db.run(`
      UPDATE users SET first_name=?, last_name=?, username=?, photo_url=?, last_seen=CURRENT_TIMESTAMP
      WHERE telegram_id=?
    `, [first_name, last_name, username, photo_url, String(telegram_id)]);
  } else {
    // New user
    await db.run(`
      INSERT INTO users (telegram_id, first_name, last_name, username, photo_url)
      VALUES (?, ?, ?, ?, ?)
    `, [String(telegram_id), first_name, last_name, username, photo_url]);
  }

  const user = await db.get('SELECT * FROM users WHERE telegram_id = ?', [String(telegram_id)]);
  const token = jwt.sign({ userId: user.id, telegramId: user.telegram_id }, JWT_SECRET, { expiresIn: '7d' });

  res.json({ success: true, token });
});

// Middleware to verify JWT token
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.get('SELECT * FROM users WHERE id = ?', [decoded.userId]);
    
    if (!user || user.banned) {
      return res.status(401).json({ success: false, message: 'Invalid token or user banned' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// Middleware to verify admin JWT token
async function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'No admin token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_ADMIN_SECRET);
    const admin = await db.get('SELECT * FROM admin_users WHERE id = ?', [decoded.adminId]);
    
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid admin token' });
    }
    
    req.admin = admin;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid admin token' });
  }
}

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.requireAdmin = requireAdmin;
