const express = require('express');
const router = express.Router();
const restaurantController = require('../controllers/restaurantController');
const orarioController = require('../controllers/orarioController');
const tableController = require('../controllers/tableController');
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
 * @route   GET /api/restaurants/public/:slug
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



// ============================================================================
// Restaurant routes such as creating a restaurant, updating its settings...
// ============================================================================

/**
 * @route   POST /api/restaurants/create
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
 * @route   GET /api/restaurants/list
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
 * @route   GET /api/restaurants/:id
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
 * @route   PUT /api/restaurants/:id
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
 * @route   DELETE /api/restaurants/:id
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
// Orario routes such as creating an orario, updating it...
// ============================================================================

/**
 * @route GET /api/restaurants/:id/time-settings/:orarioId
 * @desc GET all existing orario for a restaurant
 * @access Private (Requires only access to the restaurant, no owner/manager role)
 */
router.get(
  '/:id/time-settings',
  requireJSON,
  authenticateToken,
  rateLimitAPI,
  orarioController.getRestaurantOrarios
);

/**
 * @route POST /api/restaurants/:id/time-settings
 * @desc Create time setting for a specific restaurant
 * @access Private (requires manager or owner role)
 */
router.post(
  '/:id/time-settings',
  requireJSON,
  authenticateToken,
  rateLimitAPI,
  //sanitizeOrarioCreation, //to add
  orarioController.createOrario
);


/**
 * @route PUT /api/restaurants/:id/time-settings (with giorno_settimana and nome_servizio in body)
 * @desc Update an existing orario
 * @access Private (requires manager or owner role)
 */
router.put(
  '/:id/time-settings/',
  requireJSON,
  authenticateToken,
  rateLimitAPI,
  //sanitizeOrarioCreation, //to add
  orarioController.updateOrario
);


/**
 * @route PUT /api/restaurants/:id/time-settings/:orarioId
 * @desc Update an existing orario
 * @access Private (requires manager or owner role)
 */
router.put(
  '/:id/time-settings/:orarioId',
  requireJSON,
  authenticateToken,
  rateLimitAPI,
  //sanitizeOrarioCreation, //to add
  orarioController.updateOrario
);

/**
 * @route DELETE /api/restaurants/:id/time-settings (with giorno_settimana and nome_servizio in body)
 * @desc Delete an existing orario
 * @access Private (requires manager or owner role)
 */
router.put(
  '/:id/time-settings/',
  requireJSON,
  authenticateToken,
  rateLimitAPI,
  //sanitizeOrarioCreation, //to add
  orarioController.updateOrario
);

/**
 * @route DELETE /api/restaurants/:id/time-settings/:orarioId
 * @desc Delete an existing orario
 * @access Private (requires manager or owner role)
 */
router.put(
  '/:id/time-settings/:orarioId',
  requireJSON,
  authenticateToken,
  rateLimitAPI,
  //sanitizeOrarioCreation, //to add
  orarioController.updateOrario
);


// ============================================================================
// Table routes such as creating a table, updating its settings...
// ============================================================================

/**
 * @route   POST /api/restaurants/:id/tables
 * @desc    Create a new table
 * @access  Private
 */
router.post(
  '/:id/tables',
  requireJSON,
  authenticateToken,
  rateLimitAPI,
  //sanitizeRestaurantCreation,
  tableController.createTable
);

/**
 * @route   GET /api/restaurants/:id/tables/:tableId
 * @desc    Get specific table details using table id
 * @access  Private
 */
router.get(
  '/:id/tables/:tableId',
  authenticateToken,
  rateLimitAPI,
  tableController.getTable
);

/**
 * @route   GET /api/restaurants/:id/tables/:salaId
 * @desc    Get all tables for a sala
 * @access  Private
 */
router.get(
  '/:id/tables/sala/:salaId',
  authenticateToken,
  rateLimitAPI,
  tableController.getSalaTables
);


/**
 * @route   PATCH /api/restaurants/:id/tables/:tableId
 * @desc    Update table details
 * @access  Private (requires manager or owner role)
 */
router.patch(
  '/:id/tables/:tableId',
  requireJSON,
  authenticateToken,
  rateLimitAPI,
  //sanitizeTableUpdate,
  tableController.updateTable
);

/**
 * @route   DELETE /api/restaurants/:id/tables/:tableId
 * @desc    Delete a table
 * @access  Private (requires owner role)
 */
router.delete(
  '/:id/tables/:tableId',
  authenticateToken,
  rateLimitStrict,
  tableController.deleteTable
);


/**
 * @route   DELETE /api/restaurants/:id/tables/
 * @desc    Delete all tables of a sala !!
 * @access  Private (requires owner role)
 */
router.delete(
  '/:id/tables/sala/:salaId',
  authenticateToken,
  rateLimitStrict,
  tableController.deleteSalaTables
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