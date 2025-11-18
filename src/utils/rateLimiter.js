const Redis = require('ioredis');

// Redis client (optional - falls back to in-memory if not available)
let redisClient = null;

if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 50, 2000),
    enableReadyCheck: true,
    lazyConnect: true
  });

  redisClient.on('error', (err) => {
    console.error('Redis connection error:', err);
    redisClient = null; // Fall back to in-memory
  });

  redisClient.on('connect', () => {
    console.log('Redis connected for rate limiting');
  });
}

// In-memory store fallback
class InMemoryStore {
  constructor() {
    this.store = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Clean every minute
  }

  async increment(key, windowMs) {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!this.store.has(key)) {
      this.store.set(key, []);
    }
    
    const timestamps = this.store.get(key).filter(t => t > windowStart);
    timestamps.push(now);
    this.store.set(key, timestamps);
    
    return timestamps.length;
  }

  cleanup() {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour
    
    for (const [key, timestamps] of this.store.entries()) {
      const validTimestamps = timestamps.filter(t => t > now - maxAge);
      if (validTimestamps.length === 0) {
        this.store.delete(key);
      } else {
        this.store.set(key, validTimestamps);
      }
    }
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

const inMemoryStore = new InMemoryStore();

/**
 * Rate limiter middleware factory
 */
const RateLimiter = ({
  windowMs = 15 * 60 * 1000, // 15 minutes default
  maxAttempts = 5,
  message = 'Too many requests, please try again later.',
  keyGenerator = (req) => req.ip,
  skipSuccessfulRequests = false,
  skipFailedRequests = false
}) => {
  return async (req, res, next) => {
    try {
      const key = `rate_limit:${keyGenerator(req)}`;
      let attempts;

      if (redisClient && redisClient.status === 'ready') {
        // Use Redis
        const multi = redisClient.multi();
        const ttl = Math.ceil(windowMs / 1000);
        
        multi.incr(key);
        multi.expire(key, ttl);
        
        const results = await multi.exec();
        attempts = results[0][1];
        
        // Set headers
        res.setHeader('X-RateLimit-Limit', maxAttempts);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, maxAttempts - attempts));
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + windowMs).toISOString());
      } else {
        // Use in-memory store
        attempts = await inMemoryStore.increment(key, windowMs);
        
        // Set headers
        res.setHeader('X-RateLimit-Limit', maxAttempts);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, maxAttempts - attempts));
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + windowMs).toISOString());
      }

      if (attempts > maxAttempts) {
        // Rate limit exceeded
        return res.status(429).json({
          success: false,
          message,
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }

      // Store original end function
      const originalEnd = res.end;
      
      // Override end function to check response status
      res.end = function(...args) {
        const shouldSkip = 
          (skipSuccessfulRequests && res.statusCode < 400) ||
          (skipFailedRequests && res.statusCode >= 400);
        
        if (shouldSkip && redisClient && redisClient.status === 'ready') {
          // Decrement the counter if we should skip this request
          redisClient.decr(key).catch(err => {
            console.error('Error decrementing rate limit:', err);
          });
        }
        
        originalEnd.apply(res, args);
      };

      next();
    } catch (error) {
      console.error('Rate limiting error:', error);
      // Don't block request on rate limiter failure
      next();
    }
  };
};

/**
 * Advanced rate limiter with progressive delays
 */
const ProgressiveRateLimiter = ({
  attempts = [
    { maxAttempts: 3, windowMs: 60 * 1000 },       // 3 attempts per minute
    { maxAttempts: 5, windowMs: 15 * 60 * 1000 },  // 5 attempts per 15 minutes
    { maxAttempts: 10, windowMs: 60 * 60 * 1000 }  // 10 attempts per hour
  ],
  keyGenerator = (req) => req.ip,
  message = 'Too many attempts. Please try again later.'
}) => {
  return async (req, res, next) => {
    try {
      const baseKey = keyGenerator(req);
      
      for (const { maxAttempts, windowMs } of attempts) {
        const key = `rate_limit:${baseKey}:${windowMs}`;
        let count;
        
        if (redisClient && redisClient.status === 'ready') {
          const ttl = Math.ceil(windowMs / 1000);
          const multi = redisClient.multi();
          
          multi.incr(key);
          multi.expire(key, ttl);
          
          const results = await multi.exec();
          count = results[0][1];
        } else {
          count = await inMemoryStore.increment(key, windowMs);
        }
        
        if (count > maxAttempts) {
          const retryAfter = Math.ceil(windowMs / 1000);
          return res.status(429).json({
            success: false,
            message: `${message} (Limit: ${maxAttempts} attempts per ${Math.ceil(windowMs / 60000)} minutes)`,
            retryAfter
          });
        }
      }
      
      next();
    } catch (error) {
      console.error('Progressive rate limiting error:', error);
      next();
    }
  };
};

/**
 * IP-based rate limiter
 */
const ipRateLimiter = RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 100,
  message: 'Too many requests from this IP, please try again later.',
  keyGenerator: (req) => req.ip || req.connection.remoteAddress
});

/**
 * Cleanup function for graceful shutdown
 */
const cleanup = async () => {
  inMemoryStore.destroy();
  if (redisClient) {
    await redisClient.quit();
  }
};

module.exports = {
  RateLimiter,
  ProgressiveRateLimiter,
  ipRateLimiter,
  cleanup
};