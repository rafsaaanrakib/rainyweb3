// ===== RAINY — routes/admin.js =====
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db, getSetting, setSetting } = require('./database');
const auth = require('./auth');
const { requireAdmin } = auth;

const JWT_ADMIN_SECRET = (process.env.JWT_SECRET || 'rainy_jwt_secret_change_me') + '_admin';

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
  const token = jwt.sign({ adminId: admin.id, username: admin.username }, JWT_ADMIN_SECRET, { expiresIn: '8h' });
  res.json({ success: true, token });
});

// GET /api/admin/stats
router.get('/stats', requireAdmin, (req, res) => {
  const total_users = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const new_users_today = db.prepare("SELECT COUNT(*) as c FROM users WHERE DATE(created_at) = DATE('now')").get().c;
  const total_rainy_distributed = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM transactions WHERE valid=1").get().s;
  const ads_watched_today = db.prepare("SELECT COUNT(*) as c FROM transactions WHERE DATE(created_at)=DATE('now') AND valid=1").get().c;
  const flagged_accounts = db.prepare('SELECT COUNT(*) as c FROM users WHERE fraud_score > 0 OR banned = 1').get().c;
  const pending_withdrawals = db.prepare("SELECT COUNT(*) as c FROM withdrawal_requests WHERE status='pending'").get().c;
  const active_users_today = db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM transactions WHERE DATE(created_at)=DATE('now')").get().c;

  const recent_transactions = db.prepare(`
    SELECT t.*, u.username, u.first_name FROM transactions t
    JOIN users u ON t.user_id = u.id
    ORDER BY t.created_at DESC LIMIT 10
  `).all();

  res.json({
    success: true, total_users, new_users_today, total_rainy_distributed,
    ads_watched_today, flagged_accounts, pending_withdrawals, active_users_today,
    recent_transactions,
  });
});

// GET /api/admin/users
router.get('/users', requireAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const search = req.query.search || '';
  const limit = 20;
  const offset = (page - 1) * limit;

  const where = search ? `WHERE telegram_id LIKE ? OR first_name LIKE ? OR username LIKE ?` : '';
  const params = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

  const users = db.prepare(`SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) as c FROM users ${where}`).get(...params).c;

  res.json({ success: true, users, total, page });
});

// POST /api/admin/users/:id/ban
router.post('/users/:id/ban', requireAdmin, (req, res) => {
  const { banned } = req.body;
  db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(banned ? 1 : 0, req.params.id);
  res.json({ success: true });
});

// GET /api/admin/transactions
router.get('/transactions', requireAdmin, (req, res) => {
  const transactions = db.prepare(`
    SELECT t.*, u.username, u.first_name FROM transactions t
    JOIN users u ON t.user_id = u.id
    ORDER BY t.created_at DESC LIMIT 100
  `).all();
  res.json({ success: true, transactions });
});

// GET /api/admin/withdrawals
router.get('/withdrawals', requireAdmin, (req, res) => {
  const withdrawals = db.prepare(`
    SELECT w.*, u.username, u.first_name FROM withdrawal_requests w
    JOIN users u ON w.user_id = u.id
    ORDER BY w.created_at DESC
  `).all();
  res.json({ success: true, withdrawals });
});

// PATCH /api/admin/withdrawals/:id
router.patch('/withdrawals/:id', requireAdmin, (req, res) => {
  const { status, tx_hash, notes } = req.body;
  db.prepare(`
    UPDATE withdrawal_requests SET status=?, tx_hash=?, notes=?, processed_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(status, tx_hash || null, notes || null, req.params.id);

  // If rejected, refund balance
  if (status === 'rejected') {
    const wd = db.prepare('SELECT * FROM withdrawal_requests WHERE id = ?').get(req.params.id);
    if (wd) db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(wd.amount, wd.user_id);
  }
  res.json({ success: true });
});

// GET /api/admin/fraud-logs
router.get('/fraud-logs', requireAdmin, (req, res) => {
  const logs = db.prepare('SELECT * FROM fraud_logs ORDER BY created_at DESC LIMIT 200').all();
  res.json({ success: true, logs });
});

// GET /api/admin/settings
router.get('/settings', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json({ success: true, ...settings });
});

// PATCH /api/admin/settings
router.patch('/settings', requireAdmin, (req, res) => {
  for (const [key, value] of Object.entries(req.body)) {
    setSetting(key, value);
  }
  res.json({ success: true });
});

module.exports = router;
