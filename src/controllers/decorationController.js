const Restaurant = require('../models/RestaurantModel');
const Decoration = require('../models/DecorationModel');
const logger = require('../config/logger');

/**
 * Decoration controller
 * Handles creation update deletion of decorations
 */

const decorationController = {

  /**
   * Create a new decoration in a sala
   * POST /api/restaurants/:id/decorations
   */


  async createDecoration(req, res) {
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
      const { sala_id, forma, posizione_x, posizione_y} = req.body;
      
      if (!sala_id || !posizione_x || !posizione_y || !forma) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: sala_id, posizione_x, posizione_y, forma',
          code: 'MISSING_FIELDS'
        });
      }

      // Validate sala_id (must not contain letters or special char)
      if (!(/^\d+$/.test(sala_id))) {
        return res.status(400).json({
          success: false,
          message: 'Invalid sala_id. Must be between an id number',
          code: 'INVALID_SALA'
        });
      }

      //Validate forma
      if (!['rectangle', 'circle', 'square', 'oval'].includes(forma)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid forma type',
            code: 'INVALID_FORMA'
        })
      }

      // Create decoration
      logger.info({ 
        restaurantId, 
        userId, 
        forma: forma,
      }, 'Creating new decoration');
      
      const decoration = await Decoration.create(req.body, restaurant.schema_name);

      logger.info({ 
        nome: decoration.forma,
        restaurantId,
        duration: Date.now() - startTime 
      }, 'Decoration created successfully');

      res.status(201).json({
        success: true,
        message: 'Decoration created successfully',
        data: {
          decoration: {
            id: decoration.id,
            posizione_x: decoration.posizione_x,
            posizione_y: decoration.posizione_y,
            forma: decoration.forma,
          }
        }
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        userId: req.user?.userId 
      }, 'Decoration creation error');

      if (error.message === 'DECORATION_EXISTS') {
        return res.status(409).json({
          success: false,
          message: 'Decoration already exists for this sala. Use PUT to update it',
          code: 'DECORATION_EXISTS'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create decoration',
        code: 'CREATION_FAILED'
      });
    }
  },

  /**
   * Update an existing decoration only by position nothing else
   * PATCH /api/restaurants/:id/decorations/:decorationId
   */
  async updateDecoration(req, res) {
    try {
      const userId = req.user.userId;
      const restaurantId = parseInt(req.params.id);
      const decorationId = req.params.decorationId ? parseInt(req.params.decorationId) : null;

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

      if (isNaN(decorationId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid decoration ID',
          code: 'INVALID_ID'
        });
      }
      
      const updatedDecoration = await Decoration.update(decorationId, req.body, restaurant.schema_name);

      logger.info({ 
        decorationId: updatedDecoration.id,
        restaurantId,
        userId,
        updatedFields: Object.keys(req.body)
      }, 'Decoration updated');

      res.json({
        success: true,
        message: 'Decoration updated successfully',
        data: {
          decoration: {
            id: updatedDecoration.id,
            posizione_x: updatedDecoration.posizione_x,
            posizione_y: updatedDecoration.posizione_y,
          }
        }
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        decorationId: req.params.decorationId,
        userId: req.user?.userId 
      }, 'Error updating decoration');

      if (error.message === 'NO_VALID_FIELDS') {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update',
          code: 'NO_UPDATES'
        });
      }

      if (error.message === 'DECORATION_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: 'Decoration not found',
          code: 'NOT_FOUND'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update decoration',
        code: 'UPDATE_FAILED'
      });
    }
  },


  /**
   * Get single decoration detail for a restaurant
   * GET /api/restaurants/:id/decorations/:decorationId
   */
  async getDecoration(req, res) {
    try {
      const userId = req.user.userId;
      const restaurantId = parseInt(req.params.id);
      const decorationId = req.params.decorationId ? parseInt(req.params.decorationId) : null;

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

      if (isNaN(decorationId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid decoration ID',
          code: 'INVALID_ID'
        });
      }
      
      const infoDecoration = await Decoration.findById(decorationId, restaurant.schema_name);

      res.json({
        success: true,
        message: 'Decoration fetched successfully',
        data: {
          decoration: {
            id: infoDecoration.id,
            posizione_x: infoDecoration.posizione_x,
            posizione_y: infoDecoration.posizione_y,
            forma: infoDecoration.forma,
          }
        }
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        decorationId: req.params.decorationId,
        userId: req.user?.userId 
      }, 'Error fetching decoration');

      if (error.message === 'DECORATION_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: 'Decoration not found',
          code: 'NOT_FOUND'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to fetch decoration',
        code: 'FETCH_FAILED'
      });
    }
  },

  /**
   * Get all decorations in a sala
   * GET /api/restaurants/:id/decorations/:salaId
   */
  async getSalaDecorations(req, res) {
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

      if (isNaN(salaId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid sala ID',
          code: 'INVALID_ID'
        });
      }

      const decorations = await Decoration.findBySala(salaId, restaurant.schema_name);

      res.json({
        success: true,
        count: decorations.length,
        data: decorations
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        userId: req.user?.userId 
      }, 'Error fetching decorations');

      res.status(500).json({
        success: false,
        message: 'Failed to fetch decorations',
        code: 'FETCH_FAILED'
      });
    }
  },

  /**
   * Delete decoration by id
   * DELETE /api/restaurants/:id/decorations/:decorationId
  */
  async deleteDecoration(req, res) {
    try {
      const userId = req.user.userId;
      const restaurantId = parseInt(req.params.id);
      const decorationId = req.params.decorationId ? parseInt(req.params.decorationId) : null;

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
          message: 'Only restaurant owner can delete decorations',
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

      if (isNaN(decorationId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid decoration ID',
            code: 'INVALID_ID'
          });
        }

      const deleted = await Decoration.delete(decorationId, restaurant.schema_name);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Decoration not found',
          code: 'NOT_FOUND'
        });
      }

      logger.warn({ 
        decorationId,
        restaurantId,
        userId
      }, 'Decoration deleted');

      res.json({
        success: true,
        message: 'Decoration deleted successfully'
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        decorationId: req.params.decoration,
        userId: req.user?.userId 
      }, 'Error deleting decorations');

      res.status(500).json({
        success: false,
        message: 'Failed to delete decoration',
        code: 'DELETE_FAILED'
      });
    }
  },



  /**
   * Delete all decorations inside a sala, to be used when user wants to clear decorations or delete a sala
   * in which case it'll call this function first and the delete the sala record
   * DELETE /api/restaurants/:id/decorations/:salaId
  */
  async deleteSalaDecorations(req, res) {
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
            message: 'Invalid sala ID',
            code: 'INVALID_ID'
          });
        }

      const deleted = await Decoration.deleteDecorationsBySala(salaId, restaurant.schema_name);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Decoration not found',
          code: 'NOT_FOUND'
        });
      }

      logger.warn({ 
        salaId,
        restaurantId,
        userId
      }, 'Decorations deleted');

      res.json({
        success: true,
        message: 'Decorations deleted successfully'
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        salaId: req.params.salaId,
        userId: req.user?.userId 
      }, 'Error deleting decorations');

      res.status(500).json({
        success: false,
        message: 'Failed to delete decoration',
        code: 'DELETE_FAILED'
      });
    }
  }


};

module.exports = decorationController;