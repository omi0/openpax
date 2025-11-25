const Restaurant = require('../models/RestaurantModel');
const logger = require('../config/logger');

/**
 * Restaurant Controller
 * Handles restaurant creation and management
 */
const authController = {
  /**
   * Create a new restaurant
   * POST /api/restaurants/create
   */
  async createRestaurant(req, res) {
    const startTime = Date.now();
    
    try {
      const userId = req.user.userId;
      const restaurantData = req.body;

      // Check if user already owns maximum restaurants (e.g., 3)
      const existingRestaurants = await Restaurant.findByUserId(userId);
      const ownedRestaurants = existingRestaurants.filter(r => r.ruolo === 'owner');
      
      const MAX_RESTAURANTS_PER_USER = parseInt(process.env.MAX_RESTAURANTS_PER_USER) || 3;
      
      if (ownedRestaurants.length >= MAX_RESTAURANTS_PER_USER) {
        return res.status(403).json({
          success: false,
          message: `Maximum restaurants limit reached (${MAX_RESTAURANTS_PER_USER})`,
          code: 'MAX_RESTAURANTS_REACHED'
        });
      }

      // Create restaurant with schema and tables
      logger.info({ userId, restaurantName: restaurantData.nome_ristorante }, 'Creating new restaurant');
      
      const restaurant = await Restaurant.create(restaurantData, userId);

      logger.info({ 
        restaurantId: restaurant.id,
        userId,
        duration: Date.now() - startTime 
      }, 'Restaurant created successfully');

      res.status(201).json({
        success: true,
        message: 'Restaurant created successfully',
        data: {
          restaurant: {
            id: restaurant.id,
            slug: restaurant.slug,
            nome: restaurant.nomeRistorante,
            email: restaurant.email,
            schemaName: restaurant.schemaName
          }
        }
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        userId: req.user?.userId 
      }, 'Restaurant creation error');

      if (error.message === 'Email already exists') {
        return res.status(409).json({
          success: false,
          message: 'A restaurant with this email already exists',
          code: 'EMAIL_EXISTS'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create restaurant',
        code: 'CREATION_FAILED'
      });
    }
  },

  /**
   * Get all restaurants for authenticated user
   * GET /api/restaurants/list
   */
  async getUserRestaurants(req, res) {
    try {
      const userId = req.user.userId;
      
      const restaurants = await Restaurant.findByUserId(userId);

      const formattedRestaurants = restaurants.map(r => ({
        id: r.id,
        nome: r.nome_ristorante,
        slug: r.slug,
        email: r.email,
        telefono: r.telefono,
        indirizzo: r.indirizzo,
        citta: r.citta,
        ruolo: r.ruolo,
        permessi: r.permessi,
        attivo: r.attivo,
        createdAt: r.created_at
      }));

      res.json({
        success: true,
        data: {
          restaurants: formattedRestaurants,
          count: formattedRestaurants.length
        }
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        userId: req.user?.userId 
      }, 'Error fetching user restaurants');

      res.status(500).json({
        success: false,
        message: 'Failed to fetch restaurants',
        code: 'FETCH_FAILED'
      });
    }
  },

  /**
   * Get specific restaurant details
   * GET /api/restaurants/:id
   */
  async getRestaurant(req, res) {
    try {
      const userId = req.user.userId;
      const restaurantId = parseInt(req.params.id);

      if (isNaN(restaurantId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid restaurant ID',
          code: 'INVALID_ID'
        });
      }

      // Check user access
      const access = await Restaurant.checkUserAccess(userId, restaurantId);
      
      if (!access.hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this restaurant',
          code: 'ACCESS_DENIED'
        });
      }

      const restaurant = await Restaurant.findById(restaurantId);
      
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant not found',
          code: 'NOT_FOUND'
        });
      }

      // Get basic statistics if user has manager or owner role
      let stats = null;
      if (['owner', 'manager'].includes(access.role)) {
        stats = await Restaurant.getStats(restaurantId, restaurant.schema_name);
      }

      res.json({
        success: true,
        data: {
          restaurant: {
            id: restaurant.id,
            nome: restaurant.nome_ristorante,
            slug: restaurant.slug,
            email: restaurant.email,
            telefono: restaurant.telefono,
            indirizzo: restaurant.indirizzo,
            citta: restaurant.citta,
            cap: restaurant.cap,
            paese: restaurant.paese,
            attivo: restaurant.attivo,
            staffCount: restaurant.staff_count,
            createdAt: restaurant.created_at,
            updatedAt: restaurant.updated_at
          },
          userRole: access.role,
          userPermissions: access.permissions,
          stats
        }
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        userId: req.user?.userId 
      }, 'Error fetching restaurant');

      res.status(500).json({
        success: false,
        message: 'Failed to fetch restaurant details',
        code: 'FETCH_FAILED'
      });
    }
  },

  /**
   * Update restaurant details
   * PUT /api/restaurants/:id
   */
  async updateRestaurant(req, res) {
    try {
      const userId = req.user.userId;
      const restaurantId = parseInt(req.params.id);

      if (isNaN(restaurantId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid restaurant ID',
          code: 'INVALID_ID'
        });
      }

      // Check user has owner or manager access
      const access = await Restaurant.checkUserAccess(userId, restaurantId, 'manager');
      
      if (!access.hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to update restaurant',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }

      const updates = req.body;
      const updatedRestaurant = await Restaurant.update(restaurantId, updates);

      if (!updatedRestaurant) {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update',
          code: 'NO_UPDATES'
        });
      }

      logger.info({ 
        restaurantId,
        userId,
        updatedFields: Object.keys(updates)
      }, 'Restaurant updated');

      res.json({
        success: true,
        message: 'Restaurant updated successfully',
        data: {
          restaurant: {
            id: updatedRestaurant.id,
            nome: updatedRestaurant.nome_ristorante,
            email: updatedRestaurant.email,
            telefono: updatedRestaurant.telefono,
            indirizzo: updatedRestaurant.indirizzo,
            citta: updatedRestaurant.citta,
            cap: updatedRestaurant.cap,
            paese: updatedRestaurant.paese,
            updatedAt: updatedRestaurant.updated_at
          }
        }
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        userId: req.user?.userId 
      }, 'Error updating restaurant');

      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'Email already in use by another restaurant',
          code: 'EMAIL_CONFLICT'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update restaurant',
        code: 'UPDATE_FAILED'
      });
    }
  },

  /**
   * Deactivate restaurant
   * DELETE /api/restaurants/:id
   */
  async deactivateRestaurant(req, res) {
    try {
      const userId = req.user.userId;
      const restaurantId = parseInt(req.params.id);

      if (isNaN(restaurantId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid restaurant ID',
          code: 'INVALID_ID'
        });
      }

      // Only owner can deactivate restaurant
      const access = await Restaurant.checkUserAccess(userId, restaurantId, 'owner');
      
      if (!access.hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Only restaurant owner can deactivate',
          code: 'OWNER_ONLY'
        });
      }

      const deactivated = await Restaurant.deactivate(restaurantId);

      if (!deactivated) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant not found',
          code: 'NOT_FOUND'
        });
      }

      logger.warn({ 
        restaurantId,
        userId
      }, 'Restaurant deactivated');

      res.json({
        success: true,
        message: 'Restaurant deactivated successfully'
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        userId: req.user?.userId 
      }, 'Error deactivating restaurant');

      res.status(500).json({
        success: false,
        message: 'Failed to deactivate restaurant',
        code: 'DEACTIVATION_FAILED'
      });
    }
  },

  /**
   * Get restaurant by slug (public endpoint for booking widget)
   * GET /api/restaurants/public/:slug
   */
  async getRestaurantBySlug(req, res) {
    try {
      const { slug } = req.params;

      const restaurant = await Restaurant.findBySlug(slug);
      
      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: 'Restaurant not found',
          code: 'NOT_FOUND'
        });
      }

      // Return only public information
      res.json({
        success: true,
        data: {
          restaurant: {
            id: restaurant.id,
            nome: restaurant.nome_ristorante,
            telefono: restaurant.telefono,
            indirizzo: restaurant.indirizzo,
            citta: restaurant.citta,
            cap: restaurant.cap,
            paese: restaurant.paese
          }
        }
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        slug: req.params.slug 
      }, 'Error fetching restaurant by slug');

      res.status(500).json({
        success: false,
        message: 'Failed to fetch restaurant',
        code: 'FETCH_FAILED'
      });
    }
  }
};

module.exports = authController;