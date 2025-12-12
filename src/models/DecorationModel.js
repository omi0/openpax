const { query, transaction } = require("../config/database");
const logger = require('../config/logger');

/**
 * Decoration  Model
 * Manages creation, update and deletion of decorations
 */

class Decoration {


  /**
   * Create a new decorations for a sala
   * @param {Object} decorationData - Decoration data
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<Object>} - Created decoration object
   */
  static async create(decorationData, schemaName) {
    return transaction(async (client) => {
      /** We could check if a decoration already exists but it is not needed
      const existsResult = await client.query(
        `SELECT id FROM ${schemaName}.tavoli 
         WHERE sala_id = $1 AND numero = $2 
         LIMIT 1`,
        [tableData.sala_id, tableData.numero]
      );
      
      if (existsResult.rows.length > 0) {
        throw new Error('TABLE_EXISTS');
      }*/

      // Insert new decoration
      const result = await client.query(
        `INSERT INTO ${schemaName}.decorazioni 
         (sala_id, forma, posizione_x, posizione_y)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          decorationData.sala_id,
          decorationData.forma,
          decorationData.posizione_x,
          decorationData.posizione_y
        ]
      );

      return result.rows[0];
    });
  }

  /**
   * Update PATCH
   * @param {number} decorationId
   * @param {Object} updates - partial object of fields to change
   * @param {string} schemaName - schema name
   * @returns {Promise<Object>} - Updated decoration object
   */
  static async update(decorationId, updates, schemaName) {
    return transaction(async (client) => {
      // Build dynamic update query
      const allowedFields = [
        'posizione_x', 
        'posizione_y', 
      ];
      
      const updateFields = [];
      const values = [];
      let paramCount = 1;
      
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          updateFields.push(`${key} = $${paramCount}`);
          values.push(value);
          paramCount++;
        }
      }
      
      if (updateFields.length === 0) {
        throw new Error('NO_VALID_FIELDS');
      }
      
      values.push(decorationId);
      
      const result = await client.query(
        `UPDATE ${schemaName}.decorazioni 
         SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${paramCount}
         RETURNING *`,
        values
      );
      
      if (result.rows.length === 0) {
        throw new Error('DECORATION_NOT_FOUND');
      }
      
      return result.rows[0];
    });
  }

  /**
   * Get all decorations for a sala
   * @param {number} salaId - Sala Id
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<Array>} - Array of tables objects
   */
  static async findBySala(salaId, schemaName) {
    const result = await query(
      `SELECT * FROM ${schemaName}.decorazioni WHERE sala_id = $1`,
      [salaId]
    );
    
    return result.rows;
  }

  /**
   * Get decoration by ID
   * @param {number} decorationId - Table ID
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<Object|null>} - Table object or null
   */
  static async findById(decorationId, schemaName) {
    const result = await query(
      `SELECT * FROM ${schemaName}.decorazioni WHERE id = $1`,
      [decorationId]
    );

    if (result.rows.length === 0) {
        throw new Error('DECORATION_NOT_FOUND');
      }
    
    return result.rows[0] || null;
  }

  /**
   * Delete decoration by id
   * @param {number} decorationId - Table ID
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<boolean>} - True if deleted
   */
  static async delete(decorationId, schemaName) {
    const result = await query(
      `DELETE FROM ${schemaName}.decorazioni WHERE id = $1 RETURNING id`,
      [decorationId]
    );
    
    return result.rows.length > 0;
  }

  /**
   * Delete by sala
   * @param {number} salaId - Id sala
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<boolean>} - True if deleted
   */
  static async deleteDecorationsBySala(salaId, schemaName) {
    const result = await query(
      `DELETE FROM ${schemaName}.decorazioni 
       WHERE sala_id = $1
       RETURNING id`,
      [salaId]
    );
    
    return result.rows.length > 0;
  }
}

module.exports = Decoration;