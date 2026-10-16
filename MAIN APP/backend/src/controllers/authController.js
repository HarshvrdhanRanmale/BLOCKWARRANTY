const authService = require('../services/authService');

exports.getNonce = async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'walletAddress is required in request body'
      });
    }

    const challenge = await authService.generateChallenge(walletAddress);
    return res.status(200).json({
      success: true,
      ...challenge
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

exports.verify = async (req, res) => {
  try {
    const { walletAddress, message, signature } = req.body;

    if (!walletAddress || !message || !signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: walletAddress, message, and signature must be provided'
      });
    }

    const result = await authService.verifySignature(walletAddress, message, signature);

    return res.status(200).json({
      success: true,
      token: result.token,
      user: result.user,
      isNewUser: result.isNewUser
    });
  } catch (err) {
    const status =
      err.message.includes('Signature mismatch') ||
      err.message.includes('No active authentication challenge')
        ? 401
        : 400;
    return res.status(status).json({
      success: false,
      error: err.message
    });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await authService.getUser(req.user.walletAddress);
    return res.status(200).json({
      success: true,
      user
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

exports.linkGoogleProfile = async (req, res) => {
  try {
    const { credential } = req.body;
    const user = await authService.linkGoogleProfile(req.user.walletAddress, credential);
    return res.status(200).json({ success: true, user, message: 'Google profile linked successfully' });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, error: err.message });
  }
};

exports.logout = (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
};
