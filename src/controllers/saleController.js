const Restaurant = require('../models/RestaurantModel');
const logger = require('../config/logger');
const Sale = require('../models/SaleModel');
/**
 * Table controller
 * Handles creation update deletion of tables
 */

const saleController = {

  /**
   * Create a new sala
   * POST /api/restaurants/:id/sale
   */


  async createSala(req, res) {
    const startTime = Date.now();
    
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

      const access = await Restaurant.checkUserAccess(userId, restaurantId);

      if (!access.hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this restaurant',
          code: 'ACCESS_DENIED'
        });
      }

      if(!(['owner', 'manager'].includes(access.role))) {
        return res.status(403).json({
          success: false,
          message: 'Owner/Manager role is required to perform this operation',
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

      // Validate required fields
      const { nome, descrizione, capacita_massima, ordine} = req.body;
      
      if (!nome || !descrizione || !capacita_massima || !ordine) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: nome, descrizione, capacita_massima, ordina',
          code: 'MISSING_FIELDS'
        });
      }

      // Validate sala_id (must not contain letters or special char)
      if (!(/^\d+$/.test(capacita_massima))) {
        return res.status(400).json({
          success: false,
          message: 'Invalid capacita_massia. Must be between a number',
          code: 'INVALID_CAPACITA'
        });
      }

      if (!(/^\d+$/.test(ordine))) {
        return res.status(400).json({
          success: false,
          message: 'Invalid ordine. Must be between a number',
          code: 'INVALID_ORDINE'
        });
      }

      // Create sala
      logger.info({ 
        restaurantId, 
        userId, 
        nome: nome, 
      }, 'Creating new sala');
      
      const sala = await Sale.create(req.body, restaurant.schema_name);

      logger.info({ 
        nome: sala.nome,
        restaurantId,
        duration: Date.now() - startTime 
      }, 'Sala created successfully');

      res.status(201).json({
        success: true,
        message: 'Sala created successfully',
        data: {
          sala: {
            id: sala.id,
            nome: sala.nome,
            descrizione: sala.descrizione,
            capacita_massima: sala.capacita_massima,
            ordine: sala.ordine
          }
        }
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        userId: req.user?.userId 
      }, 'Sala creation error');

      if (error.message === 'SALA_EXISTS') {
        return res.status(409).json({
          success: false,
          message: 'Sala already exists for this sala. Use PUT to update it',
          code: 'SALA_EXISTS'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create sala',
        code: 'CREATION_FAILED'
      });
    }
  },

  /**
   * Delete sala by id
   * DELETE /api/restaurants/:id/sale/:salaId
  */
  async deleteSala(req, res) {
    try {
      const userId = req.user.userId;
      const restaurantId = parseInt(req.params.id);
      const salaId = req.params.salaId ? parseInt(req.params.salaId) : null;

      if (isNaN(restaurantId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid restaurant ID',
          code: 'INVALID_ID'
        });
      }

      // Check user access (only owner can delete)
      const access = await Restaurant.checkUserAccess(userId, restaurantId);

      if (!access.hasAccess || access.role !== 'owner') {
        return res.status(403).json({
          success: false,
          message: 'Only restaurant owner can delete tables',
          code: 'OWNER_ONLY'
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

      if (isNaN(salaId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid table ID',
          code: 'INVALID_ID'
        });
      }

      const deleted = await Sale.delete(salaId, restaurant.schema_name);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Sala not found',
          code: 'NOT_FOUND'
        });
      }

      logger.warn({ 
        salaId,
        restaurantId,
        userId
      }, 'Sala deleted');

      res.json({
        success: true,
        message: 'Sala deleted successfully'
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        salaId: req.params.salaId,
        userId: req.user?.userId 
      }, 'Error deleting sala');

      res.status(500).json({
        success: false,
        message: 'Failed to delete sala',
        code: 'DELETE_FAILED'
      });
    }
  },

  /**
   * Get all sala in a restaurant
   * GET /api/restaurants/:id/sale
   */
  async getSale(req, res) {
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

      const sale = await Sale.findAllSala(restaurant.schema_name);

      res.json({
        success: true,
        count: sale.length,
        data: sale
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        userId: req.user?.userId 
      }, 'Error fetching sale');

      res.status(500).json({
        success: false,
        message: 'Failed to fetch sale',
        code: 'FETCH_FAILED'
      });
    }
  }


};

module.exports = saleController;