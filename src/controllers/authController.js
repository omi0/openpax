const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User, RefreshToken, PasswordReset } = require('../models/User');


const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TOKEN_EXPIRY = '15m';      // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d';      // 7 days
const BCRYPT_ROUNDS = 13;               // Bcrypt salt rounds

// Cookie options
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // Only HTTPS in production
  sameSite: 'strict',
  path: '/'
};

const ACCESS_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 15 * 60 * 1000 // 15 minutes in milliseconds
};

const REFRESH_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
};


/**
 * Generate Access and Refresh Tokens
 */
const generateTokens = (userId, email) => {
  const accessToken = jwt.sign(
    { userId, email, type: 'access' },
    JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  return { accessToken, refreshToken };
};

/**
 * Register a new user
 */
exports.register = async (req, res) => {
  try {
    const { email, password, name, surname } = req.body;

    // Validation
    if (!email || !password || !name || !surname) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email, password, and full name are required' 
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid email format' 
      });
    }

    // Password strength validation
    if (password.length < 8) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 8 characters long' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        message: 'User with this email already exists' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create user
    const userId = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      surname,
      emailVerified: false
    });

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    //await EmailVerification.create(userId, verificationToken);

    // TODO: Send verification email
    // await sendVerificationEmail(email, verificationToken);

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please verify your email.',
      data: {
        userId,
        email: email.toLowerCase(),
        name
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error during registration' 
    });
  }
};

/**
 * Login user
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }

    // Find user
    const user = await User.findByEmail(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    // Check if account is locked
    if (user.accountLocked && user.lockUntil > Date.now()) {
      const remainingTime = Math.ceil((user.lockUntil - Date.now()) / 1000 / 60);
      return res.status(423).json({ 
        success: false, 
        message: `Account is locked. Try again in ${remainingTime} minutes.` 
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      await User.incrementFailedLogins(user.id);
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    // Reset failed login attempts on successful login
    await User.resetFailedLogins(user.id);

    // Check if email is verified (optional)
    if (!user.emailVerified) {
      return res.status(403).json({ 
        success: false, 
        message: 'Please verify your email before logging in' 
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id, user.email);

    // Store refresh token
    await RefreshToken.create(user.id, refreshToken);

    // Update last login
    await User.updateLastLogin(user.id);

    // Set cookies
    res.cookie('accessToken', accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error during login' 
    });
  }
};

/**
 * Refresh access token
 */
exports.refreshToken = async (req, res) => {
  try {
    // Read refresh token from cookie instead of body
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'Refresh token is required' 
      });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (error) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid or expired refresh token' 
      });
    }

    // Check if refresh token exists in database
    const tokenExists = await RefreshToken.findByToken(refreshToken);
    if (!tokenExists) {
      return res.status(401).json({ 
        success: false, 
        message: 'Refresh token not found or revoked' 
      });
    }

    // Get user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Generate new tokens
    const tokens = generateTokens(user.id, user.email);

    // Store new refresh token and revoke old one
    await RefreshToken.revoke(refreshToken);
    await RefreshToken.create(user.id, tokens.refreshToken);

    // Set new cookies
    res.cookie('accessToken', tokens.accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);

    res.json({
      success: true,
      message: 'Token refreshed successfully'
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error during token refresh' 
    });
  }
};

/**
 * Logout user
 */
exports.logout = async (req, res) => {
  try {
    // Read refresh token from cookie
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      await RefreshToken.revoke(refreshToken);
    }

    // Clear cookies
    res.clearCookie('accessToken', COOKIE_OPTIONS);
    res.clearCookie('refreshToken', COOKIE_OPTIONS);

    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error during logout' 
    });
  }
};

/**
 * Request password reset
 */
exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
    }

    const user = await User.findByEmail(email.toLowerCase());
    
    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    await PasswordReset.create(user.id, hashedToken);

    // TODO: Send password reset email
    // await sendPasswordResetEmail(email, resetToken);

    res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent'
    });

  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

/**
 * Reset password
 */
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Token and new password are required' 
      });
    }

    // Password strength validation
    if (newPassword.length < 8) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 8 characters long' 
      });
    }

    // Hash the token to compare with database
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find valid reset token
    const resetRecord = await PasswordReset.findValidToken(hashedToken);
    if (!resetRecord) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired reset token' 
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    // Update password
    await User.updatePassword(resetRecord.userId, hashedPassword);

    // Delete used reset token
    await PasswordReset.delete(hashedToken);

    // Revoke all refresh tokens for security
    await RefreshToken.revokeAllForUser(resetRecord.userId);

    res.json({
      success: true,
      message: 'Password reset successful. Please login with your new password.'
    });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error during password reset' 
    });
  }
};

/**
 * Verify email
 */
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ 
        success: false, 
        message: 'Verification token is required' 
      });
    }

    // Find verification record
    const verification = await EmailVerification.findByToken(token);
    if (!verification) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired verification token' 
      });
    }

    // Verify email
    await User.verifyEmail(verification.userId);

    // Delete verification token
    await EmailVerification.delete(token);

    res.json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error during email verification' 
    });
  }
};

/**
 * Change password (for authenticated users)
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId; // From auth middleware

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Current and new password are required' 
      });
    }

    // Password strength validation
    if (newPassword.length < 8) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 8 characters long' 
      });
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Current password is incorrect' 
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    // Update password
    await User.updatePassword(userId, hashedPassword);

    // Revoke all refresh tokens for security
    await RefreshToken.revokeAllForUser(userId);

    res.json({
      success: true,
      message: 'Password changed successfully. Please login again.'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error during password change' 
    });
  }
};
