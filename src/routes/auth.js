const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { 
  authenticateToken, 
  rateLimitLogin, 
  rateLimitPasswordReset,
  rateLimitRegister 
} = require('../middleware/authMiddleware');

// Public routes
router.post('/register', rateLimitRegister, authController.register);
router.post('/login', rateLimitLogin, authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);
router.post('/password-reset/request', rateLimitPasswordReset, authController.requestPasswordReset);
router.post('/password-reset/reset', authController.resetPassword);
router.post('/verify-email', authController.verifyEmail);

// Protected routes
router.post('/change-password', authenticateToken, authController.changePassword);

module.exports = router;