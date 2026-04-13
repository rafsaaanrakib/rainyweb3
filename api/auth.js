// ===== RAINY - Simple Auth API =====
module.exports = (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST' && req.url === '/api/auth/login') {
    const { telegram_id, first_name, last_name, username, photo_url } = req.body;
    
    // Simple JWT token (in production, use proper JWT)
    const token = Buffer.from(JSON.stringify({
      userId: telegram_id,
      telegramId: telegram_id,
      exp: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
    })).toString('base64');

    return res.json({
      success: true,
      token,
      user: {
        id: telegram_id,
        telegram_id: telegram_id,
        first_name: first_name || 'User',
        last_name: last_name || '',
        username: username || '',
        photo_url: photo_url || '',
        balance: 0,
        total_earned: 0,
        ads_today: 0,
        ads_total: 0
      }
    });
  }

  res.status(404).json({ success: false, message: 'Not found' });
};
