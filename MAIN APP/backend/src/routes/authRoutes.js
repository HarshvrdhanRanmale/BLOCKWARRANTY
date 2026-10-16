const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Public endpoints
router.post('/nonce', authController.getNonce);
router.post('/verify', authController.verify);
router.post('/logout', authController.logout);

// Protected endpoints
router.get('/me', authenticate, authController.getMe);
router.post('/google-profile', authenticate, authController.linkGoogleProfile);

module.exports = router;
