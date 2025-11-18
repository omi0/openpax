const { query, transaction } = require('../config/database');
const crypto = require('crypto');

/**
 * User Model with enhanced security and error handling
 */
class User {
  /**
   * Create a new user
   */
  static async create(userData) {
    const { email, password_hash, nome, cognome, telefono = null } = userData;
    
    const sql = `
      INSERT INTO utenti (
        email, password_hash, nome, cognome, telefono, 
        email_verificato, verification_token, verification_expires
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, email, nome, cognome, email_verificato, created_at
    `;
    
    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    const values = [
      email.toLowerCase(),
      password_hash,
      nome,
      cognome,
      telefono,
      false,
      verificationToken,
      verificationExpires
    ];
    
    try {
      const result = await query(sql, values);
      return {
        user: result.rows[0],
        verificationToken
      };
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        throw new Error('Email already exists');
      }
      throw error;
    }
  }

  /**
   * Find user by email
   */
  static async findByEmail(email) {
    const sql = `
      SELECT id, email, password_hash, nome, cognome, telefono,
             attivo, email_verificato, tentativi_falliti, bloccato_fino,
             ultimo_accesso, created_at, updated_at
      FROM utenti 
      WHERE email = $1
      LIMIT 1
    `;
    
    const result = await query(sql, [email.toLowerCase()]);
    return result.rows[0] || null;
  }

  /**
   * Find user by ID
   */
  static async findById(userId) {
    const sql = `
      SELECT id, email, nome, cognome, telefono,
             attivo, email_verificato, ultimo_accesso,
             created_at, updated_at
      FROM utenti 
      WHERE id = $1
      LIMIT 1
    `;
    
    const result = await query(sql, [userId]);
    return result.rows[0] || null;
  }

  /**
   * Update password
   */
  static async updatePassword(userId, hashedPassword) {
    const sql = `
      UPDATE utenti 
      SET password_hash = $1,
          reset_token = NULL,
          reset_scadenza = NULL
      WHERE id = $2
      RETURNING id
    `;
    
    const result = await query(sql, [hashedPassword, userId]);
    return result.rowCount > 0;
  }

  /**
   * Verify email
   */
  static async verifyEmail(token) {
    const sql = `
      UPDATE utenti 
      SET email_verificato = true,
          verification_token = NULL,
          verification_expires = NULL
      WHERE verification_token = $1
        AND verification_expires > NOW()
        AND email_verificato = false
      RETURNING id, email, nome
    `;
    
    const result = await query(sql, [token]);
    return result.rows[0] || null;
  }

  /**
   * Update last login timestamp
   */
  static async updateLastLogin(userId, ipAddress = null) {
    const sql = `
      UPDATE utenti 
      SET ultimo_accesso = NOW(),
          tentativi_falliti = 0,
          bloccato_fino = NULL
      WHERE id = $1
    `;
    
    await query(sql, [userId]);
  }

  /**
   * Increment failed login attempts
   */
  static async incrementFailedLogins(userId) {
    const sql = `
      UPDATE utenti 
      SET tentativi_falliti = tentativi_falliti + 1,
          ultimo_tentativo_fallito = NOW(),
          bloccato_fino = CASE 
            WHEN tentativi_falliti >= 4 THEN NOW() + INTERVAL '30 minutes'
            ELSE bloccato_fino 
          END
      WHERE id = $1
      RETURNING tentativi_falliti, bloccato_fino
    `;
    
    const result = await query(sql, [userId]);
    return result.rows[0];
  }

  /**
   * Create password reset token
   */
  static async createPasswordReset(userId) {
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    const sql = `
      UPDATE utenti 
      SET reset_token = $1,
          reset_scadenza = NOW() + INTERVAL '1 hour'
      WHERE id = $2
      RETURNING email
    `;
    
    const result = await query(sql, [hashedToken, userId]);
    
    if (result.rowCount > 0) {
      return {
        email: result.rows[0].email,
        resetToken
      };
    }
    return null;
  }

  /**
   * Find user by reset token
   */
  static async findByResetToken(token) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    const sql = `
      SELECT id, email, nome
      FROM utenti 
      WHERE reset_token = $1 
        AND reset_scadenza > NOW()
        AND attivo = true
      LIMIT 1
    `;
    
    const result = await query(sql, [hashedToken]);
    return result.rows[0] || null;
  }

  /**
   * Check if user account is active
   */
  static async isActive(userId) {
    const sql = 'SELECT attivo FROM utenti WHERE id = $1';
    const result = await query(sql, [userId]);
    return result.rows[0]?.attivo || false;
  }

  /**
   * Deactivate user account
   */
  static async deactivate(userId) {
    const sql = 'UPDATE utenti SET attivo = false WHERE id = $1';
    await query(sql, [userId]);
  }

  /**
   * Update user profile
   */
  static async updateProfile(userId, updates) {
    const { nome, cognome, telefono } = updates;
    
    const sql = `
      UPDATE utenti 
      SET nome = COALESCE($1, nome),
          cognome = COALESCE($2, cognome),
          telefono = COALESCE($3, telefono)
      WHERE id = $4
      RETURNING id, email, nome, cognome, telefono
    `;
    
    const result = await query(sql, [nome, cognome, telefono, userId]);
    return result.rows[0];
  }
}

/**
 * RefreshToken Model
 */
class RefreshToken {
  /**
   * Create a new refresh token
   */
  static async create(userId, token, userAgent = null, ipAddress = null) {
    const sql = `
      INSERT INTO refresh_tokens (user_id, token, expires_at, user_agent, ip_address)
      VALUES ($1, $2, NOW() + INTERVAL '7 days', $3, $4)
      RETURNING id
    `;
    
    const result = await query(sql, [userId, token, userAgent, ipAddress]);
    return result.rows[0].id;
  }

  /**
   * Find valid refresh token
   */
  static async findByToken(token) {
    const sql = `
      SELECT rt.*, u.email, u.nome
      FROM refresh_tokens rt
      JOIN utenti u ON rt.user_id = u.id
      WHERE rt.token = $1 
        AND rt.expires_at > NOW() 
        AND rt.revoked = false
        AND u.attivo = true
      LIMIT 1
    `;
    
    const result = await query(sql, [token]);
    return result.rows[0] || null;
  }

  /**
   * Revoke a refresh token
   */
  static async revoke(token) {
    const sql = 'UPDATE refresh_tokens SET revoked = true WHERE token = $1';
    const result = await query(sql, [token]);
    return result.rowCount > 0;
  }

  /**
   * Revoke all tokens for a user
   */
  static async revokeAllForUser(userId) {
    const sql = 'UPDATE refresh_tokens SET revoked = true WHERE user_id = $1';
    await query(sql, [userId]);
  }

  /**
   * Clean up expired tokens
   */
  static async cleanupExpired() {
    const sql = `
      DELETE FROM refresh_tokens 
      WHERE expires_at < NOW() 
        OR (revoked = true AND created_at < NOW() - INTERVAL '30 days')
    `;
    
    const result = await query(sql);
    return result.rowCount;
  }

  /**
   * Get active sessions for a user
   */
  static async getActiveSessions(userId) {
    const sql = `
      SELECT id, user_agent, ip_address, created_at, expires_at
      FROM refresh_tokens
      WHERE user_id = $1 
        AND expires_at > NOW() 
        AND revoked = false
      ORDER BY created_at DESC
    `;
    
    const result = await query(sql, [userId]);
    return result.rows;
  }

  /**
   * Rotate refresh token (create new, revoke old)
   */
  static async rotate(oldToken, newToken, userAgent = null, ipAddress = null) {
    return transaction(async (client) => {
      // Get the old token data
      const findSql = `
        SELECT user_id 
        FROM refresh_tokens 
        WHERE token = $1 AND revoked = false
      `;
      const findResult = await client.query(findSql, [oldToken]);
      
      if (!findResult.rows[0]) {
        throw new Error('Invalid refresh token');
      }
      
      const userId = findResult.rows[0].user_id;
      
      // Revoke old token
      await client.query('UPDATE refresh_tokens SET revoked = true WHERE token = $1', [oldToken]);
      
      // Create new token
      const createSql = `
        INSERT INTO refresh_tokens (user_id, token, expires_at, user_agent, ip_address)
        VALUES ($1, $2, NOW() + INTERVAL '7 days', $3, $4)
      `;
      await client.query(createSql, [userId, newToken, userAgent, ipAddress]);
      
      return userId;
    });
  }
}

module.exports = { User, RefreshToken };