const express = require('express');
const router = express.Router();
const restaurantController = require('../controllers/restaurantController');
const { 
  authenticateToken,
  rateLimitAPI,
  rateLimitStrict
} = require('../middleware/authMiddleware');
const {
  sanitizeRestaurantCreation,
  sanitizeRestaurantUpdate,
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
 * @route   GET /api/restaurant/public/:slug
 * @desc    Get restaurant public info by slug (for booking widget)
 * @access  Public
 */
router.get(
  '/public/:slug',
  rateLimitAPI,
  restaurantController.getRestaurantBySlug
);

// ============================================================================
// PROTECTED ROUTES - Require authentication
// ============================================================================

/**
 * @route   POST /api/restaurant/create
 * @desc    Create a new restaurant
 * @access  Private
 */
router.post(
  '/create',
  requireJSON,
  authenticateToken,
  rateLimitStrict,
  sanitizeRestaurantCreation,
  restaurantController.createRestaurant
);

/**
 * @route   GET /api/restaurant/list
 * @desc    Get all restaurants for authenticated user
 * @access  Private
 */
router.get(
  '/list',
  authenticateToken,
  rateLimitAPI,
  restaurantController.getUserRestaurants
);

/**
 * @route   GET /api/restaurant/:id
 * @desc    Get specific restaurant details
 * @access  Private (requires membership)
 */
router.get(
  '/:id',
  authenticateToken,
  rateLimitAPI,
  restaurantController.getRestaurant
);

/**
 * @route   PUT /api/restaurant/:id
 * @desc    Update restaurant details
 * @access  Private (requires manager or owner role)
 */
router.put(
  '/:id',
  requireJSON,
  authenticateToken,
  rateLimitAPI,
  sanitizeRestaurantUpdate,
  restaurantController.updateRestaurant
);

/**
 * @route   DELETE /api/restaurant/:id
 * @desc    Deactivate restaurant
 * @access  Private (requires owner role)
 */
router.delete(
  '/:id',
  authenticateToken,
  rateLimitStrict,
  restaurantController.deactivateRestaurant
);

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * @route   GET /api/restaurant/health
 * @desc    Check restaurant service health
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Restaurant service is running',
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
    message: 'Restaurant endpoint not found',
    code: 'ROUTE_NOT_FOUND'
  });
});

// Error handler
router.use((err, req, res, next) => {
  console.error('Restaurant route error:', err);
  
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