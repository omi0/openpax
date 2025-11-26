const Restaurant = require('../models/RestaurantModel');
const Table = require('../models/TableModel');
const logger = require('../config/logger');

/**
 * Table controller
 * Handles creation update deletion of tables
 */

const tableController = {

  /**
   * Create a new table in a sala
   * POST /api/restaurants/:id/tables
   */


  async createTable(req, res) {
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
      const { sala_id, numero, posti, solo_su_richiesta, posizione_x, posizione_y, forma, note} = req.body;
      
      if (!sala_id || !numero || !posti || !solo_su_richiesta || !posizione_x || !posizione_y || !forma || !note) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: sala_id, numero, posti, solo_su_richiesta, posizione_x, posizione_y, forma, note',
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

      //Validate numero ovvero nome tavolo
      if (numero.length > 20) {
        return res.status(400).json({
          success: false,
          message: 'Lenght exceeded for numero',
          error: 'INVALID_NUMERO'
        })
      }

      //Validate posti
      if (!(/^\d+$/.test(posti)) && posti > 40) {
        return res.status(400).json({
          success: false,
          message: 'Invalid posti. Must be between a number not > 40',
          code: 'INVALID_SALA'
        });
      }

      // Create table
      logger.info({ 
        restaurantId, 
        userId, 
        nome: numero, 
      }, 'Creating new table');
      
      const table = await Table.create(req.body, restaurant.schema_name);

      logger.info({ 
        nome: table.numero,
        restaurantId,
        duration: Date.now() - startTime 
      }, 'Table created successfully');

      res.status(201).json({
        success: true,
        message: 'Table created successfully',
        data: {
          table: {
            id: table.id,
            numero: table.numero,
            posti: table.posti,
            solo_su_richiesta: table.solo_su_richiesta,
            posizione_x: table.posizione_x,
            posizione_y: table.posizione_y,
            forma: table.forma,
            note: table.note,
            attivo: table.attivo
          }
        }
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        userId: req.user?.userId 
      }, 'Orario creation error');

      if (error.message === 'TABLE_EXISTS') {
        return res.status(409).json({
          success: false,
          message: 'Table already exists for this sala. Use PUT to update it',
          code: 'ORARIO_EXISTS'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create table',
        code: 'CREATION_FAILED'
      });
    }
  },

  /**
   * Update an existing table
   * PATCH /api/restaurants/:id/tables/:tableId
   */
  async updateTable(req, res) {
    try {
      const userId = req.user.userId;
      const restaurantId = parseInt(req.params.id);
      const tableId = req.params.tableId ? parseInt(req.params.tableId) : null;

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

      if (isNaN(tableId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid table ID',
          code: 'INVALID_ID'
        });
      }
      
      const updatedTable = await Table.update(tableId, req.body, restaurant.schema_name);

      logger.info({ 
        tableId: updatedTable.id,
        restaurantId,
        userId,
        updatedFields: Object.keys(req.body)
      }, 'Table updated');

      res.json({
        success: true,
        message: 'Table updated successfully',
        data: {
          orario: {
            id: updatedTable.id,
            numero: updatedTable.numero,
            posti: updatedTable.posti,
            solo_su_richiesta: updatedTable.solo_su_richiesta,
            posizione_x: updatedTable.posizione_x,
            posizione_y: updatedTable.posizione_y,
            forma: updatedTable.forma,
            note: updatedTable.note,
            attivo: updatedTable.attivo
          }
        }
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        tableId: req.params.orarioId,
        userId: req.user?.userId 
      }, 'Error updating table');

      if (error.message === 'NO_VALID_FIELDS') {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update',
          code: 'NO_UPDATES'
        });
      }

      if (error.message === 'TABLE_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: 'Table not found',
          code: 'NOT_FOUND'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update table',
        code: 'UPDATE_FAILED'
      });
    }
  },


  /**
   * Get single table detail for a restaurant
   * GET /api/restaurants/:id/tables/:tableId
   */
  async getTable(req, res) {
    try {
      const userId = req.user.userId;
      const restaurantId = parseInt(req.params.id);
      const tableId = req.params.tableId ? parseInt(req.params.tableId) : null;

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

      if (isNaN(tableId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid table ID',
          code: 'INVALID_ID'
        });
      }
      
      const infoTable = await Table.findById(tableId, restaurant.schema_name);

      res.json({
        success: true,
        message: 'Table fetched successfully',
        data: {
          orario: {
            id: infoTable.id,
            numero: infoTable.numero,
            posti: infoTable.posti,
            solo_su_richiesta: infoTable.solo_su_richiesta,
            posizione_x: infoTable.posizione_x,
            posizione_y: infoTable.posizione_y,
            forma: infoTable.forma,
            note: infoTable.note,
            attivo: infoTable.attivo
          }
        }
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        tableId: req.params.orarioId,
        userId: req.user?.userId 
      }, 'Error fetching table');

      if (error.message === 'TABLE_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: 'Table not found',
          code: 'NOT_FOUND'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to fetch table',
        code: 'FETCH_FAILED'
      });
    }
  },

  /**
   * Get all tables in a sala
   * GET /api/restaurants/:id/tables/:salaId
   */
  async getSalaTables(req, res) {
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

      const tables = await Table.findBySala(salaId, restaurant.schema_name);

      res.json({
        success: true,
        count: tables.length,
        data: tables
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        userId: req.user?.userId 
      }, 'Error fetching tables');

      res.status(500).json({
        success: false,
        message: 'Failed to fetch tables',
        code: 'FETCH_FAILED'
      });
    }
  },

  /**
   * Delete table by id
   * DELETE /api/restaurants/:id/tables/:tableId
  */
  async deleteTable(req, res) {
    try {
      const userId = req.user.userId;
      const restaurantId = parseInt(req.params.id);
      const tableId = req.params.tableId ? parseInt(req.params.tableId) : null;

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

      if (isNaN(tableId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid table ID',
            code: 'INVALID_ID'
          });
        }

      const deleted = await Table.delete(tableId, restaurant.schema_name);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Table not found',
          code: 'NOT_FOUND'
        });
      }

      logger.warn({ 
        tableId,
        restaurantId,
        userId
      }, 'Table deleted');

      res.json({
        success: true,
        message: 'Table deleted successfully'
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        tableId: req.params.tableId,
        userId: req.user?.userId 
      }, 'Error deleting table');

      res.status(500).json({
        success: false,
        message: 'Failed to delete table',
        code: 'DELETE_FAILED'
      });
    }
  },



  /**
   * Delete all tables inside a sala, to be used when user wants to clear table or delete a sala
   * in which case it'll call this function first and the delete the sala record
   * DELETE /api/restaurants/:id/tables/:salaId
  */
  async deleteSalaTables(req, res) {
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

      if (isNaN(tableId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid table ID',
            code: 'INVALID_ID'
          });
        }

      const deleted = await Table.deleteTablesBySala(salaId, restaurant.schema_name);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Table not found',
          code: 'NOT_FOUND'
        });
      }

      logger.warn({ 
        salaId,
        restaurantId,
        userId
      }, 'Tables deleted');

      res.json({
        success: true,
        message: 'Tables deleted successfully'
      });

    } catch (error) {
      logger.error({ 
        err: error, 
        restaurantId: req.params.id,
        salaId: req.params.salaId,
        userId: req.user?.userId 
      }, 'Error deleting table');

      res.status(500).json({
        success: false,
        message: 'Failed to delete table',
        code: 'DELETE_FAILED'
      });
    }
  }


};

module.exports = tableController;