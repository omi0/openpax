const { query, transaction } = require("../config/database");
const logger = require('../config/logger');


/**
 * Settings Model
 * Manages creation, update and deletion of restaurant settings
 */
class Settings {

  /**
   * Get all settings for a restaurant schema
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<Array>} - List of restaurant settings
   */
  static async findAll(schemaName) {
    const result = await query(
      `SELECT chiave, valore, tipo, categoria, descrizione 
       FROM ${schemaName}.impostazioni 
       ORDER BY categoria, chiave`
    );
    return result.rows;
  }

  /**
   * Update settings
   * @param {Object} settingsData - Settings data
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<Array>} - List of updated settings
   */
  static async update(settingsData, schemaName) {
    return transaction(async (client) => {
      const keys = Object.keys(settingsData);
      const updatedItems = [];

      for (const key of keys) {
        let value = settingsData[key];

        const result = await client.query(
          `UPDATE ${schemaName}.impostazioni 
           SET valore = $1, updated_at = NOW() 
           WHERE chiave = $2 
           RETURNING chiave, valore`,
          [JSON.stringify(value), key]
        );

        if (result.rows.length > 0) {
          updatedItems.push(result.rows[0]);
        }
      }

      return updatedItems;
    });
  }
}

module.exports = Settings;