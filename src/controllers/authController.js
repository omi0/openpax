const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User } = require('../models/User');
const RefreshToken = require('../models/refreshToken'); // Note: Capital R
const { getSessionMetadata } = require('../utils/fingerprint');
const { sendEmail } = require('../utils/emailService');

// Environment variables
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'change-this-secret-in-production';
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Cookie configuration
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  path: '/'
};

const ACCESS_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 15 * 60 * 1000 // 15 minutes
};

const REFRESH_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/auth' // Restrict refresh token to auth endpoints
};

/**
 * Generate Access Token (JWT)
 * Note: Refresh tokens are now random strings, not JWTs
 */
const generateAccessToken = (userId, email) => {
  return jwt.sign(
    { 
      userId, 
      email, 
      type: 'access',
      iat: Math.floor(Date.now() / 1000)
    },
    JWT_ACCESS_SECRET,
    { 
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: 'auth-service',
      audience: 'api'
    }
  );
};

/**
 * Register a new user
 */
exports.register = async (req, res) => {
  try {
    const { email, password, nome, cognome, telefono } = req.body;

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        message: 'An account with this email already exists',
        code: 'EMAIL_EXISTS'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create user with verification token
    const { user, verificationToken } = await User.create({
      email,
      password_hash: hashedPassword,
      nome,
      cognome,
      telefono
    });

    // Send verification email
    try {
      const verificationUrl = `${FRONTEND_URL}/verify-email?token=${verificationToken}`;
      await sendEmail({
        to: email,
        subject: 'Verify Your Email',
        html: `
          <h2>Welcome ${nome}!</h2>
          <p>Please verify your email address by clicking the link below:</p>
          <a href="${verificationUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Verify Email</a>
          <p>Or copy this link: ${verificationUrl}</p>
          <p>This link will expire in 24 hours.</p>
        `
      });
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Continue with registration even if email fails
    }

        // Get session metadata (fingerprint, IP, user agent)
    const sessionMetadata = getSessionMetadata(req);

    // Generate access token (JWT)
    const accessToken = generateAccessToken(user.id, user.email);

    // Generate and store refresh token (secure random string)
    const refreshTokenString = RefreshToken.generateToken();
    await RefreshToken.create(user.id, refreshTokenString, {
      userAgent: sessionMetadata.userAgent,
      ipAddress: sessionMetadata.ipAddress,
      fingerprint: sessionMetadata.fingerprint
    });

    // Update user login info
    await User.updateLastLogin(user.id, sessionMetadata.ipAddress);

    // Set cookies
    res.cookie('accessToken', accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('refreshToken', refreshTokenString, REFRESH_COOKIE_OPTIONS);


    res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
      data: {
        user: {
          id: user.id,
          email: user.email,
          nome: user.nome,
          cognome: user.cognome,
          emailVerified: false
        }
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.message === 'Email already exists') {
      return res.status(409).json({ 
        success: false, 
        message: 'An account with this email already exists',
        code: 'EMAIL_EXISTS'
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Registration failed. Please try again.',
      code: 'REGISTRATION_ERROR'
    });
  }
};

/**
 * Login user
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      // Generic error to prevent user enumeration
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Check if account is active
    if (!user.attivo) {
      return res.status(403).json({ 
        success: false, 
        message: 'Your account has been deactivated. Please contact support.',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Check if account is locked
    if (user.bloccato_fino && new Date(user.bloccato_fino) > new Date()) {
      const remainingTime = Math.ceil((new Date(user.bloccato_fino) - new Date()) / 1000 / 60);
      return res.status(423).json({ 
        success: false, 
        message: `Account is temporarily locked. Please try again in ${remainingTime} minutes.`,
        code: 'ACCOUNT_LOCKED',
        retryAfter: remainingTime * 60
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      // Increment failed login attempts
      const lockInfo = await User.incrementFailedLogins(user.id);
      
      let message = 'Invalid email or password';
      if (lockInfo && lockInfo.tentativi_falliti >= 3) {
        message = `Invalid credentials. ${5 - lockInfo.tentativi_falliti} attempts remaining before account lock.`;
      }
      
      return res.status(401).json({ 
        success: false, 
        message,
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Get session metadata (fingerprint, IP, user agent)
    const sessionMetadata = getSessionMetadata(req);

    // Generate access token (JWT)
    const accessToken = generateAccessToken(user.id, user.email);

    // Generate and store refresh token (secure random string)
    const refreshTokenString = RefreshToken.generateToken();
    await RefreshToken.create(user.id, refreshTokenString, {
      userAgent: sessionMetadata.userAgent,
      ipAddress: sessionMetadata.ipAddress,
      fingerprint: sessionMetadata.fingerprint
    });

    // Update user login info
    await User.updateLastLogin(user.id, sessionMetadata.ipAddress);

    // Set cookies
    res.cookie('accessToken', accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('refreshToken', refreshTokenString, REFRESH_COOKIE_OPTIONS);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          nome: user.nome,
          cognome: user.cognome,
          emailVerified: user.email_verificato
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Login failed. Please try again.',
      code: 'LOGIN_ERROR'
    });
  }
};

/**
 * Refresh access token
 * Uses token rotation for enhanced security
 */
exports.refreshToken = async (req, res) => {
  try {
    const oldRefreshToken = req.cookies.refreshToken;

    if (!oldRefreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required',
        code: 'NO_REFRESH_TOKEN'
      });
    }

    // Get session metadata for validation
    const sessionMetadata = getSessionMetadata(req);

    // Generate new refresh token
    const newRefreshTokenString = RefreshToken.generateToken();

    // Rotate token (revoke old, create new) with fingerprint validation
    const rotateResult = await RefreshToken.rotate(
      oldRefreshToken,
      newRefreshTokenString,
      {
        userAgent: sessionMetadata.userAgent,
        ipAddress: sessionMetadata.ipAddress,
        fingerprint: sessionMetadata.fingerprint
      }
    );

    // Get user data
    const user = await User.findById(rotateResult.userId);
    if (!user || !user.attivo) {
      return res.status(401).json({
        success: false,
        message: 'User not found or deactivated',
        code: 'INVALID_USER'
      });
    }

    // Generate new access token
    const accessToken = generateAccessToken(user.id, user.email);

    // Update cookies
    res.cookie('accessToken', accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('refreshToken', newRefreshTokenString, REFRESH_COOKIE_OPTIONS);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          nome: user.nome,
          cognome: user.cognome,
          emailVerified: user.email_verificato
        }
      }
    });

  } catch (error) {
    console.error('Refresh token error:', error);

    // Clear invalid refresh token
    res.clearCookie('refreshToken', { ...COOKIE_OPTIONS, path: '/api/auth' });

    // Handle specific errors
    if (error.message === 'INVALID_REFRESH_TOKEN') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }

    if (error.message === 'FINGERPRINT_MISMATCH') {
      return res.status(401).json({
        success: false,
        message: 'Session validation failed. Please login again.',
        code: 'FINGERPRINT_MISMATCH'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to refresh token',
      code: 'REFRESH_ERROR'
    });
  }
};

/**
 * Logout user
 */
exports.logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      try {
        await RefreshToken.revoke(refreshToken);
      } catch (error) {
        console.error('Token revocation failed:', error);
        // Continue with logout even if revocation fails
      }
    }

    // Clear cookies
    res.clearCookie('accessToken', COOKIE_OPTIONS);
    res.clearCookie('refreshToken', { ...COOKIE_OPTIONS, path: '/api/auth' });

    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    // Still clear cookies even on error
    res.clearCookie('accessToken', COOKIE_OPTIONS);
    res.clearCookie('refreshToken', { ...COOKIE_OPTIONS, path: '/api/auth' });
    
    res.json({
      success: true,
      message: 'Logout successful'
    });
  }
};

/**
 * Request password reset
 */
exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    // Always return success to prevent user enumeration
    const user = await User.findByEmail(email);
    
    if (user) {
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
      
      // Store token with expiry (1 hour)
      await User.createPasswordResetToken(user.id, hashedToken);

      // Send reset email
      try {
        const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;
        await sendEmail({
          to: email,
          subject: 'Password Reset Request',
          html: `
            <h2>Password Reset</h2>
            <p>Hi ${user.nome},</p>
            <p>You requested to reset your password. Click the link below:</p>
            <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
            <p>Or copy this link: ${resetUrl}</p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
          `
        });
      } catch (emailError) {
        console.error('Failed to send password reset email:', emailError);
      }
    }

    // Always return success (security best practice)
    res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent.'
    });

  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to process password reset request',
      code: 'RESET_REQUEST_ERROR'
    });
  }
};

/**
 * Reset password using token
 */
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Hash the token to match database
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid reset token
    const user = await User.findByPasswordResetToken(hashedToken);
    
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired reset token',
        code: 'INVALID_RESET_TOKEN'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    // Update password
    const updated = await User.updatePassword(user.id, hashedPassword);
    if (!updated) {
      throw new Error('Failed to update password');
    }

    // Revoke all refresh tokens for security
    await RefreshToken.revokeAllForUser(user.id);

    // Send confirmation email
    try {
      await sendEmail({
        to: user.email,
        subject: 'Password Changed Successfully',
        html: `
          <h2>Password Changed</h2>
          <p>Hi ${user.nome},</p>
          <p>Your password has been successfully changed.</p>
          <p>If you didn't make this change, please contact support immediately.</p>
        `
      });
    } catch (emailError) {
      console.error('Failed to send password change confirmation:', emailError);
    }

    res.json({
      success: true,
      message: 'Password reset successful. Please login with your new password.'
    });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reset password',
      code: 'RESET_ERROR'
    });
  }
};

/**
 * Verify email with token
 */
exports.verifyEmail = async (req, res) => {
  try {
    const token = req.body.token || req.params.token;

    const user = await User.verifyEmail(token);
    
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired verification token',
        code: 'INVALID_VERIFICATION_TOKEN'
      });
    }

    res.json({
      success: true,
      message: 'Email verified successfully. You can now login.',
      data: {
        email: user.email,
        nome: user.nome
      }
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to verify email',
      code: 'VERIFICATION_ERROR'
    });
  }
};

/**
 * Change password for authenticated user
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    // Update password
    await User.updatePassword(userId, hashedPassword);

    // Revoke all refresh tokens except current session
    const currentRefreshToken = req.cookies.refreshToken;
    await RefreshToken.revokeAllForUser(userId);
    
    // Re-create current session token if it exists
    if (currentRefreshToken) {
      const sessionMetadata = getSessionMetadata(req);
      const newRefreshToken = RefreshToken.generateToken();
      
      await RefreshToken.create(userId, newRefreshToken, {
        userAgent: sessionMetadata.userAgent,
        ipAddress: sessionMetadata.ipAddress,
        fingerprint: sessionMetadata.fingerprint
      });
      
      res.cookie('refreshToken', newRefreshToken, REFRESH_COOKIE_OPTIONS);
    }

    // Send confirmation email
    try {
      await sendEmail({
        to: user.email,
        subject: 'Password Changed Successfully',
        html: `
          <h2>Password Changed</h2>
          <p>Hi ${user.nome},</p>
          <p>Your password has been successfully changed.</p>
          <p>If you didn't make this change, please contact support immediately.</p>
        `
      });
    } catch (emailError) {
      console.error('Failed to send password change confirmation:', emailError);
    }

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to change password',
      code: 'PASSWORD_CHANGE_ERROR'
    });
  }
};

/**
 * Get user profile
 */
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        cognome: user.cognome,
        telefono: user.telefono,
        emailVerified: user.email_verificato,
        createdAt: user.created_at,
        lastLogin: user.ultimo_accesso
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve profile',
      code: 'PROFILE_ERROR'
    });
  }
};

/**
 * Update user profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { nome, cognome, telefono } = req.body;

    const updatedUser = await User.updateProfile(userId, {
      nome,
      cognome,
      telefono
    });

    if (!updatedUser) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: updatedUser.id,
        email: updatedUser.email,
        nome: updatedUser.nome,
        cognome: updatedUser.cognome,
        telefono: updatedUser.telefono
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update profile',
      code: 'UPDATE_PROFILE_ERROR'
    });
  }
};

/**
 * Get active sessions with enhanced device info
 */
exports.getSessions = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const sessions = await RefreshToken.getActiveSessions(userId);
    const stats = await RefreshToken.getSessionStats(userId);
    
    res.json({
      success: true,
      data: {
        sessions: sessions.map(session => ({
          id: session.id,
          deviceType: session.device_type,
          browser: session.browser,
          status: session.status,
          userAgent: session.user_agent,
          ipAddress: session.ip_address,
          lastUsedAt: session.last_used_at,
          createdAt: session.created_at,
          expiresAt: session.expires_at
        })),
        stats
      }
    });

  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve sessions',
      code: 'SESSIONS_ERROR'
    });
  }
};

/**
 * Revoke a specific session by ID
 */
exports.revokeSession = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;

    const revoked = await RefreshToken.revokeById(sessionId, userId);

    if (!revoked) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: 'Session revoked successfully'
    });

  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke session',
      code: 'REVOKE_SESSION_ERROR'
    });
  }
};

/**
 * Revoke all sessions (logout from all devices)
 */
exports.revokeAllSessions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const currentRefreshToken = req.cookies.refreshToken;

    // Get count before revoking
    const sessions = await RefreshToken.getActiveSessions(userId);
    
    // Revoke all
    await RefreshToken.revokeAllForUser(userId);
    
    // Re-create current session if token exists
    if (currentRefreshToken) {
      const sessionMetadata = getSessionMetadata(req);
      const newRefreshToken = RefreshToken.generateToken();
      
      await RefreshToken.create(userId, newRefreshToken, {
        userAgent: sessionMetadata.userAgent,
        ipAddress: sessionMetadata.ipAddress,
        fingerprint: sessionMetadata.fingerprint
      });

      res.cookie('refreshToken', newRefreshToken, REFRESH_COOKIE_OPTIONS);
    }
    
    res.json({
      success: true,
      message: `${Math.max(0, sessions.length - 1)} other sessions revoked successfully`,
      data: {
        revokedCount: Math.max(0, sessions.length - 1)
      }
    });

  } catch (error) {
    console.error('Revoke all sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke sessions',
      code: 'REVOKE_SESSIONS_ERROR'
    });
  }
};

/**
 * Check for suspicious activity
 */
exports.checkSecurity = async (req, res) => {
  try {
    const userId = req.user.userId;

    const securityCheck = await RefreshToken.detectSuspiciousActivity(userId);

    res.json({
      success: true,
      data: securityCheck
    });

  } catch (error) {
    console.error('Security check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check security',
      code: 'SECURITY_CHECK_ERROR'
    });
  }
};