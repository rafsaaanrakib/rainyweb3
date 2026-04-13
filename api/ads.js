// ===== RAINY - Simple Ads API =====
module.exports = (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST' && req.url === '/api/ads/reward') {
    const { nonce, view_duration, ad_zone } = req.body;
    
    // Simple validation
    if (!nonce || view_duration < 15) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }

    // Mock reward
    const rewardAmount = 0.50;
    const cooldownUntil = new Date(Date.now() + 180 * 1000).toISOString();

    return res.json({
      success: true,
      balance: rewardAmount,
      earned_today: rewardAmount,
      total_earned: rewardAmount,
      ads_watched: 1,
      ads_remaining_today: 19,
      cooldown_until: cooldownUntil,
      reward_amount: rewardAmount
    });
  }

  res.status(404).json({ success: false, message: 'Not found' });
};
