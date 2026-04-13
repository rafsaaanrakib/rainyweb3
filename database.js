// ===== RAINY - database.js =====
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../rainy.db');
const db = new sqlite3.Database(DB_PATH);

// Enable WAL mode for better performance
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');

// Initialize database schema
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Users table
      db.run(`
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
          last_seen       DATETIME,
          created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Transactions table
      db.run(`
        CREATE TABLE IF NOT EXISTS transactions (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id     INTEGER NOT NULL,
          type        TEXT NOT NULL,
          amount      REAL NOT NULL,
          description TEXT,
          created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);

      // Fraud logs table
      db.run(`
        CREATE TABLE IF NOT EXISTS fraud_logs (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id     INTEGER,
          telegram_id TEXT,
          event_type  TEXT NOT NULL,
          details     TEXT,
          ip_address TEXT,
          user_agent  TEXT,
          created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Settings table
      db.run(`
        CREATE TABLE IF NOT EXISTS settings (
          key    TEXT PRIMARY KEY,
          value  TEXT NOT NULL
        )
      `);

      // Admin users table
      db.run(`
        CREATE TABLE IF NOT EXISTS admin_users (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          username       TEXT UNIQUE NOT NULL,
          password_hash  TEXT NOT NULL,
          created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Insert default settings
      const defaultSettings = [
        ['withdrawals_enabled', 'false'],
        ['daily_ad_limit', '20'],
        ['reward_per_ad', '0.50'],
        ['ad_duration', '15'],
        ['cooldown_seconds', '180']
      ];

      const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
      defaultSettings.forEach(([key, value]) => {
        insertSetting.run(key, value);
      });

      // Create default admin user
      const bcrypt = require('bcryptjs');
      const defaultAdminPassword = process.env.ADMIN_PASSWORD || 'rainy_admin_2024';
      const passwordHash = bcrypt.hashSync(defaultAdminPassword, 10);

      db.run('INSERT OR IGNORE INTO admin_users (username, password_hash) VALUES (?, ?)', 
        ['admin', passwordHash]);

      resolve();
    });
  });
}

// Helper functions
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Settings functions
async function getSetting(key) {
  const row = await get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : null;
}

async function setSetting(key, value) {
  await run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

// Initialize database on first run
initializeDatabase().catch(console.error);

module.exports = {
  db,
  query,
  run,
  get,
  getSetting,
  setSetting
};
