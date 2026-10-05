const authService = require('../services/authService');

function authenticate(req, res, next) {
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

    req.user = {
      walletAddress: decoded.walletAddress
    };

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: err.message || 'Unauthorized: Token validation failed'
    });
  }
}

module.exports = {
  authenticate
};
