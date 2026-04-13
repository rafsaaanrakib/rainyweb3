# 🌧️ Rainy — Telegram Mini App

Earn **$RAINY** by watching short ads. A full Telegram Web App with anti-fraud protection, Monetag integration, and an admin panel.

---

## 📁 Folder Structure

```
rainy/
├── frontend/             # Telegram Mini App UI
│   ├── index.html        # Main app page
│   ├── css/style.css     # Dark theme styles
│   └── js/app.js         # App logic, Monetag, Telegram SDK
├── admin/
│   └── index.html        # Admin panel (standalone)
└── backend/              # Node.js API
    ├── server.js          # Express entry point
    ├── package.json
    ├── .env.example       # Config template
    ├── models/
    │   └── database.js    # SQLite schema & helpers
    ├── middleware/
    │   └── auth.js        # JWT auth middleware
    └── routes/
        ├── auth.js        # Telegram login
        ├── user.js        # Profile & balance
        ├── ads.js         # Ad reward + anti-fraud
        ├── wallet.js      # Withdrawals
        └── admin.js       # Admin API
```

---

## 🚀 Quick Setup

### 1. Create a Telegram Bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram
2. Send `/newbot` and follow prompts
3. Save your **Bot Token**
4. Send `/newapp` to create a Web App for your bot
5. Set your Web App URL to your deployed frontend URL

### 2. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your values

npm install
npm run setup     # Initialize database
npm start         # Start server (port 3000)
```

**Production (with PM2):**
```bash
npm install -g pm2
pm2 start server.js --name rainy
pm2 save
```

### 3. Frontend Setup

Edit `frontend/js/app.js` — update `CONFIG`:

```javascript
const CONFIG = {
  API_BASE: 'https://your-api-domain.com/api',  // ← Your backend URL
  MONETAG_ZONE: 'YOUR_MONETAG_ZONE_ID',          // ← From Monetag dashboard
  // ...
};
```

### 4. HTTPS Hosting

**Option A: VPS with Nginx + Certbot**
```nginx
server {
    server_name your-rainy-app.com;
    root /var/www/rainy/frontend;
    index index.html;

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /admin {
        alias /var/www/rainy/admin;
    }
}
```
Then: `certbot --nginx -d your-rainy-app.com`

**Option B: Railway / Render / Fly.io**
- Deploy backend as Node.js service
- Serve frontend as static files (or use Vercel/Netlify)

### 5. Register Mini App with BotFather

```
/setmenubutton  →  set URL to https://your-rainy-app.com
/setdomain      →  add your domain for Web App
```

---

## 📺 Monetag Integration

### Step 1: Sign up at [monetag.com](https://monetag.com)

### Step 2: Create a Rewarded Ad Zone
- Go to **Sites → Add Site**
- Add your domain
- Create a zone: **Rewarded Interstitial** (best for Telegram Mini Apps)
- Note your **Zone ID**

### Step 3: Add SDK to `frontend/index.html`

Uncomment and update:
```html
<script src="https://cdn.monetag.com/sdk.js" data-zone="YOUR_ZONE_ID" async></script>
```

### Step 4: Activate rewarded flow in `frontend/js/app.js`

In the `loadMonetagAd()` function, uncomment the Monetag block:

```javascript
if (typeof window.show_monetag === 'function') {
  window.show_monetag({
    type: 'rewarded',
    zone: CONFIG.MONETAG_ZONE,
    onReady: () => { /* ad rendered */ },
    onComplete: () => {
      clearInterval(state.adTimer);
      onAdTimerComplete(true);
    },
    onClose: () => {
      if (!state.adCompleted) skipAd();
    }
  });
  return;
}
```

### Monetag Compliance Notes
- ✅ Ad triggered only by user tap ("Watch Ad" button)
- ✅ Reward only after confirmed completion callback
- ✅ No auto-redirects, hidden ads, or deceptive UI
- ✅ Daily limits prevent abuse
- ✅ Cooldown between ads

---

## 🛡️ Anti-Fraud Features

| Protection | Implementation |
|---|---|
| Nonce validation | Each ad view generates unique nonce; replays rejected |
| Min watch time | Server validates `view_duration >= 15s` |
| Rate limiting | Express rate limiter: 5 reward requests/min/IP |
| Daily limit | 20 ads/user/day (configurable) |
| Cooldown | 3 min between ads (configurable) |
| Visibility check | Tab-switch during ad = invalid view |
| Spam clicks | Client-side click rate detection |
| IP monitoring | Logs high-frequency IPs (soft block) |
| Auto-ban | Fraud score auto-bans after threshold |

---

## 🔧 Admin Panel

Access at: `https://your-domain.com/admin`

Default credentials:
- Username: `admin`
- Password: `rainy_admin_2024` ← **Change this in `.env`!**

**Admin features:**
- Dashboard with live stats
- User management (search, view, ban/unban)
- All transaction logs with fraud flags
- Withdrawal request management (approve/reject)
- Fraud event logs with auto-ban controls
- Platform settings (reward amount, limits, cooldowns)

---

## 📡 API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | None | Telegram login |
| GET | `/api/user/me` | JWT | User profile + balance |
| GET | `/api/user/transactions` | JWT | Reward history |
| POST | `/api/ads/reward` | JWT | Claim ad reward |
| POST | `/api/wallet/withdraw` | JWT | Request withdrawal |
| GET | `/api/wallet/withdrawals` | JWT | Withdrawal history |
| POST | `/api/admin/login` | None | Admin login |
| GET | `/api/admin/stats` | Admin | Platform statistics |
| GET | `/api/admin/users` | Admin | User list |
| GET | `/api/admin/transactions` | Admin | All transactions |
| PATCH | `/api/admin/settings` | Admin | Update settings |

---

## ⚙️ Configuration (Admin Panel → Settings)

| Setting | Default | Description |
|---|---|---|
| `reward_per_ad` | 0.50 | $RAINY per completed ad |
| `daily_limit` | 20 | Max ads per user per day |
| `cooldown_seconds` | 180 | Seconds between ads |
| `min_watch_seconds` | 15 | Minimum valid view time |
| `auto_ban_threshold` | 5 | Fraud score to auto-ban |
| `min_withdrawal` | 10 | Minimum $RAINY to withdraw |
| `withdrawals_enabled` | false | Toggle withdrawals on/off |

---

## 🔒 Security Checklist

- [ ] Change `ADMIN_PASSWORD` in `.env`
- [ ] Set strong `JWT_SECRET` (64+ random chars)
- [ ] Set correct `TELEGRAM_BOT_TOKEN`
- [ ] Use HTTPS only
- [ ] Set `ALLOWED_ORIGINS` to your domain
- [ ] Restrict admin panel to trusted IPs (via Nginx)
- [ ] Enable Telegram initData validation in production

---

## 📦 Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS + Telegram Web App SDK
- **Backend**: Node.js + Express
- **Database**: SQLite via better-sqlite3 (swap to PostgreSQL for scale)
- **Auth**: JWT + Telegram initData HMAC validation
- **Ads**: Monetag Rewarded Interstitial

---

## **Deploy to Vercel**

### **Quick Deploy:**

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Ready for Vercel deployment"
   git branch -M main
   git remote add origin https://github.com/rafsaaanrakib/rainyweb3.git
   git push -u origin main
   ```

2. **Deploy on Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repo
   - Add Environment Variables:
     - `TELEGRAM_BOT_TOKEN`: Your bot token
     - `JWT_SECRET`: Random 64-char string
     - `MONETAG_ZONE_ID`: `10871393`
     - `ADMIN_PASSWORD`: Your admin password
   - Click "Deploy"

3. **Update Monetag Dashboard:**
   - Add your Vercel domain to allowed domains
   - Test real ads on live site

### **Environment Variables for Vercel:**
```
NODE_ENV=production
PORT=3000
TELEGRAM_BOT_TOKEN=your_bot_token
JWT_SECRET=your_random_64_char_string
ADMIN_PASSWORD=your_admin_password
MONETAG_ZONE_ID=10871393
ALLOWED_ORIGINS=https://your-domain.vercel.app,https://t.me
```

**Your app will be live and showing real Monetag ads!**
