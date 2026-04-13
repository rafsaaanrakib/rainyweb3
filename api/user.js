// ===== RAINY - Simple User API =====
module.exports = (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET' && req.url === '/api/user/me') {
    // Simple mock user data (in production, decode JWT and fetch from DB)
    return res.json({
      success: true,
      user: {
        id: 99999,
        telegram_id: 99999,
        first_name: 'Demo',
        last_name: 'User',
        username: 'demo',
        photo_url: '',
        balance: 0,
        total_earned: 0,
        ads_today: 0,
        ads_total: 0,
        ads_remaining_today: 20,
        cooldown_until: null
      }
    });
  }

  res.status(404).json({ success: false, message: 'Not found' });
};
