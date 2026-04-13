// ===== RAINY — database.js =====
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../rainy.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── SCHEMA ─────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id     TEXT UNIQUE NOT NULL,
    first_name      TEXT,
    last_name       TEXT,
    username        TEXT,
    photo_url       TEXT,
    balance         REAL DEFAULT 0,
    total_earned    REAL DEFAULT 0,
    ads_today       INTEGER DEFAULT 0,
    ads_total       INTEGER DEFAULT 0,
    last_ad_at      DATETIME,
    last_ad_reset   DATE,
    cooldown_until  DATETIME,
    banned          INTEGER DEFAULT 0,
    ban_reason      TEXT,
    fraud_score     INTEGER DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen       DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    telegram_id     TEXT NOT NULL,
    amount          REAL NOT NULL,
    type            TEXT NOT NULL DEFAULT 'ad_reward',
    nonce           TEXT UNIQUE,
    ad_zone         TEXT,
    ip_address      TEXT,
    user_agent      TEXT,
    view_duration   INTEGER,
    valid           INTEGER DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    telegram_id     TEXT NOT NULL,
    wallet_address  TEXT NOT NULL,
    amount          REAL NOT NULL,
    status          TEXT DEFAULT 'pending',
    tx_hash         TEXT,
    processed_at    DATETIME,
    notes           TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS fraud_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER,
    telegram_id     TEXT,
    event_type      TEXT NOT NULL,
    details         TEXT,
    ip_address      TEXT,
    user_agent      TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS used_nonces (
    nonce           TEXT PRIMARY KEY,
    user_id         INTEGER,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key             TEXT PRIMARY KEY,
    value           TEXT,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_tx_user      ON transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_tx_created   ON transactions(created_at);
  CREATE INDEX IF NOT EXISTS idx_users_tgid   ON users(telegram_id);
  CREATE INDEX IF NOT EXISTS idx_fraud_user   ON fraud_logs(user_id);
`);

// ─── DEFAULT SETTINGS ────────────────────────────────────
const defaultSettings = {
  reward_per_ad:       '0.50',
  daily_limit:         '20',
  cooldown_seconds:    '180',
  min_watch_seconds:   '15',
  rate_limit_per_hour: '30',
  auto_ban_threshold:  '5',
  min_withdrawal:      '10',
  withdrawals_enabled: 'false',
  monetag_zone:        '',
  monetag_format:      'rewarded',
};

const insertSetting = db.prepare(
  'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
);
for (const [k, v] of Object.entries(defaultSettings)) {
  insertSetting.run(k, v);
}

// ─── DEFAULT ADMIN ───────────────────────────────────────
const bcrypt = require('bcryptjs');
const defaultAdminExists = db.prepare(
  'SELECT id FROM admin_users WHERE username = ?'
).get('admin');

if (!defaultAdminExists) {
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'rainy_admin_2024', 10);
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run('admin', hash);
  console.log('[Rainy] Default admin created: admin / rainy_admin_2024');
}

// ─── HELPERS ────────────────────────────────────────────
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
    .run(key, String(value));
}

module.exports = { db, getSetting, setSetting };
