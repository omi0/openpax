const Restaurant = require('../models/RestaurantModel');
const Orario = require('../models/OrarioModel');
const logger = require('../config/logger');

/**
 * Orario controller
 * Handles creation update of orario and orario_eccezioni
 */

const orarioController = {

  /**
   * Create a new orario
   * POST /api/restaurants/:id/time-settings
   */
  async createOrario(req, res) {
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
      const { giorno_settimana, nome_servizio, ora_apertura, ora_chiusura } = req.body;
      
      if (giorno_settimana === undefined || !nome_servizio || !ora_apertura || !ora_chiusura) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: giorno_settimana, nome_servizio, ora_apertura, ora_chiusura',
          code: 'MISSING_FIELDS'
        });
      }

      // Validate day of week (0-6)
      if (giorno_settimana < 0 || giorno_settimana > 6) {
        return res.status(400).json({
          success: false,
          message: 'Invalid giorno_settimana. Must be between 0 (Sunday) and 6 (Saturday)',
          code: 'INVALID_DAY'
        });
      }

      // Validate time format (HH:MM)
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(ora_apertura) || !timeRegex.test(ora_chiusura)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid time format. Use HH:MM format',
          code: 'INVALID_TIME_FORMAT'
        });
      }

      // Create orario
      logger.info({ 
        restaurantId, 
        userId, 
        giorno: giorno_settimana,
        servizio: nome_servizio 
      }, 'Creating new orario');
      
      const orario = await Orario.create(req.body, restaurant.schema_name);

      logger.info({ 
        orarioId: orario.id,
        restaurantId,
        duration: Date.now() - startTime 
      }, 'Orario created successfully');

      res.status(201).json({
        success: true,
        message: 'Orario created successfully',
        data: {
          orario: {
            id: orario.id,
            nome_servizio: orario.nome_servizio,
            giorno_settimana: orario.giorno_settimana,
            ora_apertura: orario.ora_apertura,
            ora_chiusura: orario.ora_chiusura,
            modalita_prenotazione: orario.modalita_prenotazione,
            durata_slot: orario.durata_slot,
            capacita_max_persone: orario.capacita_max_persone,
            attivo: orario.attivo
          }
        }
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        userId: req.user?.userId 
      }, 'Orario creation error');

      if (error.message === 'ORARIO_EXISTS') {
        return res.status(409).json({
          success: false,
          message: 'Orario already exists for this day and service. Use PUT to update it',
          code: 'ORARIO_EXISTS'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create orario',
        code: 'CREATION_FAILED'
      });
    }
  },

  /**
   * Update an existing orario
   * PUT /api/restaurants/:id/time-settings/:orarioId
   * or
   * PUT /api/restaurants/:id/time-settings (with giorno_settimana and nome_servizio in body)
   */
  async updateOrario(req, res) {
    try {
      const userId = req.user.userId;
      const restaurantId = parseInt(req.params.id);
      const orarioId = req.params.orarioId ? parseInt(req.params.orarioId) : null;

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

      let updatedOrario;
      
      if (orarioId) {
        // Update by ID
        if (isNaN(orarioId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid orario ID',
            code: 'INVALID_ID'
          });
        }
        
        updatedOrario = await Orario.update(orarioId, req.body, restaurant.schema_name);
      } else {
        // Update by day and service
        const { giorno_settimana, nome_servizio, ...updates } = req.body;
        
        if (giorno_settimana === undefined || !nome_servizio) {
          return res.status(400).json({
            success: false,
            message: 'Missing giorno_settimana or nome_servizio to identify orario',
            code: 'MISSING_IDENTIFIER'
          });
        }
        
        updatedOrario = await Orario.updateByDayAndService(
          giorno_settimana, 
          nome_servizio, 
          updates, 
          restaurant.schema_name
        );
      }

      logger.info({ 
        orarioId: updatedOrario.id,
        restaurantId,
        userId,
        updatedFields: Object.keys(req.body)
      }, 'Orario updated');

      res.json({
        success: true,
        message: 'Orario updated successfully',
        data: {
          orario: {
            id: updatedOrario.id,
            nome_servizio: updatedOrario.nome_servizio,
            giorno_settimana: updatedOrario.giorno_settimana,
            ora_apertura: updatedOrario.ora_apertura,
            ora_chiusura: updatedOrario.ora_chiusura,
            modalita_prenotazione: updatedOrario.modalita_prenotazione,
            durata_slot: updatedOrario.durata_slot,
            capacita_max_persone: updatedOrario.capacita_max_persone,
            attivo: updatedOrario.attivo,
            updated_at: updatedOrario.updated_at
          }
        }
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        orarioId: req.params.orarioId,
        userId: req.user?.userId 
      }, 'Error updating orario');

      if (error.message === 'NO_VALID_FIELDS') {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update',
          code: 'NO_UPDATES'
        });
      }

      if (error.message === 'ORARIO_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: 'Orario not found',
          code: 'NOT_FOUND'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update orario',
        code: 'UPDATE_FAILED'
      });
    }
  },

  /**
   * Get all orario for a restaurant
   * GET /api/restaurants/:id/time-settings
   */
  async getRestaurantOrarios(req, res) {
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

      const orarios = await Orario.findByRestaurant(restaurant.schema_name);

      // Group by day for easier frontend consumption
      const groupedByDay = orarios.reduce((acc, orario) => {
        if (!acc[orario.giorno_settimana]) {
          acc[orario.giorno_settimana] = [];
        }
        acc[orario.giorno_settimana].push(orario);
        return acc;
      }, {});

      res.json({
        success: true,
        data: {
          orarios,
          groupedByDay,
          count: orarios.length
        }
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        userId: req.user?.userId 
      }, 'Error fetching orarios');

      res.status(500).json({
        success: false,
        message: 'Failed to fetch orarios',
        code: 'FETCH_FAILED'
      });
    }
  },

  /**
   * Delete orario
   * DELETE /api/restaurants/:id/time-settings/:orarioId
   * or
   * DELETE /api/restaurants/:id/time-settings (with giorno_settimana and nome_servizio in body)
   */
  async deleteOrario(req, res) {
    try {
      const userId = req.user.userId;
      const restaurantId = parseInt(req.params.id);
      const orarioId = req.params.orarioId ? parseInt(req.params.orarioId) : null;

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
          message: 'Only restaurant owner can delete orarios',
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

      let deleted;
      
      if (orarioId) {
        // Delete by ID
        if (isNaN(orarioId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid orario ID',
            code: 'INVALID_ID'
          });
        }
        
        deleted = await Orario.delete(orarioId, restaurant.schema_name);
      } else {
        // Delete by day and service
        const { giorno_settimana, nome_servizio } = req.body;
        
        if (giorno_settimana === undefined || !nome_servizio) {
          return res.status(400).json({
            success: false,
            message: 'Missing giorno_settimana or nome_servizio to identify orario',
            code: 'MISSING_IDENTIFIER'
          });
        }
        
        deleted = await Orario.deleteByDayAndService(
          giorno_settimana, 
          nome_servizio, 
          restaurant.schema_name
        );
      }

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Orario not found',
          code: 'NOT_FOUND'
        });
      }

      logger.warn({ 
        orarioId,
        restaurantId,
        userId
      }, 'Orario deleted');

      res.json({
        success: true,
        message: 'Orario deleted successfully'
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        orarioId: req.params.orarioId,
        userId: req.user?.userId 
      }, 'Error deleting orario');

      res.status(500).json({
        success: false,
        message: 'Failed to delete orario',
        code: 'DELETE_FAILED'
      });
    }
  }
};

module.exports = orarioController;