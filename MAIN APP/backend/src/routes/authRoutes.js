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
router.patch('/profile', authenticate, authController.updateProfile);
router.post('/profile', authenticate, authController.updateProfile);

module.exports = router;
