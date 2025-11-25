require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const morgan = require('morgan');
const authRoutes = require('./routes/auth');
const restaurantRoutes = require('./routes/restaurant');
const { testConnection } = require('./config/database');
const { testEmailConfiguration } = require('./utils/emailService');
const { cleanup: cleanupRateLimiter } = require('./utils/rateLimiter');
const { initializeCronJobs, stopCronJobs } = require('./utils/cronJobs'); // NEW!
const {
  securityHeaders,
  requestLogger
} = require('./middleware/authMiddleware');

// Validate required environment variables
const requiredEnvVars = [
  'JWT_ACCESS_SECRET',
  // 'JWT_REFRESH_SECRET', // REMOVED - no longer needed!
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('Using default values for missing environment variables (development only)');
  }
}

const app = express();

// Trust proxy (for correct IP addresses behind reverse proxy)
app.set('trust proxy', process.env.TRUST_PROXY === 'true' || 1);

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Additional security headers
app.use(securityHeaders);

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'];
    
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400 // Cache preflight response for 24 hours
};

app.use(cors(corsOptions));

// Compression
app.use(compression());

// Logging
if (process.env.NODE_ENV === 'production') {
  // Use combined format in production
  app.use(morgan('combined'));
} else {
  // Use dev format in development
  app.use(morgan('dev'));
}

// Custom request logger
app.use(requestLogger);

// Cookie parser
app.use(cookieParser(process.env.COOKIE_SECRET || 'default-cookie-secret'));

// Body parsing middleware with size limits
app.use(express.json({ 
  limit: process.env.MAX_REQUEST_SIZE || '10mb',
  verify: (req, res, buf, encoding) => {
    // Store raw body for webhook signature verification if needed
    if (req.get('X-Hub-Signature') || req.get('X-Webhook-Signature')) {
      req.rawBody = buf.toString(encoding || 'utf8');
    }
  }
}));

app.use(express.urlencoded({ 
  extended: true,
  limit: process.env.MAX_REQUEST_SIZE || '10mb'
}));

// Request timeout
app.use((req, res, next) => {
  const timeout = parseInt(process.env.REQUEST_TIMEOUT) || 30000; // 30 seconds default
  req.setTimeout(timeout, () => {
    res.status(408).json({
      success: false,
      message: 'Request timeout',
      code: 'REQUEST_TIMEOUT'
    });
  });
  next();
});

// ============================================================================
// ROUTES
// ============================================================================

// Health check endpoint (before auth routes)
app.get('/health', async (req, res) => {
  const dbHealth = await testConnection();
  const emailHealth = await testEmailConfiguration();
  
  const health = {
    status: dbHealth ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    services: {
      database: dbHealth ? 'connected' : 'disconnected',
      email: emailHealth.success ? 'configured' : 'unconfigured'
    }
  };
  
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// API routes
app.use('/api/auth', authRoutes);

// Restaurant routes
app.use('/api/restaurants', restaurantRoutes);

// Test endpoint (development only)
if (process.env.NODE_ENV !== 'production') {
  app.post('/test', (req, res) => {
    console.log('Test endpoint hit');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    console.log('Cookies:', req.cookies);
    res.json({
      message: 'Test successful',
      body: req.body,
      cookies: req.cookies
    });
  });
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Resource not found',
    code: 'NOT_FOUND',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  // Handle CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS policy violation',
      code: 'CORS_ERROR'
    });
  }
  
  // Handle JSON parsing errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON in request body',
      code: 'INVALID_JSON'
    });
  }
  
  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors: err.errors
    });
  }
  
  // Default error response
  const isDevelopment = process.env.NODE_ENV !== 'production';
  res.status(err.status || 500).json({
    success: false,
    message: isDevelopment ? err.message : 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
    ...(isDevelopment && { stack: err.stack })
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// Initialize database connection
testConnection()
  .then(connected => {
    if (!connected) {
      console.error('Failed to connect to database');
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      }
    } else {
      console.log('Database connection established');
    }
  })
  .catch(err => {
    console.error('Database connection error:', err);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  });

// Start server
const server = app.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║            AUTH SERVER STARTED                   ║
╠══════════════════════════════════════════════════╣
║  Environment: ${process.env.NODE_ENV || 'development'}
║  Server:      http://${HOST}:${PORT}
║  Health:      http://${HOST}:${PORT}/health
║  API Base:    http://${HOST}:${PORT}/api/auth
╚══════════════════════════════════════════════════╝
  `);
  
  // Initialize cron jobs for token cleanup and monitoring
  initializeCronJobs();
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

const gracefulShutdown = async (signal) => {
  console.log(`
Received ${signal}. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(async () => {
    console.log('HTTP server closed');
    
    try {
      // Stop cron jobs
      stopCronJobs();
      console.log('Cron jobs stopped');
      
      // Cleanup rate limiter
      await cleanupRateLimiter();
      console.log('Rate limiter cleaned up');
      
      // Close database connections
      const { pool } = require('./config/database');
      await pool.end();
      console.log('Database connections closed');
      
      console.log('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

module.exports = app; // For testing purposes
