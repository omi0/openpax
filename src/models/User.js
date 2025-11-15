const db = require('../config/database'); // Your database connection

/**
 * User Model
 */
exports.User = {
  async create(userData) {
    const query = `
      INSERT INTO users (email, password, nome, cognome, email_verificato, created_at)
      VALUES (?, ?, ?, ?, NOW())
    `;
    const result = await db.execute(query, [
      userData.email,
      userData.password,
      userData.name,
      userData.surname,
      userData.emailVerified || false
    ]);
    return result.insertId;
  },

  async findByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = ? LIMIT 1';
    const [rows] = await db.execute(query, [email]);
    return rows[0] || null;
  },

  async findById(userId) {
    const query = 'SELECT * FROM users WHERE id = ? LIMIT 1';
    const [rows] = await db.execute(query, [userId]);
    return rows[0] || null;
  },

  async updatePassword(userId, hashedPassword) {
    const query = 'UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?';
    await db.execute(query, [hashedPassword, userId]);
  },

  async verifyEmail(userId) {
    const query = 'UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = ?';
    await db.execute(query, [userId]);
  },

  async updateLastLogin(userId) {
    const query = 'UPDATE users SET last_login = NOW() WHERE id = ?';
    await db.execute(query, [userId]);
  },

  async incrementFailedLogins(userId) {
    const query = `
      UPDATE users 
      SET tentativi_falliti = tentativi_falliti + 1,
          account_locked = CASE 
            WHEN tentativi_falliti + 1 >= 5 THEN true 
            ELSE bloccato_fino 
          END,
          lock_until = CASE 
            WHEN tentativi_falliti + 1 >= 5 THEN DATE_ADD(NOW(), INTERVAL 30 MINUTE)
            ELSE bloccato_fino 
          END
      WHERE id = ?
    `;
    await db.execute(query, [userId]);
  },

  async resetFailedLogins(userId) {
    const query = `
      UPDATE users 
      SET tentativi_falliti = 0,
          account_locked = false,
          lock_until = NULL
      WHERE id = ?
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
      VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY), NOW())
    `;
    await db.execute(query, [userId, token]);
  },

  async findByToken(token) {
    const query = `
      SELECT * FROM refresh_tokens 
      WHERE token = ? AND expires_at > NOW() AND revoked = false
      LIMIT 1
    `;
    const [rows] = await db.execute(query, [token]);
    return rows[0] || null;
  },

  async revoke(token) {
    const query = 'UPDATE refresh_tokens SET revoked = true WHERE token = ?';
    await db.execute(query, [token]);
  },

  async revokeAllForUser(userId) {
    const query = 'UPDATE refresh_tokens SET revoked = true WHERE user_id = ?';
    await db.execute(query, [userId]);
  },

  async cleanupExpired() {
    const query = 'DELETE FROM refresh_tokens WHERE expires_at < NOW()';
    await db.execute(query);
  }
};

/**
 * Password Reset Model
 */
exports.PasswordReset = {
  async create(userId, hashedToken) {
    // Delete any existing reset tokens for this user
    await db.execute('DELETE FROM password_resets WHERE user_id = ?', [userId]);
    
    const query = `
      INSERT INTO password_resets (user_id, token, expires_at, created_at)
      VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), NOW())
    `;
    await db.execute(query, [userId, hashedToken]);
  },

  async findValidToken(hashedToken) {
    const query = `
      SELECT * FROM password_resets 
      WHERE token = ? AND expires_at > NOW()
      LIMIT 1
    `;
    const [rows] = await db.execute(query, [hashedToken]);
    return rows[0] || null;
  },

  async delete(hashedToken) {
    const query = 'DELETE FROM password_resets WHERE token = ?';
    await db.execute(query, [hashedToken]);
  }
};

/**
 * Email Verification Model
 */
exports.EmailVerification = {
  async create(userId, token) {
    const query = `
      INSERT INTO email_verifications (user_id, token, expires_at, created_at)
      VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR), NOW())
    `;
    await db.execute(query, [userId, token]);
  },

  async findByToken(token) {
    const query = `
      SELECT * FROM email_verifications 
      WHERE token = ? AND expires_at > NOW()
      LIMIT 1
    `;
    const [rows] = await db.execute(query, [token]);
    return rows[0] || null;
  },

  async delete(token) {
    const query = 'DELETE FROM email_verifications WHERE token = ?';
    await db.execute(query, [token]);
  }
};