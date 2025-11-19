const { query, transaction } = require('../config/database');
const crypto = require('crypto');

/**
 * RefreshToken Model
 * Manages refresh tokens for user authentication with enhanced security features
 */
class RefreshToken {
  /**
   * Configuration
   */
  static config = {
    expiryDays: 7,                    // Token lifetime
    maxSessionsPerUser: 5,            // Maximum concurrent sessions
    cleanupRetentionDays: 30,         // Keep revoked tokens for audit
    sessionIdleHours: 24              // Hours before session considered idle
  };

  /**
   * Create a new refresh token
   * Automatically limits sessions per user and cleans up old sessions
   */
  static async create(userId, token, options = {}) {
    const {
      userAgent = null,
      ipAddress = null,
      fingerprint = null
    } = options;

    return transaction(async (client) => {
      // 1. Enforce session limit - keep only most recent sessions
      const cleanupSql = `
        DELETE FROM refresh_tokens 
        WHERE user_id = $1 
          AND id NOT IN (
            SELECT id FROM refresh_tokens 
            WHERE user_id = $1 
              AND revoked = false
              AND expires_at > NOW()
            ORDER BY created_at DESC 
            LIMIT $2
          )
      `;
      await client.query(cleanupSql, [userId, this.config.maxSessionsPerUser - 1]);

      // 2. Hash the token for storage (never store plain tokens!)
      const hashedToken = this.hashToken(token);

      // 3. Create new token
      const sql = `
        INSERT INTO refresh_tokens (
          user_id, token, expires_at, user_agent, ip_address, fingerprint
        )
        VALUES (
          $1, $2, NOW() + INTERVAL '${this.config.expiryDays} days', $3, $4, $5
        )
        RETURNING id, created_at, expires_at
      `;
      const result = await client.query(sql, [
        userId,
        hashedToken,
        userAgent,
        ipAddress,
        fingerprint
      ]);

      return {
        id: result.rows[0].id,
        token, // Return original token (only time it's visible)
        createdAt: result.rows[0].created_at,
        expiresAt: result.rows[0].expires_at
      };
    });
  }

  /**
   * Find valid refresh token with security validation
   */
  static async findByToken(token, fingerprint = null) {
    const hashedToken = this.hashToken(token);

    const sql = `
      UPDATE refresh_tokens 
      SET last_used_at = NOW() 
      WHERE token = $1 
        AND expires_at > NOW() 
        AND revoked = false
        ${fingerprint ? 'AND fingerprint = $2' : ''}
      RETURNING 
        rt.id,
        rt.user_id,
        rt.fingerprint,
        rt.user_agent,
        rt.ip_address,
        rt.created_at,
        rt.expires_at,
        rt.last_used_at,
        u.id as user_id,
        u.email,
        u.nome,
        u.cognome,
        u.ruolo,
        u.attivo as user_active,
        u.email_verificato
      FROM refresh_tokens rt
      JOIN utenti u ON rt.user_id = u.id
      WHERE u.attivo = true
    `;

    const params = fingerprint ? [hashedToken, fingerprint] : [hashedToken];
    const result = await query(sql, params);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      user: {
        id: row.user_id,
        email: row.email,
        nome: row.nome,
        cognome: row.cognome,
        ruolo: row.ruolo,
        attivo: row.user_active,
        emailVerificato: row.email_verificato
      },
      fingerprint: row.fingerprint,
      userAgent: row.user_agent,
      ipAddress: row.ip_address,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at
    };
  }

  /**
   * Revoke a specific refresh token
   */
  static async revoke(token) {
    const hashedToken = this.hashToken(token);
    const sql = `
      UPDATE refresh_tokens 
      SET revoked = true, updated_at = NOW() 
      WHERE token = $1
      RETURNING id
    `;
    const result = await query(sql, [hashedToken]);
    return result.rowCount > 0;
  }

  /**
   * Revoke a specific session by ID
   */
  static async revokeById(sessionId, userId) {
    const sql = `
      UPDATE refresh_tokens 
      SET revoked = true, updated_at = NOW() 
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;
    const result = await query(sql, [sessionId, userId]);
    return result.rowCount > 0;
  }

  /**
   * Revoke all tokens for a user (logout from all devices)
   */
   static async revokeAllForUser(userId) {
    const sql = `
        UPDATE refresh_tokens 
        SET revoked = true, updated_at = NOW() 
        WHERE user_id = $1 AND revoked = false
    `;
    const result = await query(sql, [userId]);
    return result.rowCount; //Use rowCount instead
    }

  /**
   * Clean up expired and old revoked tokens
   * Should be run as a daily cron job
   */
  static async cleanupExpired() {
    const sql = `
      DELETE FROM refresh_tokens 
      WHERE 
        expires_at < NOW() 
        OR (
          revoked = true 
          AND created_at < NOW() - INTERVAL '${this.config.cleanupRetentionDays} days'
        )
      RETURNING COUNT(*) as deleted_count
    `;
    const result = await query(sql);
    return result.rows[0]?.deleted_count || 0;
  }

  /**
   * Get active sessions for a user with detailed information
   */
  static async getActiveSessions(userId) {
    const sql = `
      SELECT 
        id,
        user_agent,
        ip_address,
        created_at,
        last_used_at,
        expires_at,
        -- Session status
        CASE 
          WHEN last_used_at > NOW() - INTERVAL '1 hour' THEN 'active'
          WHEN last_used_at > NOW() - INTERVAL '${this.config.sessionIdleHours} hours' THEN 'recent'
          ELSE 'idle'
        END as status,
        -- Device type detection
        CASE 
          WHEN user_agent ILIKE '%Mobile%' OR user_agent ILIKE '%Android%' OR user_agent ILIKE '%iPhone%' THEN 'Mobile'
          WHEN user_agent ILIKE '%Tablet%' OR user_agent ILIKE '%iPad%' THEN 'Tablet'
          ELSE 'Desktop'
        END as device_type,
        -- Browser detection
        CASE 
          WHEN user_agent ILIKE '%Chrome%' AND user_agent NOT ILIKE '%Edg%' THEN 'Chrome'
          WHEN user_agent ILIKE '%Safari%' AND user_agent NOT ILIKE '%Chrome%' THEN 'Safari'
          WHEN user_agent ILIKE '%Firefox%' THEN 'Firefox'
          WHEN user_agent ILIKE '%Edg%' THEN 'Edge'
          ELSE 'Other'
        END as browser,
        -- Location (basic)
        SUBSTRING(ip_address FROM 1 FOR POSITION('.' IN ip_address || '.') - 1) as ip_prefix
      FROM refresh_tokens
      WHERE user_id = $1 
        AND expires_at > NOW() 
        AND revoked = false
      ORDER BY last_used_at DESC
    `;
    const result = await query(sql, [userId]);
    return result.rows;
  }

  /**
   * Get session statistics for a user
   */
  static async getSessionStats(userId) {
    const sql = `
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(*) FILTER (WHERE last_used_at > NOW() - INTERVAL '1 hour') as active_sessions,
        COUNT(*) FILTER (WHERE last_used_at > NOW() - INTERVAL '24 hours') as recent_sessions,
        MAX(last_used_at) as last_activity,
        MIN(created_at) as oldest_session
      FROM refresh_tokens
      WHERE user_id = $1 
        AND expires_at > NOW() 
        AND revoked = false
    `;
    const result = await query(sql, [userId]);
    return result.rows[0];
  }

  /**
   * Rotate refresh token (create new, revoke old)
   * Best practice for security - prevents token reuse
   */
  static async rotate(oldToken, newToken, options = {}) {
    const {
      userAgent = null,
      ipAddress = null,
      fingerprint = null
    } = options;

    return transaction(async (client) => {
      const hashedOldToken = this.hashToken(oldToken);

      // 1. Get the old token data
      const findSql = `
        SELECT user_id, fingerprint, ip_address
        FROM refresh_tokens 
        WHERE token = $1 
          AND revoked = false
          AND expires_at > NOW()
      `;
      const findResult = await client.query(findSql, [hashedOldToken]);

      if (findResult.rows.length === 0) {
        throw new Error('INVALID_REFRESH_TOKEN');
      }

      const oldTokenData = findResult.rows[0];

      // 2. Security check: fingerprint should match
      if (fingerprint && oldTokenData.fingerprint && oldTokenData.fingerprint !== fingerprint) {
        throw new Error('FINGERPRINT_MISMATCH');
      }

      // 3. Revoke old token
      await client.query(
        'UPDATE refresh_tokens SET revoked = true, updated_at = NOW() WHERE token = $1',
        [hashedOldToken]
      );

      // 4. Create new token
      const hashedNewToken = this.hashToken(newToken);
      const createSql = `
        INSERT INTO refresh_tokens (
          user_id, token, expires_at, user_agent, ip_address, fingerprint
        )
        VALUES (
          $1, $2, NOW() + INTERVAL '${this.config.expiryDays} days', $3, $4, $5
        )
        RETURNING id, created_at, expires_at
      `;
      const createResult = await client.query(createSql, [
        oldTokenData.user_id,
        hashedNewToken,
        userAgent || null,
        ipAddress || oldTokenData.ip_address,
        fingerprint || oldTokenData.fingerprint
      ]);

      return {
        userId: oldTokenData.user_id,
        tokenId: createResult.rows[0].id,
        token: newToken,
        createdAt: createResult.rows[0].created_at,
        expiresAt: createResult.rows[0].expires_at
      };
    });
  }

  /**
   * Detect suspicious activity
   * Returns list of potential security issues
   */
  static async detectSuspiciousActivity(userId) {
    const sql = `
      SELECT 
        COUNT(DISTINCT ip_address) as unique_ips,
        COUNT(DISTINCT fingerprint) as unique_fingerprints,
        COUNT(*) as total_sessions,
        MAX(created_at) as latest_session,
        ARRAY_AGG(DISTINCT ip_address) as ip_addresses
      FROM refresh_tokens
      WHERE user_id = $1 
        AND created_at > NOW() - INTERVAL '24 hours'
        AND revoked = false
    `;
    const result = await query(sql, [userId]);
    const stats = result.rows[0];

    const warnings = [];

    if (stats.unique_ips > 3) {
      warnings.push({
        type: 'MULTIPLE_IPS',
        message: `Sessions from ${stats.unique_ips} different IP addresses in last 24 hours`,
        severity: 'medium'
      });
    }

    if (stats.total_sessions > this.config.maxSessionsPerUser) {
      warnings.push({
        type: 'TOO_MANY_SESSIONS',
        message: `${stats.total_sessions} active sessions (max: ${this.config.maxSessionsPerUser})`,
        severity: 'low'
      });
    }

    return {
      suspicious: warnings.length > 0,
      warnings,
      stats
    };
  }

  /**
   * Hash token for secure storage
   * NEVER store plain tokens in database!
   */
  static hashToken(token) {
    return crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
  }

  /**
   * Generate a secure random token
   */
  static generateToken() {
    return crypto.randomBytes(64).toString('hex');
  }
}

module.exports = RefreshToken;