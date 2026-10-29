const authService = require('../services/authService');
const User = require('../models/User');

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header missing or malformed. Expected Bearer token.'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = authService.verifyToken(token);

    let userName = '';
    try {
      const userDoc = await User.findOne({
        walletAddress: String(decoded.walletAddress || '').toLowerCase()
      }).lean();
      if (userDoc?.name) {
        userName = userDoc.name.trim();
      }
    } catch (_) {}

    req.user = {
      walletAddress: decoded.walletAddress,
      role: decoded.role || 'user',
      name: userName
    };

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: err.message || 'Unauthorized: Token validation failed'
    });
  }
}

function requireSupplier(req, res, next) {
  if (req.user && req.user.role === 'supplier') {
    return next();
  }
  return res.status(403).json({
    success: false,
    error: 'Access denied: Verified supplier account required.'
  });
}

module.exports = {
  authenticate,
  requireSupplier
};
