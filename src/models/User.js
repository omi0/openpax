const db = require('../config/database');

/**
 * User Model
 */
exports.User = {
  async create(userData) {
    const query = `
      INSERT INTO utenti (email, password_hash, nome, cognome, email_verificato, created_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      RETURNING id
    `;
    const values = [
      userData.email,
      userData.password,
      userData.name,
      userData.surname,
      userData.emailVerified || false
    ];
    
    const [result] = await db.execute(query, values);
    return result.rows[0].id;
  },

  async findByEmail(email) {
    const query = 'SELECT * FROM utenti WHERE email = $1 LIMIT 1';
    const [result] = await db.execute(query, [email]);
    return result.rows[0] || null;
  },

  async findById(userId) {
    const query = 'SELECT * FROM utenti WHERE id = $1 LIMIT 1';
    const [result] = await db.execute(query, [userId]);
    return result.rows[0] || null;
  },

  async updatePassword(userId, hashedPassword) {
    const query = 'UPDATE utenti SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2';
    await db.execute(query, [hashedPassword, userId]);
  },

  async verifyEmail(userId) {
    const query = 'UPDATE utenti SET email_verificato = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1';
    await db.execute(query, [userId]);
  },

  async updateLastLogin(userId) {
    const query = 'UPDATE utenti SET last_login = CURRENT_TIMESTAMP WHERE id = $1';
    await db.execute(query, [userId]);
  },

  async incrementFailedLogins(userId) {
    const query = `
      UPDATE users 
      SET tentativi_falliti = tentativi_falliti + 1,
          account_bloccato = CASE 
            WHEN tentativi_falliti + 1 >= 5 THEN true 
            ELSE account_bloccato 
          END,
          bloccato_fino = CASE 
            WHEN tentativi_falliti + 1 >= 5 THEN CURRENT_TIMESTAMP + INTERVAL '30 minutes'
            ELSE bloccato_fino 
          END
      WHERE id = $1
    `;
    await db.execute(query, [userId]);
  },

  async resetFailedLogins(userId) {
    const query = `
      UPDATE users 
      SET tentativi_falliti = 0,
          account_bloccato = false,
          bloccato_fino = NULL
      WHERE id = $1
    `;
    await db.execute(query, [userId]);
  }
};

/**
 * Refresh Token Model
 */
exports.RefreshToken = {
  async create(userId, token) {
    const query = `
      INSERT INTO refresh_tokens (user_id, token, expires_at, created_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '7 days', CURRENT_TIMESTAMP)
    `;
    await db.execute(query, [userId, token]);
  },

  async findByToken(token) {
    const query = `
      SELECT * FROM refresh_tokens 
      WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP AND revoked = false
      LIMIT 1
    `;
    const [result] = await db.execute(query, [token]);
    return result.rows[0] || null;
  },

  async revoke(token) {
    const query = 'UPDATE refresh_tokens SET revoked = true WHERE token = $1';
    await db.execute(query, [token]);
  },

  async revokeAllForUser(userId) {
    const query = 'UPDATE refresh_tokens SET revoked = true WHERE user_id = $1';
    await db.execute(query, [userId]);
  },

  async cleanupExpired() {
    const query = 'DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP';
    await db.execute(query);
  }
};

/**
 * Password Reset Model
 */
exports.PasswordReset = {
  async create(userId, hashedToken) {
    await db.execute('DELETE FROM password_resets WHERE user_id = $1', [userId]);
    
    const query = `
      INSERT INTO password_resets (user_id, token, expires_at, created_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '1 hour', CURRENT_TIMESTAMP)
    `;
    await db.execute(query, [userId, hashedToken]);
  },

  async findValidToken(hashedToken) {
    const query = `
      SELECT * FROM password_resets 
      WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP
      LIMIT 1
    `;
    const [result] = await db.execute(query, [hashedToken]);
    return result.rows[0] || null;
  },

  async delete(hashedToken) {
    const query = 'DELETE FROM password_resets WHERE token = $1';
    await db.execute(query, [hashedToken]);
  }
};
