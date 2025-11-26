const { query, transaction } = require("../config/database");
const logger = require('../config/logger');

/**
 * Table Model
 * Manages creation, update and deletion of tables
 */

class Table {
  /**
   * Check if a table already exists
   * @param {string} schemaName - Restaurant schema name
   * @param {number} numero - Table numero/name
   * @param {string} sala_id - Sala id
   * @returns {Promise<boolean>} - True if exists, false otherwise
   */
  static async exists(schemaName, numero, sala_id) {
    const result = await query(
      `SELECT id FROM ${schemaName}.tavoli 
       WHERE numero = $1 AND sala_id = $2 
       LIMIT 1`,
      [numero, sala_id]
    );
    
    return result.rows.length > 0;
  }

  /**
   * Create a new table for a sala
   * @param {Object} tableData - Orario data
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<Object>} - Created orario object
   */
  static async create(tableData, schemaName) {
    return transaction(async (client) => {
      // Check if orario already exists
      const existsResult = await client.query(
        `SELECT id FROM ${schemaName}.tavoli 
         WHERE sala_id = $1 AND numero = $2 
         LIMIT 1`,
        [tableData.sala_id, tableData.numero]
      );
      
      if (existsResult.rows.length > 0) {
        throw new Error('TABLE_EXISTS');
      }

      // Insert new table
      const result = await client.query(
        `INSERT INTO ${schemaName}.tavoli 
         (sala_id, numero, posti, solo_su_richiesta, 
          posizione_x, posizione_y, forma, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          tableData.sala_id,
          tableData.numero,
          tableData.posti,
          tableData.solo_su_richiesta,
          tableData.posizione_x,
          tableData.posizione_y,
          tableData.forma,
          tableData.note
        ]
      );

      return result.rows[0];
    });
  }

  /**
   * Update pATCH
   * @param {number} tableId
   * @param {Object} updates - partial object of fields to change
   * @param {string} schemaName - schema name
   * @returns {Promise<Object>} - Updated table object
   */
  static async update(tableId, updates, schemaName) {
    return transaction(async (client) => {
      // Build dynamic update query
      const allowedFields = [
        'numero', 
        'posti', 
        'solo_su_richiesta', 
        'posizione_x', 
        'posizione_y', 
        'forma',
        'note',
        'attivo'
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
      
      values.push(tableId);
      
      const result = await client.query(
        `UPDATE ${schemaName}.tavoli 
         SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${paramCount}
         RETURNING *`,
        values
      );
      
      if (result.rows.length === 0) {
        throw new Error('TABLE_NOT_FOUND');
      }
      
      return result.rows[0];
    });
  }

  /**
   * Get all tables for a sala
   * @param {number} salaId - Sala Id
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<Array>} - Array of tables objects
   */
  static async findBySala(salaId, schemaName) {
    const result = await query(
      `SELECT * FROM ${schemaName}.tavoli WHERE sala_id = $1`,
      [salaId]
    );
    
    return result.rows;
  }

  /**
   * Get table by ID
   * @param {number} tableId - Table ID
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<Object|null>} - Table object or null
   */
  static async findById(tableId, schemaName) {
    const result = await query(
      `SELECT * FROM ${schemaName}.prenotazioni WHERE id = $1`,
      [tableId]
    );

    if (result.rows.length === 0) {
        throw new Error('TABLE_NOT_FOUND');
      }
    
    return result.rows[0] || null;
  }

  /**
   * Delete table by id
   * @param {number} tableId - Table ID
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<boolean>} - True if deleted
   */
  static async delete(tableId, schemaName) {
    const result = await query(
      `DELETE FROM ${schemaName}.tavoli WHERE id = $1 RETURNING id`,
      [tableId]
    );
    
    return result.rows.length > 0;
  }

  /**
   * Delete by sala
   * @param {number} salaId - Id sala
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<boolean>} - True if deleted
   */
  static async deleteTablesBySala(salaId, schemaName) {
    const result = await query(
      `DELETE FROM ${schemaName}.tavoli 
       WHERE sala_id = $1
       RETURNING id`,
      [salaId]
    );
    
    return result.rows.length > 0;
  }
}

module.exports = Table;