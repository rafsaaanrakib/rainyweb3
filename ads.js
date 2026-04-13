// ===== RAINY — routes/ads.js =====
const express = require('express');
const router = express.Router();
const { get, run, getSetting } = require('./database');
const auth = require('./auth');
const { requireAuth } = auth;

// ─── ANTI-FRAUD ENGINE ───────────────────────────────────
async function logFraud(userId, telegramId, eventType, details, ip, ua) {
  await run(`
    INSERT INTO fraud_logs (user_id, telegram_id, event_type, details, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [userId, String(telegramId), eventType, details, ip, ua]);

  // Increment fraud score
  await run('UPDATE users SET fraud_score = fraud_score + 1 WHERE id = ?', [userId]);

  // Auto-ban if threshold exceeded
  const autoban = parseInt(await getSetting('auto_ban_threshold')) || 5;
  const user = await get('SELECT fraud_score FROM users WHERE id = ?', [userId]);
  if (user && user.fraud_score >= autoban) {
    await run("UPDATE users SET banned=1, ban_reason='Auto-banned: fraud threshold exceeded' WHERE id=?", [userId]);
    console.warn(`[Rainy] User ${telegramId} auto-banned (fraud score: ${user.fraud_score})`);
  }
}

// POST /api/ads/reward
router.post('/reward', requireAuth, async (req, res) => {
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

  const usedNonce = await get('SELECT nonce FROM used_nonces WHERE nonce = ?', [nonce]);
  if (usedNonce) {
    logFraud(user.id, user.telegram_id, 'replay_attack', `Duplicate nonce: ${nonce}`, ip, ua);
    return res.status(400).json({ success: false, message: 'Duplicate reward request' });
  }

  // ── 3. MIN WATCH DURATION CHECK ──────────────────────────
  const minWatch = parseInt(await getSetting('min_watch_seconds')) || 15;
  if (!view_duration || view_duration < minWatch - 1) {
    logFraud(user.id, user.telegram_id, 'short_view', `Duration: ${view_duration}s (min: ${minWatch}s)`, ip, ua);
    return res.status(400).json({ success: false, message: 'Ad not fully watched' });
  }

  // ── 4. COOLDOWN CHECK ────────────────────────────────────
  const cooldownSecs = parseInt(await getSetting('cooldown_seconds')) || 180;
  const lastAd = await get('SELECT last_ad_at, ads_today, last_ad_reset, cooldown_until FROM users WHERE id = ?', [user.id]);
  const now = new Date();
  const cooldownEnd = lastAd?.cooldown_until ? new Date(lastAd.cooldown_until) : null;
  if (cooldownEnd && now < cooldownEnd) {
    const remaining = Math.ceil((cooldownEnd - now) / 1000);
    return res.status(429).json({ success: false, message: `Please wait ${remaining}s`, remaining });
  }

  // Reset daily counter if needed
  const today = now.toISOString().split('T')[0];
  if (lastAd?.last_ad_reset !== today) {
    await run('UPDATE users SET ads_today = 0, last_ad_reset = ? WHERE id = ?', [today, user.id]);
    user.ads_today = 0;
  }

  // Check daily limit
  const dailyLimit = parseInt(await getSetting('daily_ad_limit')) || 20;
  if (user.ads_today >= dailyLimit) {
    return res.status(429).json({ success: false, message: 'Daily ad limit reached' });
  }

  // Record transaction
  await run(`
    INSERT INTO transactions (user_id, type, amount, description, created_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [user.id, 'reward', CONFIG.REWARD_PER_AD, `Ad reward - zone ${ad_zone}`]);

  // Update user stats
  await run(`
    UPDATE users SET balance = balance + ?, total_earned = total_earned + ?, 
                   ads_today = ads_today + 1, ads_total = ads_total + 1, 
                   last_ad_at = CURRENT_TIMESTAMP, cooldown_until = datetime('now', '+${CONFIG.COOLDOWN_SECONDS} seconds')
    WHERE id = ?
  `, [CONFIG.REWARD_PER_AD, CONFIG.REWARD_PER_AD, user.id]);

  // ── 5. DUPLICATE IP CHECK (soft — log but don't block)
  const recentFromIP = await get(`
    SELECT COUNT(*) as cnt FROM transactions
    WHERE ip_address = ? AND created_at > datetime('now', '-10 minutes') AND valid = 1
  `, [ip]);

  if (recentFromIP && recentFromIP.cnt > 10) {
    logFraud(user.id, user.telegram_id, 'ip_abuse', `IP ${ip} submitted ${recentFromIP.cnt} rewards in 10min`, ip, ua);
    // Note: not blocking, just logging — same IP can mean shared network
  }

  // ── 6. REWARD AMOUNT ─────────────────────────────────────
  const rewardAmount = parseFloat(await getSetting('reward_per_ad')) || 0.50;

  // ── 8. RECORD NONCE ──────────────────────────────────────
  await run('INSERT INTO used_nonces (nonce, user_id) VALUES (?, ?)', [nonce, user.id]);

  // Update user & insert transaction
  const cooldownUntil = new Date(Date.now() + cooldownSecs * 1000).toISOString();

  await run(`
    UPDATE users SET
      balance = balance + ?,
      total_earned = total_earned + ?,
      ads_today = ads_today + 1,
      ads_total = ads_total + 1,
      last_ad_at = CURRENT_TIMESTAMP,
      cooldown_until = ?
    WHERE id = ?
  `, [rewardAmount, rewardAmount, cooldownUntil, user.id]);

  await run(`
    INSERT INTO transactions (user_id, type, amount, description, created_at, valid, ip_address, user_agent)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 1, ?, ?)
  `, [user.id, 'reward', rewardAmount, `Ad reward - zone ${ad_zone}`, ip, ua]);

  const updatedUser = await get('SELECT * FROM users WHERE id = ?', [user.id]);
  const earnedToday = await get(`
    SELECT COALESCE(SUM(amount), 0) as total FROM transactions
    WHERE user_id = ? AND DATE(created_at) = DATE('now') AND valid = 1
  `, [user.id])?.total || 0;

  const newTx = await get('SELECT * FROM transactions ORDER BY id DESC LIMIT 1');
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
