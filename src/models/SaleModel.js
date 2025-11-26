const { query, transaction } = require("../config/database");
const logger = require('../config/logger');
const saleController = require("../controllers/saleController");

/**
 * Sale Model
 * Manages creation, update and deletion of sale
 */

class Sale {
  /**
   * Check if a sala already exists
   * @param {string} schemaName - Restaurant schema name
   * @param {string} sala_id - Sala id
   * @returns {Promise<boolean>} - True if exists, false otherwise
   */
  static async exists(schemaName, sala_id) {
    const result = await query(
      `SELECT id FROM ${schemaName}.sale 
       WHERE id = $1
       LIMIT 1`,
      [sala_id]
    );
    
    return result.rows.length > 0;
  }

  /**
   * Create a new sala
   * @param {Object} salaData - Sala data
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<Object>} - Created sala object
   */
  static async create(salaData, schemaName) {
    return transaction(async (client) => {
      // Check if orario already exists
      const existsResult = await client.query(
        `SELECT id FROM ${schemaName}.sale 
         WHERE nome = $1
         LIMIT 1`,
        [salaData.nome]
      );
      
      if (existsResult.rows.length > 0) {
        throw new Error('TABLE_EXISTS');
      }

      // Insert new table
      const result = await client.query(
        `INSERT INTO ${schemaName}.sale 
         (nome, descrizione, capacita_massima, ordine)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          salaData.nome,
          salaData.descrizione,
          salaData.capacita_massima,
          salaData.ordine
        ]
      );

      return result.rows[0];
    });
  }

  
   /**
   * Get all sala for a restaurant
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<Array>} - Array of tables objects
   */
  static async findAllSala(schemaName) {
    const result = await query(
      `SELECT * FROM ${schemaName}.sale`,
    );
    
    return result.rows;
  }


  /**
   * Delete sala by id
   * @param {number} salaId - Table ID
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<boolean>} - True if deleted
   */
  static async delete(salaId, schemaName) {
    const result = await query(
      `DELETE FROM ${schemaName}.sale WHERE id = $1 RETURNING id`,
      [salaId]
    );
    
    return result.rows.length > 0;
  }


}

module.exports = Sale;