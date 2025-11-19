const crypto = require('crypto');

/**
 * Browser Fingerprinting Utilities
 * Creates a unique identifier for each browser/device combination
 * Used for additional security in refresh token validation
 */

/**
 * Generate a fingerprint from request headers
 * Combines multiple browser characteristics into a unique hash
 */
exports.generateFingerprint = (req) => {
  const components = [
    // User agent (browser, OS, device info)
    req.headers['user-agent'] || '',
    
    // Language preferences
    req.headers['accept-language'] || '',
    
    // Encoding preferences
    req.headers['accept-encoding'] || '',
    
    // Content type preferences
    req.headers['accept'] || '',
    
    // Additional headers that tend to be consistent per browser
    req.headers['dnt'] || '', // Do Not Track
    req.headers['upgrade-insecure-requests'] || ''
  ].join('|');
  
  return crypto
    .createHash('sha256')
    .update(components)
    .digest('hex');
};

/**
 * Extract IP address from request
 * Handles proxies and load balancers
 */
exports.getIpAddress = (req) => {
  // Check for proxy headers (in order of reliability)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs: "client, proxy1, proxy2"
    return forwarded.split(',')[0].trim();
  }
  
  // Cloudflare
  if (req.headers['cf-connecting-ip']) {
    return req.headers['cf-connecting-ip'];
  }
  
  // Other common headers
  if (req.headers['x-real-ip']) {
    return req.headers['x-real-ip'];
  }
  
  // Fallback to socket address
  return req.socket.remoteAddress || req.connection.remoteAddress || 'unknown';
};

/**
 * Get user agent string
 */
exports.getUserAgent = (req) => {
  return req.headers['user-agent'] || 'unknown';
};

/**
 * Parse user agent to extract device/browser info
 * Returns human-readable device information
 */
exports.parseUserAgent = (userAgent) => {
  if (!userAgent) {
    return {
      browser: 'Unknown',
      device: 'Unknown',
      os: 'Unknown'
    };
  }

  // Device detection
  let device = 'Desktop';
  if (/Mobile|Android|iPhone/i.test(userAgent)) {
    device = 'Mobile';
  } else if (/Tablet|iPad/i.test(userAgent)) {
    device = 'Tablet';
  }

  // Browser detection
  let browser = 'Other';
  if (/Chrome/i.test(userAgent) && !/Edg/i.test(userAgent)) {
    browser = 'Chrome';
  } else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) {
    browser = 'Safari';
  } else if (/Firefox/i.test(userAgent)) {
    browser = 'Firefox';
  } else if (/Edg/i.test(userAgent)) {
    browser = 'Edge';
  } else if (/MSIE|Trident/i.test(userAgent)) {
    browser = 'Internet Explorer';
  }

  // OS detection
  let os = 'Unknown';
  if (/Windows/i.test(userAgent)) {
    os = 'Windows';
  } else if (/Mac OS X/i.test(userAgent)) {
    os = 'macOS';
  } else if (/Linux/i.test(userAgent)) {
    os = 'Linux';
  } else if (/Android/i.test(userAgent)) {
    os = 'Android';
  } else if (/iOS|iPhone|iPad/i.test(userAgent)) {
    os = 'iOS';
  }

  return { browser, device, os };
};

/**
 * Middleware to attach fingerprint to request
 * Add this to routes that need fingerprinting
 */
exports.attachFingerprint = (req, res, next) => {
  req.fingerprint = exports.generateFingerprint(req);
  req.clientIp = exports.getIpAddress(req);
  req.userAgent = exports.getUserAgent(req);
  next();
};

/**
 * Validate that fingerprint matches (security check)
 * Returns true if fingerprints match or if fingerprinting is not enforced
 */
exports.validateFingerprint = (stored, current) => {
  // If no stored fingerprint, don't enforce (backward compatibility)
  if (!stored) {
    return true;
  }
  
  // If no current fingerprint, reject
  if (!current) {
    return false;
  }
  
  // Compare
  return stored === current;
};

/**
 * Get session metadata from request
 * Convenience function to get all session-related data at once
 */
exports.getSessionMetadata = (req) => {
  return {
    fingerprint: exports.generateFingerprint(req),
    ipAddress: exports.getIpAddress(req),
    userAgent: exports.getUserAgent(req),
    deviceInfo: exports.parseUserAgent(req.headers['user-agent'])
  };
};