/**
 * For production, use Redis or a dedicated rate limiting service
 */
class RateLimiterStore {
  constructor() {
    this.store = new Map();
  }

  increment(key) {
    const now = Date.now();
    const record = this.store.get(key) || { count: 0, resetTime: now };
    
    record.count++;
    this.store.set(key, record);
    
    return record;
  }

  reset(key) {
    this.store.delete(key);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (now > record.resetTime) {
        this.store.delete(key);
      }
    }
  }
}

const store = new RateLimiterStore();

// Cleanup old entries every 10 minutes
setInterval(() => store.cleanup(), 10 * 60 * 1000);

exports.RateLimiter = (options) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    maxAttempts = 5,
    message = 'Too many requests',
    keyGenerator = (req) => req.ip
  } = options;

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    
    let record = store.store.get(key);
    
    // Reset if window expired
    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        resetTime: now + windowMs
      };
      store.store.set(key, record);
    }

    record.count++;

    if (record.count > maxAttempts) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.set('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        message,
        retryAfter
      });
    }

    next();
  };
};