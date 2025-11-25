const { query, transaction } = require("../config/database");
const logger = require('../config/logger');

/**
 * Orario Model
 * Manages creation, update and deletion of orario and orario_eccezioni
 */

class Orario {
  /**
   * Check if an orario already exists for a specific day and service
   * @param {string} schemaName - Restaurant schema name
   * @param {number} giornoSettimana - Day of week (0-6)
   * @param {string} nomeServizio - Service name (e.g., 'lunch', 'dinner')
   * @returns {Promise<boolean>} - True if exists, false otherwise
   */
  static async exists(schemaName, giornoSettimana, nomeServizio) {
    const result = await query(
      `SELECT id FROM ${schemaName}.orario 
       WHERE giorno_settimana = $1 AND nome_servizio = $2 
       LIMIT 1`,
      [giornoSettimana, nomeServizio]
    );
    
    return result.rows.length > 0;
  }

  /**
   * Create a new orario for a certain day and service
   * @param {Object} orarioData - Orario data
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<Object>} - Created orario object
   */
  static async create(orarioData, schemaName) {
    return transaction(async (client) => {
      // Check if orario already exists
      const existsResult = await client.query(
        `SELECT id FROM ${schemaName}.orario 
         WHERE giorno_settimana = $1 AND nome_servizio = $2 
         LIMIT 1`,
        [orarioData.giorno_settimana, orarioData.nome_servizio]
      );
      
      if (existsResult.rows.length > 0) {
        throw new Error('ORARIO_EXISTS');
      }

      // Insert new orario
      const result = await client.query(
        `INSERT INTO ${schemaName}.orario 
         (nome_servizio, giorno_settimana, ora_apertura, ora_chiusura, 
          modalita_prenotazione, durata_slot, capacita_max_persone, attivo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          orarioData.nome_servizio,
          orarioData.giorno_settimana,
          orarioData.ora_apertura,
          orarioData.ora_chiusura,
          orarioData.modalita_prenotazione,
          orarioData.durata_slot || 30,
          orarioData.capacita_max_persone || 50,
          orarioData.attivo !== undefined ? orarioData.attivo : true
        ]
      );

      return result.rows[0];
    });
  }

  /**
   * Update an existing orario
   * @param {number} orarioId - Orario ID
   * @param {Object} updates - Fields to update
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<Object>} - Updated orario object
   */
  static async update(orarioId, updates, schemaName) {
    return transaction(async (client) => {
      // Build dynamic update query
      const allowedFields = [
        'ora_apertura', 
        'ora_chiusura', 
        'modalita_prenotazione', 
        'durata_slot', 
        'capacita_max_persone', 
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
      
      values.push(orarioId); // Add ID as last parameter
      
      const result = await client.query(
        `UPDATE ${schemaName}.orario 
         SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${paramCount}
         RETURNING *`,
        values
      );
      
      if (result.rows.length === 0) {
        throw new Error('ORARIO_NOT_FOUND');
      }
      
      return result.rows[0];
    });
  }

  /**
   * Update by day and service (for PATCH requests)
   * @param {number} giornoSettimana - Day of week
   * @param {string} nomeServizio - Service name
   * @param {Object} updates - Fields to update
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<Object>} - Updated orario object
   */
  static async updateByDayAndService(giornoSettimana, nomeServizio, updates, schemaName) {
    return transaction(async (client) => {
      // Build dynamic update query
      const allowedFields = [
        'ora_apertura', 
        'ora_chiusura', 
        'modalita_prenotazione', 
        'durata_slot', 
        'capacita_max_persone', 
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
      
      values.push(giornoSettimana);
      values.push(nomeServizio);
      
      const result = await client.query(
        `UPDATE ${schemaName}.orario 
         SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE giorno_settimana = $${paramCount} AND nome_servizio = $${paramCount + 1}
         RETURNING *`,
        values
      );
      
      if (result.rows.length === 0) {
        throw new Error('ORARIO_NOT_FOUND');
      }
      
      return result.rows[0];
    });
  }

  /**
   * Get all orario for a restaurant
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<Array>} - Array of orario objects
   */
  static async findByRestaurant(schemaName) {
    const result = await query(
      `SELECT * FROM ${schemaName}.orario 
       ORDER BY giorno_settimana, nome_servizio`,
      []
    );
    
    return result.rows;
  }

  /**
   * Get orario by ID
   * @param {number} orarioId - Orario ID
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<Object|null>} - Orario object or null
   */
  static async findById(orarioId, schemaName) {
    const result = await query(
      `SELECT * FROM ${schemaName}.orario WHERE id = $1`,
      [orarioId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Delete orario
   * @param {number} orarioId - Orario ID
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<boolean>} - True if deleted
   */
  static async delete(orarioId, schemaName) {
    const result = await query(
      `DELETE FROM ${schemaName}.orario WHERE id = $1 RETURNING id`,
      [orarioId]
    );
    
    return result.rows.length > 0;
  }

  /**
   * Delete by day and service
   * @param {number} giornoSettimana - Day of week
   * @param {string} nomeServizio - Service name
   * @param {string} schemaName - Restaurant schema name
   * @returns {Promise<boolean>} - True if deleted
   */
  static async deleteByDayAndService(giornoSettimana, nomeServizio, schemaName) {
    const result = await query(
      `DELETE FROM ${schemaName}.orario 
       WHERE giorno_settimana = $1 AND nome_servizio = $2 
       RETURNING id`,
      [giornoSettimana, nomeServizio]
    );
    
    return result.rows.length > 0;
  }
}

module.exports = Orario;