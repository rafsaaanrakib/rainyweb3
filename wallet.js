// ===== RAINY — routes/wallet.js =====
const express = require('express');
const router = express.Router();
const { db, getSetting } = require('./database');
const auth = require('./auth');
const { requireAuth } = auth;

// POST /api/wallet/withdraw
router.post('/withdraw', requireAuth, (req, res) => {
  const { address, amount } = req.body;
  const user = req.user;

  const wdEnabled = getSetting('withdrawals_enabled');
  if (wdEnabled !== 'true') {
    return res.status(400).json({ success: false, message: 'Withdrawals not yet enabled. Coming soon!' });
  }

  const minWd = parseFloat(getSetting('min_withdrawal')) || 10;
  if (!amount || amount < minWd) {
    return res.status(400).json({ success: false, message: `Minimum withdrawal: ${minWd} $RAINY` });
  }
  if (amount > user.balance) {
    return res.status(400).json({ success: false, message: 'Insufficient balance' });
  }
  if (!address || address.length < 10) {
    return res.status(400).json({ success: false, message: 'Invalid wallet address' });
  }

  // Check for pending withdrawal
  const pending = db.prepare(
    "SELECT id FROM withdrawal_requests WHERE user_id = ? AND status = 'pending'"
  ).get(user.id);
  if (pending) {
    return res.status(400).json({ success: false, message: 'You already have a pending withdrawal request' });
  }

  // Deduct balance and create request
  db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amount, user.id);
  const result = db.prepare(`
    INSERT INTO withdrawal_requests (user_id, telegram_id, wallet_address, amount)
    VALUES (?, ?, ?, ?)
  `).run(user.id, String(user.telegram_id), address, amount);

  res.json({ success: true, message: 'Withdrawal request submitted', request_id: result.lastInsertRowid });
});

// GET /api/wallet/withdrawals
router.get('/withdrawals', requireAuth, (req, res) => {
  const requests = db.prepare(
    'SELECT * FROM withdrawal_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
  ).all(req.user.id);
  res.json({ success: true, withdrawals: requests });
});

module.exports = router;
