const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { 
  authenticateToken,
  requireEmailVerification,
  rateLimitLogin,
  rateLimitPasswordReset,
  rateLimitRegister,
  rateLimitStrict,
  rateLimitAPI
} = require('../middleware/authMiddleware');
const {
  sanitizeRegistration,
  sanitizeLogin,
  sanitizePasswordChange,
  sanitizePasswordReset,
  sanitizeToken,
  xssProtection,
  sqlInjectionProtection,
  requireJSON,
  preventParameterPollution
} = require('../middleware/sanitization');

// Apply general security middleware to all routes
router.use(xssProtection);
router.use(sqlInjectionProtection);
router.use(preventParameterPollution);

// ============================================================================
// PUBLIC ROUTES
// ============================================================================

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  requireJSON,
  rateLimitRegister,
  sanitizeRegistration,
  authController.register
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user and receive tokens
 * @access  Public
 */
router.post(
  '/login',
  requireJSON,
  rateLimitLogin,
  sanitizeLogin,
  authController.login
);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh access token using refresh token
 * @access  Public (requires valid refresh token in cookie)
 */
router.post(
  '/refresh-token',
  rateLimitAPI,
  authController.refreshToken
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user and revoke refresh token
 * @access  Public (clears cookies regardless of auth status)
 */
router.post(
  '/logout',
  authController.logout
);

/**
 * @route   POST /api/auth/password-reset/request
 * @desc    Request password reset email
 * @access  Public
 */
router.post(
  '/password-reset/request',
  requireJSON,
  rateLimitPasswordReset,
  sanitizePasswordReset,
  authController.requestPasswordReset
);

/**
 * @route   POST /api/auth/password-reset/reset
 * @desc    Reset password using token
 * @access  Public
 */
router.post(
  '/password-reset/reset',
  requireJSON,
  rateLimitStrict,
  sanitizeToken,
  authController.resetPassword
);

/**
 * @route   POST /api/auth/verify-email
 * @desc    Verify email address with token
 * @access  Public
 */
router.post(
  '/verify-email',
  requireJSON,
  rateLimitAPI,
  sanitizeToken,
  authController.verifyEmail
);

/**
 * @route   GET /api/auth/verify-email/:token
 * @desc    Verify email address with token (GET alternative for email links)
 * @access  Public
 */
router.get(
  '/verify-email/:token',
  rateLimitAPI,
  sanitizeToken,
  authController.verifyEmail
);

// ============================================================================
// PROTECTED ROUTES
// ============================================================================

/**
 * @route   GET /api/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get(
  '/profile',
  authenticateToken,
  rateLimitAPI,
  authController.getProfile
);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put(
  '/profile',
  requireJSON,
  authenticateToken,
  rateLimitAPI,
  authController.updateProfile
);

/**
 * @route   POST /api/auth/change-password
 * @desc    Change password for authenticated user
 * @access  Private
 */
router.post(
  '/change-password',
  requireJSON,
  authenticateToken,
  rateLimitStrict,
  sanitizePasswordChange,
  authController.changePassword
);

/**
 * @route   GET /api/auth/sessions
 * @desc    Get all active sessions for current user
 * @access  Private
 */
router.get(
  '/sessions',
  authenticateToken,
  rateLimitAPI,
  authController.getSessions
);

/**
 * @route   DELETE /api/auth/sessions/:sessionId
 * @desc    Revoke a specific session by ID
 * @access  Private
 */
router.delete(
  '/sessions/:sessionId',
  authenticateToken,
  rateLimitStrict,
  authController.revokeSession
);

/**
 * @route   POST /api/auth/sessions/revoke-all
 * @desc    Revoke all sessions for current user
 * @access  Private
 */
router.post(
  '/sessions/revoke-all',
  authenticateToken,
  rateLimitStrict,
  authController.revokeAllSessions
);

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * @route   GET /api/auth/health
 * @desc    Check auth service health
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Auth service is running',
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler for undefined routes
router.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    code: 'ROUTE_NOT_FOUND'
  });
});

// Error handler
router.use((err, req, res, next) => {
  console.error('Auth route error:', err);
  
  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'An error occurred processing your request' 
    : err.message;
  
  res.status(err.status || 500).json({
    success: false,
    message,
    code: 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

module.exports = router;