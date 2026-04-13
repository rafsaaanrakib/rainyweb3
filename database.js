// ===== RAINY - database.js =====
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Use /tmp for Vercel serverless environment
const DB_PATH = process.env.NODE_ENV === 'production' 
  ? '/tmp/rainy.db' 
  : (process.env.DB_PATH || path.join(__dirname, '../rainy.db'));

let db;

// Initialize database connection
function getDatabase() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH);
    // Enable WAL mode for better performance
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA foreign_keys = ON');
  }
  return db;
}

// Initialize database schema
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
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

      // Used nonces table
      db.run(`
        CREATE TABLE IF NOT EXISTS used_nonces (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          nonce       TEXT UNIQUE NOT NULL,
          user_id     INTEGER NOT NULL,
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

      for (const [key, value] of defaultSettings) {
        db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [key, value]);
      }

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
  query: (sql, params = []) => new Promise((resolve, reject) => {
    getDatabase().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  }),
  run: (sql, params = []) => new Promise((resolve, reject) => {
    getDatabase().run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  }),
  get: (sql, params = []) => new Promise((resolve, reject) => {
    getDatabase().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  }),
  getSetting,
  setSetting
};
