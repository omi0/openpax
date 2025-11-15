const jwt = require('jsonwebtoken');
const { RateLimiter } = require('./utils/rateLimiter');

/**
 * Verify JWT access token
 */
exports.authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access token is required' 
      });
    }

    // Verify token
    jwt.verify(token, JWT_ACCESS_SECRET, (err, decoded) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({ 
            success: false, 
            message: 'Access token expired',
            code: 'TOKEN_EXPIRED'
          });
        }
        return res.status(403).json({ 
          success: false, 
          message: 'Invalid access token' 
        });
      }

      // Check token type
      if (decoded.type !== 'access') {
        return res.status(403).json({ 
          success: false, 
          message: 'Invalid token type' 
        });
      }

      req.user = decoded;
      next();
    });

  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error during authentication' 
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
exports.optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      return next();
    }

    jwt.verify(token, JWT_ACCESS_SECRET, (err, decoded) => {
      if (err) {
        req.user = null;
      } else if (decoded.type === 'access') {
        req.user = decoded;
      } else {
        req.user = null;
      }
      next();
    });

  } catch (error) {
    req.user = null;
    next();
  }
};

/**
 * Rate limiting middleware
 */
exports.rateLimitLogin = RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxAttempts: 5,
  message: 'Too many login attempts. Please try again later.',
  keyGenerator: (req) => req.body.email || req.ip
});

exports.rateLimitPasswordReset = RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxAttempts: 1,
  message: 'Too many password reset requests. Please try again later.',
  keyGenerator: (req) => req.body.email || req.ip
});

exports.rateLimitRegister = RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxAttempts: 1,
  message: 'Too many registration attempts. Please try again later.',
  keyGenerator: (req) => req.ip
});