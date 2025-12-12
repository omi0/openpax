const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { 
  authenticateToken,
  rateLimitAPI,
  rateLimitStrict
} = require('../middleware/authMiddleware');
const {
  xssProtection,
  sqlInjectionProtection,
  requireJSON,
  preventParameterPollution,
  sanitizeSettingsUpdate
} = require('../middleware/sanitization');

router.use(xssProtection);
router.use(sqlInjectionProtection);
router.use(preventParameterPollution);
router.use(sanitizeSettingsUpdate);

// ============================================================================
// PUBLIC ROUTES
// ============================================================================

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * @route   GET /api/settings/health
 * @desc    Check settings service health
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Settings service is running',
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// PROTECTED ROUTES 
// ============================================================================


/**
 * @route   GET /api/settings/:id
 * @desc    Get all configuration settings for a specific restaurant
 * @access  Private (Requires restaurant membership)
 */
router.get(
  '/:id',
  authenticateToken,
  rateLimitAPI,
  settingsController.getSettings
);

/**
 * @route   PATCH /api/settings/:id
 * @desc    Update configuration settings
 * @access  Private (Requires manager or owner role)
 */
router.patch(
  '/:id',
  requireJSON,
  authenticateToken,
  rateLimitAPI,
  settingsController.updateSettings
);


// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler for undefined routes
router.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Settings endpoint not found',
    code: 'ROUTE_NOT_FOUND'
  });
});

// Error handler
router.use((err, req, res, next) => {
  console.error('Settings route error:', err);
  
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