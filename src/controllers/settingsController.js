const Restaurant = require('../models/RestaurantModel');
const Settings = require('../models/SettingsModel');
const logger = require('../config/logger');

/**
 * Settings controller
 * Handles retrieval and updates of restaurant configuration
 */
const settingsController = {

  /**
   * Get all settings for a restaurant
   * GET /api/settings/:id
   */
  async getSettings(req, res) {
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

        const settings = await Settings.findAll(restaurant.schema_name);

        res.json({
            success: true,
            count: settings.length,
            data: settings
        });

    } catch (error) {
        logger.error({ 
            err: error, 
            restaurantId: req.params.id,
            userId: req.user?.userId 
        }, 'Error fetching settings');

        res.status(500).json({
            success: false,
            message: 'Failed to fetch settings',
            code: 'FETCH_FAILED'
        });
    }
  },

  /**
   * Update restaurant settings
   * PATCH /api/settings/:id
   */
  async updateSettings(req, res) {
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

        // Check user access
        const access = await Restaurant.checkUserAccess(userId, restaurantId);

        if (!access.hasAccess) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this restaurant',
                code: 'ACCESS_DENIED'
            });
        }

        // Only Owner or Manager can update settings
        if (!(['owner', 'manager'].includes(access.role))) {
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

        // Validate body
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No settings provided to update',
                code: 'MISSING_DATA'
            });
        }

        logger.info({ 
            restaurantId, 
            userId, 
            updatedKeys: Object.keys(req.body)
        }, 'Updating restaurant settings');

        const updatedSettings = await Settings.update(req.body, restaurant.schema_name);

        logger.info({ 
            restaurantId,
            count: updatedSettings.length,
            duration: Date.now() - startTime 
        }, 'Settings updated successfully');

        res.json({
            success: true,
            message: 'Settings updated successfully',
            updatedCount: updatedSettings.length,
            data: updatedSettings
        });

    } catch (error) {
        logger.error({ 
            err: error, 
            restaurantId: req.params.id,
            userId: req.user?.userId,
            body: req.body
        }, 'Error updating settings');

        res.status(500).json({
            success: false,
            message: 'Failed to update settings',
            code: 'UPDATE_FAILED'
        });
    }
  }
};

module.exports = settingsController;