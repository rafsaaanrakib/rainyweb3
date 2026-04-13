/* ===== RAINY MINI APP — app.js ===== */

// ─── CONFIG ─────────────────────────────────────────────
const CONFIG = {
  API_BASE: window.location.origin + '/api',  // Dynamic API URL
  REWARD_PER_AD: 0.50,
  AD_DURATION: 15,       // seconds user must watch
  COOLDOWN_SECONDS: 180, // 3 min between ads
  DAILY_LIMIT: 20,
  MONETAG_ZONE: '229482',  // New Monetag Zone ID
};

// ─── STATE ─────────────────────────────────────────────
const state = {
  tgUser: null,
  authToken: null,
  balance: 0,
  earnedToday: 0,
  totalEarned: 0,
  adsWatched: 0,
  adsRemainingToday: CONFIG.DAILY_LIMIT,
  transactions: [],
  cooldownEnd: null,
  adActive: false,
  adTimer: null,
  adSecondsLeft: CONFIG.AD_DURATION,
  adNonce: null,
  adStartTime: null,
  txPage: 0,
};

// ─── ANTI-FRAUD GUARDS ──────────────────────────────────
const fraud = {
  clickCount: 0,
  lastClickTime: 0,
  suspiciousActivity: false,

  checkSpam() {
    const now = Date.now();
    if (now - this.lastClickTime < 500) {
      this.clickCount++;
      if (this.clickCount > 3) {
        this.suspiciousActivity = true;
        showToast('⚠️ Suspicious activity detected', 'error');
        return true;
      }
    } else {
      this.clickCount = 0;
    }
    this.lastClickTime = now;
    return false;
  },

  checkCooldown() {
    if (!state.cooldownEnd) return false;
    return Date.now() < state.cooldownEnd;
  },

  checkDailyLimit() {
    return state.adsRemainingToday <= 0;
  },

  // Detect hidden tab / refresh farming
  visibilityViolation: false,
};

// Monitor page visibility during ad
document.addEventListener('visibilitychange', () => {
  if (state.adActive && document.hidden) {
    fraud.visibilityViolation = true;
    console.warn('[Rainy] Visibility violation during ad');
  }
});

// ─── TELEGRAM INIT ──────────────────────────────────────
function initTelegram() {
  console.log('[Rainy] Initializing Telegram...');
  
  // Check if Telegram WebApp is available
  if (typeof window.Telegram === 'undefined') {
    console.warn('[Rainy] Telegram SDK blocked or not loaded — using dev mode');
    state.tgUser = { 
      id: 99999, 
      first_name: 'Dev', 
      last_name: 'User',
      username: 'devuser' 
    };
    state.initData = '';
    initApp();
    return;
  }

  const tg = window.Telegram?.WebApp;
  if (!tg) {
    console.warn('[Rainy] Telegram WebApp not found — using dev mode');
    state.tgUser = { 
      id: 99999, 
      first_name: 'Dev', 
      last_name: 'User',
      username: 'devuser' 
    };
    state.initData = '';
    initApp();
    return;
  }

  try {
    tg.ready();
    tg.expand();

    // Set Telegram color scheme
    tg.setHeaderColor('#080d14');
    tg.setBackgroundColor('#080d14');

    // Handle safe area insets
    document.documentElement.style.setProperty(
      '--safe-bottom', (tg.safeAreaInset?.bottom || 0) + 'px'
    );

    const user = tg.initDataUnsafe?.user;
    if (!user) {
      console.warn('[Rainy] No Telegram user data — using dev mode');
      state.tgUser = { 
        id: 99999, 
        first_name: 'Dev', 
        last_name: 'User',
        username: 'devuser' 
      };
      state.initData = '';
    } else {
      state.tgUser = user;
      state.initData = tg.initData;
    }

    console.log('[Rainy] Telegram initialized successfully');
    initApp();
  } catch (error) {
    console.error('[Rainy] Error initializing Telegram:', error);
    // Fallback to dev mode
    state.tgUser = { 
      id: 99999, 
      first_name: 'Dev', 
      last_name: 'User',
      username: 'devuser' 
    };
    state.initData = '';
    initApp();
  }
}

// ─── APP INIT ───────────────────────────────────────────
async function initApp() {
  console.log('[Rainy] Starting app initialization...');
  
  try {
    updateUserUI();
    console.log('[Rainy] User UI updated');
  } catch (err) {
    console.error('[Rainy] Error updating user UI:', err);
  }

  try {
    console.log('[Rainy] Attempting login...');
    await loginUser();
    console.log('[Rainy] Login successful');
    
    console.log('[Rainy] Fetching user data...');
    await fetchUserData();
    console.log('[Rainy] User data fetched');
    
    renderTransactions();
    startCooldownCheck();
    console.log('[Rainy] App initialization complete');
  } catch (err) {
    console.error('[Rainy] Init error:', err);
    // Show UI with cached/zero data anyway
    updateBalanceUI();
  }

  // Hide loader, show app
  console.log('[Rainy] Hiding loader...');
  setTimeout(() => {
    const loader = document.getElementById('loader');
    const mainApp = document.getElementById('main-app');
    
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => {
        loader.style.display = 'none';
        if (mainApp) {
          mainApp.classList.remove('hidden');
          console.log('[Rainy] Main app shown');
        }
      }, 400);
    } else {
      console.error('[Rainy] Loader element not found');
    }
  }, 1200);
}

// ─── API CALLS ──────────────────────────────────────────
async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': state.authToken ? `Bearer ${state.authToken}` : '',
    'X-Telegram-Init-Data': state.initData || '',
  };

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const url = CONFIG.API_BASE + endpoint;
  console.log(`[Rainy] API Call: ${method} ${url}`, body ? { body } : '');
  
  try {
    const res = await fetch(url, options);
    console.log(`[Rainy] API Response: ${res.status} ${res.statusText}`);
    
    if (!res.ok) {
      const err = await res.text();
      console.error(`[Rainy] API Error: ${err}`);
      throw new Error(err || 'Request failed');
    }

    const data = await res.json();
    console.log(`[Rainy] API Data:`, data);
    return data;
  } catch (err) {
    console.error(`[Rainy] API Call Failed:`, err);
    throw err;
  }
}

async function loginUser() {
  try {
    const data = await apiCall('/auth/login', 'POST', {
      telegram_id: state.tgUser.id,
      first_name: state.tgUser.first_name,
      last_name: state.tgUser.last_name,
      username: state.tgUser.username,
      photo_url: state.tgUser.photo_url,
      init_data: state.initData,
    });

    state.authToken = data.token;
    localStorage.setItem('rainy_token', data.token);
  } catch (error) {
    console.log('[Rainy] API not available, using demo mode');
    // Generate a fake token for demo mode
    state.authToken = 'demo_token_' + Date.now();
    localStorage.setItem('rainy_token', state.authToken);
  }
}

async function fetchUserData() {
  try {
    const data = await apiCall('/user/me');
    applyUserData(data);
  } catch (error) {
    console.log('[Rainy] API not available, using demo mode');
    // Set default values for demo mode
    state.balance = 0;
    state.earnedToday = 0;
    state.totalEarned = 0;
    state.adsWatched = 0;
    state.adsRemainingToday = CONFIG.DAILY_LIMIT;
    state.transactions = [];
    updateBalanceUI();
    renderTransactions();
    updateWatchButton();
  }
}

function applyUserData(data) {
  state.balance         = data.balance || 0;
  state.earnedToday     = data.earned_today || 0;
  state.totalEarned     = data.total_earned || 0;
  state.adsWatched      = data.ads_watched || 0;
  state.adsRemainingToday = data.ads_remaining_today ?? CONFIG.DAILY_LIMIT;
  state.transactions    = data.recent_transactions || [];

  if (data.cooldown_until) {
    state.cooldownEnd = new Date(data.cooldown_until).getTime();
  }

  updateBalanceUI();
  renderTransactions();
  updateWatchButton();
}

// ─── UI UPDATES ──────────────────────────────────────────
function updateUserUI() {
  const u = state.tgUser;
  if (!u) return;
  const nameEl = document.getElementById('user-name');
  nameEl.textContent = u.first_name + (u.last_name ? ' ' + u.last_name : '');

  const avatarEl = document.getElementById('user-avatar');
  if (u.photo_url) {
    avatarEl.innerHTML = `<img src="${u.photo_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
  } else {
    avatarEl.textContent = (u.first_name || '?')[0].toUpperCase();
  }
}

function updateBalanceUI() {
  animateNumber('balance-val', state.balance, 2);
  animateNumber('earned-today', state.earnedToday, 2);
  animateNumber('total-earned', state.totalEarned, 2);
  document.getElementById('ads-watched').textContent = state.adsWatched;
  document.getElementById('wallet-bal').textContent = state.balance.toFixed(2);
  document.getElementById('ads-remaining').textContent = state.adsRemainingToday;
}

function animateNumber(id, target, decimals = 2) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = parseFloat(el.textContent) || 0;
  if (current === target) return;

  const diff = target - current;
  const steps = 30;
  let step = 0;

  const interval = setInterval(() => {
    step++;
    const val = current + (diff * (step / steps));
    el.textContent = val.toFixed(decimals);
    if (step >= steps) {
      clearInterval(interval);
      el.textContent = target.toFixed(decimals);
    }
  }, 16);
}

function updateWatchButton() {
  const btn = document.getElementById('watch-btn');
  const cooldownBar = document.getElementById('cooldown-bar');

  if (fraud.checkDailyLimit()) {
    btn.disabled = true;
    btn.querySelector('.btn-text').textContent = 'Daily limit reached';
    btn.querySelector('.btn-badge').textContent = 'Come back tomorrow';
    cooldownBar.classList.add('hidden');
    return;
  }

  if (fraud.checkCooldown()) {
    btn.disabled = true;
    btn.querySelector('.btn-text').textContent = 'Cooldown active';
    cooldownBar.classList.remove('hidden');
  } else {
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Watch Ad & Earn';
    btn.querySelector('.btn-badge').textContent = '+0.50 $RAINY';
    cooldownBar.classList.add('hidden');
  }
}

// ─── COOLDOWN TIMER ──────────────────────────────────────
function startCooldownCheck() {
  setInterval(() => {
    if (!state.cooldownEnd) return;

    const now = Date.now();
    const remaining = state.cooldownEnd - now;

    if (remaining <= 0) {
      state.cooldownEnd = null;
      updateWatchButton();
      return;
    }

    const totalCooldown = CONFIG.COOLDOWN_SECONDS * 1000;
    const elapsed = totalCooldown - remaining;
    const pct = Math.min((elapsed / totalCooldown) * 100, 100);

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    document.getElementById('cooldown-timer').textContent =
      `${mins}:${secs.toString().padStart(2, '0')}`;
    document.getElementById('cooldown-fill').style.width = pct + '%';

    updateWatchButton();
  }, 1000);
}

// ─── TRANSACTIONS ────────────────────────────────────────
function renderTransactions() {
  const list = document.getElementById('tx-list');
  if (!state.transactions.length) {
    list.innerHTML = '<div class="tx-empty">No transactions yet.<br>Watch your first ad to earn!</div>';
    return;
  }

  list.innerHTML = state.transactions.slice(0, 10).map(tx => `
    <div class="tx-item">
      <div class="tx-icon">💧</div>
      <div class="tx-details">
        <div class="tx-title">Ad Reward</div>
        <div class="tx-time">${formatTime(tx.created_at)}</div>
      </div>
      <div class="tx-amount">+${parseFloat(tx.amount).toFixed(2)} $RAINY</div>
    </div>
  `).join('');

  const loadMoreBtn = document.getElementById('load-more-btn');
  if (state.transactions.length > 10) {
    loadMoreBtn.classList.remove('hidden');
  } else {
    loadMoreBtn.classList.add('hidden');
  }
}

async function loadMoreTx() {
  state.txPage++;
  try {
    const data = await apiCall(`/user/transactions?page=${state.txPage}`);
    state.transactions = state.transactions.concat(data.transactions);
    renderTransactions();
  } catch (e) {
    showToast('Failed to load more', 'error');
  }
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return d.toLocaleDateString();
}

// ─── AD FLOW ─────────────────────────────────────────────
function watchAd() {
  // Anti-fraud checks
  if (fraud.checkSpam()) return;
  if (fraud.suspiciousActivity) {
    showToast('Account flagged. Contact support.', 'error');
    return;
  }
  if (fraud.checkCooldown()) {
    showToast('Please wait for cooldown to end', 'error');
    return;
  }
  if (fraud.checkDailyLimit()) {
    showToast('Daily ad limit reached', 'error');
    return;
  }

  // Generate nonce for server-side validation
  state.adNonce = generateNonce();
  state.adStartTime = Date.now();
  fraud.visibilityViolation = false;
  state.adActive = true;

  // Show overlay
  document.getElementById('ad-overlay').classList.remove('hidden');
  document.getElementById('ad-close-btn').classList.add('hidden');
  document.getElementById('ad-progress-fill').style.width = '0%';
  document.getElementById('ad-seconds').textContent = CONFIG.AD_DURATION;

  // Load Monetag ad (real integration)
  loadMonetagAd();

  // Start ad timer
  state.adSecondsLeft = CONFIG.AD_DURATION;
  let elapsed = 0;
  state.adTimer = setInterval(() => {
    elapsed++;
    state.adSecondsLeft--;
    const pct = (elapsed / CONFIG.AD_DURATION) * 100;
    document.getElementById('ad-progress-fill').style.width = pct + '%';
    document.getElementById('ad-seconds').textContent = state.adSecondsLeft;

    if (elapsed >= CONFIG.AD_DURATION) {
      clearInterval(state.adTimer);
      onAdTimerComplete();
    }
  }, 1000);
}

function loadMonetagAd() {
  const container = document.getElementById('monetag-ad-container');
  container.innerHTML = `<div class="ad-placeholder"><div class="ad-placeholder-icon">???</div><div>Loading ad network...</div></div>`;

  console.log('[Rainy] Loading ad for zone:', CONFIG.MONETAG_ZONE);
  
  // Clear container for ad to render into
  container.innerHTML = '';

  let adReadyTimeout = setTimeout(() => {
    console.warn('[Rainy] No ad network responded in 5 seconds, showing fallback.');
    showFallbackAd();
  }, 5000);

  const callbacks = {
    onReady: () => {
      clearTimeout(adReadyTimeout);
      console.log('[Rainy] Ad ready - displaying now');
      showToast('Real ad loaded!', 'success');
    },
    onComplete: () => {
      clearTimeout(adReadyTimeout);
      console.log('[Rainy] Ad completed - REWARD EARNED!');
      clearInterval(state.adTimer);
      onAdTimerComplete(true);
    },
    onError: (err) => {
      clearTimeout(adReadyTimeout);
      console.error('[Rainy] Ad error:', err);
      showFallbackAd();
    }
  };

  // Try multiple ad networks
  try {
    // Try Monetag first
    if (window.adNetworks && window.adNetworks.monetag && window.adNetworks.monetag.loaded) {
      console.log('[Rainy] Trying Monetag...');
      if (window.adNetworks.monetag.showAd(container, callbacks)) {
        return;
      }
    }

    // Try Propeller Ads as fallback
    if (window.adNetworks && window.adNetworks.propeller && window.adNetworks.propeller.loaded) {
      console.log('[Rainy] Trying Propeller Ads...');
      if (window.adNetworks.propeller.showAd(container, callbacks)) {
        return;
      }
    }

    // Try direct Monetag methods
    if (window.monetag && window.monetag.showAd) {
      console.log('[Rainy] Using direct Monetag API...');
      window.monetag.showAd({
        zoneId: parseInt(CONFIG.MONETAG_ZONE),
        container: container,
        type: 'interstitial',
        ...callbacks
      });
      return;
    }

    // Try zone-specific function
    if (typeof window.show_10871393 === 'function') {
      console.log('[Rainy] Using zone-specific function...');
      window.show_10871393({
        type: 'inApp',
        container: container,
        ...callbacks
      });
      return;
    }

    // No ad networks available
    console.log('[Rainy] No ad networks available, using demo');
    clearTimeout(adReadyTimeout);
    showFallbackAd();

  } catch (error) {
    clearTimeout(adReadyTimeout);
    console.error('[Rainy] Error loading ad:', error);
    showFallbackAd();
  }
}

function showFallbackAd() {
  const container = document.getElementById('monetag-ad-container');
  
  // Check if we're on localhost or a live domain
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  container.innerHTML = `
    <div class="ad-placeholder">
      <div class="ad-placeholder-icon">???</div>
      <div style="font-weight:600;color:#60D9F9;">Demo Ad</div>
      <div>Please wait for the countdown to complete</div>
      <div style="font-size:11px;opacity:0.6;margin-top:8px;">
        [Monetag zone ${CONFIG.MONETAG_ZONE}]<br>
        ${isLocalhost 
          ? '<span style="color: #ffa500; font-weight: bold;">Localhost - Real ads need live domain</span>' 
          : '<span style="color: #ffa500; font-weight: bold;">SDK loading - Real ads may take time...</span>'
        }<br>
        <span style="color: #60D9F9;">Current domain: ${window.location.hostname}</span>
      </div>
      ${!isLocalhost ? `
        <button onclick="testMonetagFunction()" style="margin-top: 10px; padding: 5px 10px; background: #60D9F9; border: none; border-radius: 5px; color: white; font-size: 11px; cursor: pointer;">
          Test Monetag Function
        </button>
      ` : ''}
    </div>
  `;
}

// Test function for debugging
function testMonetagFunction() {
  console.log('[Rainy] Testing Monetag function...');
  console.log('window.monetag:', typeof window.monetag);
  console.log('window.show_10871393:', typeof window.show_10871393);
  console.log('window.monetagQueue:', window.monetagQueue);
  
  const container = document.getElementById('monetag-ad-container');
  container.innerHTML = '';
  
  // Try Method 1
  if (window.monetag && window.monetag.showAd) {
    console.log('Testing window.monetag.showAd...');
    window.monetag.showAd({
      zoneId: parseInt(CONFIG.MONETAG_ZONE),
      container: container,
      type: 'interstitial',
      onReady: () => console.log('TEST: Ad ready'),
      onComplete: () => console.log('TEST: Ad completed'),
      onError: (err) => console.error('TEST: Ad error:', err)
    });
  }
  // Try Method 2
  else if (typeof window.show_10871393 === 'function') {
    console.log('Testing window.show_10871393...');
    window.show_10871393({
      type: 'inApp',
      container: container,
      onReady: () => console.log('TEST: Ad ready'),
      onComplete: () => console.log('TEST: Ad completed'),
      onError: (err) => console.error('TEST: Ad error:', err)
    });
  }
  // Try Method 3
  else if (window.monetagQueue) {
    console.log('Testing monetagQueue...');
    window.monetagQueue.push(['showAd', {
      zoneId: parseInt(CONFIG.MONETAG_ZONE),
      container: container,
      type: 'interstitial'
    }]);
  }
  else {
    console.error('No Monetag method available for testing');
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#ff6b6b;">No Monetag SDK found</div>';
  }
}

function onAdTimerComplete(monetagConfirmed = false) {
  // Show collect button only if no visibility fraud
  if (fraud.visibilityViolation) {
    showToast('Ad view invalid — tab was hidden', 'error');
    closeAdOverlay();
    return;
  }

  document.getElementById('ad-close-btn').classList.remove('hidden');
}

async function adCompleted() {
  if (!state.adActive) return;

  const viewDuration = Math.floor((Date.now() - state.adStartTime) / 1000);

  // Final anti-fraud: must have watched at least AD_DURATION seconds
  if (viewDuration < CONFIG.AD_DURATION - 1) {
    showToast('Invalid ad view detected', 'error');
    closeAdOverlay();
    return;
  }

  if (fraud.visibilityViolation) {
    showToast('Ad view invalid', 'error');
    closeAdOverlay();
    return;
  }

  try {
    const result = await apiCall('/ads/reward', 'POST', {
      nonce: state.adNonce,
      view_duration: viewDuration,
      ad_zone: CONFIG.MONETAG_ZONE,
    });

    if (result.success) {
      // Update state
      state.balance         = result.balance;
      state.earnedToday     = result.earned_today;
      state.totalEarned     = result.total_earned;
      state.adsWatched      = result.ads_watched;
      state.adsRemainingToday = result.ads_remaining_today;
      state.cooldownEnd     = Date.now() + (CONFIG.COOLDOWN_SECONDS * 1000);

      if (result.transaction) {
        state.transactions.unshift(result.transaction);
      }

      closeAdOverlay();
      updateBalanceUI();
      renderTransactions();

      // Pulse effect
      document.getElementById('balance-val').classList.add('pulse-green');
      setTimeout(() => document.getElementById('balance-val').classList.remove('pulse-green'), 600);

      showToast('🎉 +0.50 $RAINY earned!', 'success');
      updateWatchButton();
    } else {
      showToast(result.message || 'Reward failed', 'error');
      closeAdOverlay();
    }
  } catch (err) {
    showToast('Server error. Try again.', 'error');
    closeAdOverlay();
    console.error('[Rainy] Reward error:', err);
  }
}

function skipAd() {
  if (state.adTimer) clearInterval(state.adTimer);
  closeAdOverlay();
  showToast('Ad skipped — no reward earned');
}

function closeAdOverlay() {
  state.adActive = false;
  if (state.adTimer) clearInterval(state.adTimer);
  document.getElementById('ad-overlay').classList.add('hidden');
  document.getElementById('ad-close-btn').classList.add('hidden');
}

// ─── WALLET ──────────────────────────────────────────────
async function requestWithdrawal() {
  const address = document.getElementById('wallet-address').value.trim();
  const amount = parseFloat(document.getElementById('withdraw-amount').value);

  if (!address) { showToast('Enter a wallet address', 'error'); return; }
  if (!amount || amount < 10) { showToast('Minimum withdrawal: 10 $RAINY', 'error'); return; }
  if (amount > state.balance) { showToast('Insufficient balance', 'error'); return; }

  try {
    const result = await apiCall('/wallet/withdraw', 'POST', { address, amount });
    showToast('✅ Withdrawal request submitted!', 'success');
    document.getElementById('wallet-address').value = '';
    document.getElementById('withdraw-amount').value = '';
  } catch (err) {
    showToast(err.message || 'Withdrawal failed', 'error');
  }
}

// ─── NAVIGATION ──────────────────────────────────────────
function showSection(section) {
  document.getElementById('home-section').classList.add('hidden');
  document.getElementById('history-section').classList.add('hidden');
  document.getElementById('wallet-section').classList.add('hidden');

  document.getElementById('nav-home').classList.remove('active');
  document.getElementById('nav-history').classList.remove('active');
  document.getElementById('nav-wallet').classList.remove('active');

  if (section === 'home') {
    document.getElementById('home-section').classList.remove('hidden');
    document.getElementById('nav-home').classList.add('active');
  } else if (section === 'history') {
    document.getElementById('history-section').classList.remove('hidden');
    document.getElementById('nav-history').classList.add('active');
  } else if (section === 'wallet') {
    document.getElementById('wallet-section').classList.remove('hidden');
    document.getElementById('nav-wallet').classList.add('active');
    document.getElementById('wallet-bal').textContent = state.balance.toFixed(2);
  }
}

// ─── TOAST ──────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

// ─── UTILS ──────────────────────────────────────────────
function generateNonce() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── BOOT ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', initTelegram);
