// ===== RAINY — routes/ads.js =====
const express = require('express');
const router = express.Router();
const { db, getSetting } = require('./database');
const auth = require('./auth');
const { requireAuth } = auth;

// ─── ANTI-FRAUD ENGINE ───────────────────────────────────
function logFraud(userId, telegramId, eventType, details, ip, ua) {
  db.prepare(`
    INSERT INTO fraud_logs (user_id, telegram_id, event_type, details, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, String(telegramId), eventType, details, ip, ua);

  // Increment fraud score
  db.prepare('UPDATE users SET fraud_score = fraud_score + 1 WHERE id = ?').run(userId);

  // Auto-ban if threshold exceeded
  const autoban = parseInt(getSetting('auto_ban_threshold')) || 5;
  const user = db.prepare('SELECT fraud_score FROM users WHERE id = ?').get(userId);
  if (user && user.fraud_score >= autoban) {
    db.prepare("UPDATE users SET banned=1, ban_reason='Auto-banned: fraud threshold exceeded' WHERE id=?").run(userId);
    console.warn(`[Rainy] User ${telegramId} auto-banned (fraud score: ${user.fraud_score})`);
  }
}

// POST /api/ads/reward
router.post('/reward', requireAuth, (req, res) => {
  const user = req.user;
  const { nonce, view_duration, ad_zone } = req.body;
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const ua = req.headers['user-agent'] || '';

  // ── 1. BANNED CHECK ─────────────────────────────────────
  if (user.banned) {
    return res.status(403).json({ success: false, message: 'Account is banned' });
  }

  // ── 2. NONCE VALIDATION (prevent replay attacks) ─────────
  if (!nonce || nonce.length < 16) {
    logFraud(user.id, user.telegram_id, 'invalid_nonce', 'Missing or short nonce', ip, ua);
    return res.status(400).json({ success: false, message: 'Invalid request' });
  }

  const usedNonce = db.prepare('SELECT nonce FROM used_nonces WHERE nonce = ?').get(nonce);
  if (usedNonce) {
    logFraud(user.id, user.telegram_id, 'replay_attack', `Duplicate nonce: ${nonce}`, ip, ua);
    return res.status(400).json({ success: false, message: 'Duplicate reward request' });
  }

  // ── 3. MIN WATCH DURATION CHECK ──────────────────────────
  const minWatch = parseInt(getSetting('min_watch_seconds')) || 15;
  if (!view_duration || view_duration < minWatch - 1) {
    logFraud(user.id, user.telegram_id, 'short_view', `Duration: ${view_duration}s (min: ${minWatch}s)`, ip, ua);
    return res.status(400).json({ success: false, message: 'Ad not fully watched' });
  }

  // ── 4. COOLDOWN CHECK ────────────────────────────────────
  const cooldownSecs = parseInt(getSetting('cooldown_seconds')) || 180;
  if (user.cooldown_until && new Date(user.cooldown_until) > new Date()) {
    return res.status(429).json({
      success: false,
      message: 'Cooldown active',
      cooldown_until: user.cooldown_until,
    });
  }

  // ── 5. DAILY LIMIT CHECK ─────────────────────────────────
  const dailyLimit = parseInt(getSetting('daily_limit')) || 20;
  const today = new Date().toISOString().slice(0, 10);

  // Reset daily counter if new day
  if (user.last_ad_reset !== today) {
    db.prepare('UPDATE users SET ads_today=0, last_ad_reset=? WHERE id=?').run(today, user.id);
    user.ads_today = 0;
  }

  if (user.ads_today >= dailyLimit) {
    return res.status(429).json({ success: false, message: 'Daily limit reached' });
  }

  // ── 6. DUPLICATE IP CHECK (soft — log but don't block) ───
  const recentFromIP = db.prepare(`
    SELECT COUNT(*) as cnt FROM transactions
    WHERE ip_address = ? AND created_at > datetime('now', '-10 minutes') AND valid = 1
  `).get(ip);

  if (recentFromIP && recentFromIP.cnt > 10) {
    logFraud(user.id, user.telegram_id, 'ip_abuse', `IP ${ip} submitted ${recentFromIP.cnt} rewards in 10min`, ip, ua);
    // Note: not blocking, just logging — same IP can mean shared network
  }

  // ── 7. REWARD AMOUNT ─────────────────────────────────────
  const rewardAmount = parseFloat(getSetting('reward_per_ad')) || 0.50;

  // ── 8. RECORD NONCE ──────────────────────────────────────
  db.prepare('INSERT INTO used_nonces (nonce, user_id) VALUES (?, ?)').run(nonce, user.id);

  // ── 9. UPDATE USER & INSERT TRANSACTION ──────────────────
  const cooldownUntil = new Date(Date.now() + cooldownSecs * 1000).toISOString();

  db.prepare(`
    UPDATE users SET
      balance = balance + ?,
      total_earned = total_earned + ?,
      ads_today = ads_today + 1,
      ads_total = ads_total + 1,
      last_ad_at = CURRENT_TIMESTAMP,
      cooldown_until = ?,
      last_ad_reset = ?
    WHERE id = ?
  `).run(rewardAmount, rewardAmount, cooldownUntil, today, user.id);

  const txResult = db.prepare(`
    INSERT INTO transactions (user_id, telegram_id, amount, type, nonce, ad_zone, ip_address, user_agent, view_duration, valid)
    VALUES (?, ?, ?, 'ad_reward', ?, ?, ?, ?, ?, 1)
  `).run(user.id, String(user.telegram_id), rewardAmount, nonce, ad_zone || '', ip, ua, view_duration);

  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  const earnedToday = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM transactions
    WHERE user_id = ? AND DATE(created_at) = DATE('now') AND valid = 1
  `).get(user.id)?.total || 0;

  const newTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txResult.lastInsertRowid);
  const adsRemainingToday = Math.max(0, dailyLimit - updatedUser.ads_today);

  res.json({
    success: true,
    balance: updatedUser.balance,
    earned_today: earnedToday,
    total_earned: updatedUser.total_earned,
    ads_watched: updatedUser.ads_total,
    ads_remaining_today: adsRemainingToday,
    cooldown_until: cooldownUntil,
    transaction: newTx,
    reward: rewardAmount,
  });
});

module.exports = router;
