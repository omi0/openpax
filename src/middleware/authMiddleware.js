const jwt = require('jsonwebtoken');
const { RateLimiter, ProgressiveRateLimiter } = require('../utils/rateLimiter');
const { User } = require('../models/User');
const { attachFingerprint } = require('../utils/fingerprint');
const logger = require('../config/logger');

// Environment variables with defaults
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'change-this-secret-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'change-this-refresh-secret-in-production';
const CSRF_SECRET = process.env.CSRF_SECRET || 'change-this-csrf-secret-in-production';

/**
 * Verify JWT access token from HttpOnly cookie
 */
exports.authenticateToken = async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    // Read token from cookie
    const token = req.cookies?.accessToken;

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access token required',
        code: 'NO_TOKEN'
      });
    }
    // Verify token
    jwt.verify(token, JWT_ACCESS_SECRET, async (err, decoded) => {
      if (err) {
        logger.warn({ 
          error: err.name, 
          ip: req.ip 
        }, 'Token verification failed');
        
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({ 
            success: false, 
            message: 'Access token expired',
            code: 'TOKEN_EXPIRED'
          });
        }
        if (err.name === 'JsonWebTokenError') {
          return res.status(403).json({ 
            success: false, 
            message: 'Invalid access token',
            code: 'INVALID_TOKEN'
          });
        }
        return res.status(403).json({ 
          success: false, 
          message: 'Token verification failed',
          code: 'VERIFICATION_FAILED'
        });
      }
      //Verify token type and structure 
      if (!decoded.type || decoded.type !== 'access') {
        return res.status(403).json({ 
          success: false, 
          message: 'Invalid token type',
          code: 'INVALID_TOKEN_TYPE'
        });
      }
      //Check if user still exists and is active
      const user = await User.findById(decoded.userId);
      if (!user) {
        logger.warn({ userId: decoded.userId }, 'Token valid but user not found');
        return res.status(401).json({ 
          success: false, 
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      if (!user.attivo) {
        return res.status(401).json({ 
          success: false, 
          message: 'Account deactivated',
          code: 'ACCOUNT_DEACTIVATED'
        });
      }
      //Attach user to request 
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        nome: user.nome,
        cognome: user.cognome,
        emailVerified: user.email_verificato
      };
      
      logger.debug({ 
        userId: req.user.userId, 
        duration: Date.now() - startTime 
      }, 'Token authenticated');
      
      next();
    });

  } catch (error) {
    logger.error({ err: error, ip: req.ip }, 'Authentication error');
    res.status(500).json({ 
      success: false, 
      message: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
exports.optionalAuth = async (req, res, next) => {
  try {
    const token = req.cookies?.accessToken;

    if (!token) {
      req.user = null;
      return next();
    }

    jwt.verify(token, JWT_ACCESS_SECRET, async (err, decoded) => {
      if (err || decoded.type !== 'access') {
        req.user = null;
      } else {
        const user = await User.findById(decoded.userId);
        if (user && user.attivo) {
          req.user = {
            userId: decoded.userId,
            email: decoded.email,
            nome: user.nome,
            cognome: user.cognome,
            emailVerified: user.email_verificato
          };
        } else {
          req.user = null;
        }
      }
      next();
    });

  } catch (error) {
    req.user = null;
    next();
  }
};

/**
 * Require email verification
 */
exports.requireEmailVerification = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  if (!req.user.emailVerified) {
    return res.status(403).json({ 
      success: false, 
      message: 'Email verification required',
      code: 'EMAIL_NOT_VERIFIED'
    });
  }

  next();
};

/**
 * CSRF Protection Middleware
 */
exports.csrfProtection = (req, res, next) => {
  // Skip for GET requests
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const token = req.headers['x-csrf-token'] || req.body._csrf;
  const sessionToken = req.session?.csrfToken;

  if (!token || !sessionToken || token !== sessionToken) {
    return res.status(403).json({
      success: false,
      message: 'Invalid CSRF token',
      code: 'CSRF_INVALID'
    });
  }

  next();
};

/**
 * Rate limiting configurations
 */

// Login rate limiting - Progressive delays
exports.rateLimitLogin = ProgressiveRateLimiter({
  attempts: [
    { maxAttempts: 3, windowMs: 60 * 1000 },       // 3 attempts per minute
    { maxAttempts: 5, windowMs: 15 * 60 * 1000 },  // 5 attempts per 15 minutes
    { maxAttempts: 10, windowMs: 60 * 60 * 1000 }  // 10 attempts per hour
  ],
  message: 'Too many login attempts',
  keyGenerator: (req) => {
    // Use email if provided, otherwise IP
    const email = req.body?.email;
    return email ? `login:${email.toLowerCase()}` : `login:${req.ip}`;
  }
});

// Password reset rate limiting - Very strict
exports.rateLimitPasswordReset = RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxAttempts: 3,
  message: 'Too many password reset requests',
  keyGenerator: (req) => {
    const email = req.body?.email;
    return email ? `reset:${email.toLowerCase()}` : `reset:${req.ip}`;
  }
});

// Registration rate limiting - Per IP
exports.rateLimitRegister = RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxAttempts: 5,
  message: 'Too many registration attempts',
  keyGenerator: (req) => `register:${req.ip}`
});

// API rate limiting - General
exports.rateLimitAPI = RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxAttempts: 100,
  message: 'Too many API requests',
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    return req.user ? `api:user:${req.user.userId}` : `api:ip:${req.ip}`;
  }
});

// Strict rate limiting for sensitive operations
exports.rateLimitStrict = RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxAttempts: 3,
  message: 'Too many attempts for this operation',
  keyGenerator: (req) => {
    return req.user ? `strict:user:${req.user.userId}` : `strict:ip:${req.ip}`;
  }
});

/**
 * Security headers middleware
 */
exports.securityHeaders = (req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Feature policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
};

/**
 * Request logging middleware
 */
exports.requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.userId || null
    };
    
    if (process.env.NODE_ENV === 'development') {
      console.log('Request:', logData);
    }
    
    // In production, you might want to send this to a logging service
  });
  
  next();
};

exports.attachFingerprint = attachFingerprint;