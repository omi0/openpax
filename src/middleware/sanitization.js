const validator = require('validator');

/**
 * Input Sanitization Middleware
 * Sanitizes and validates input to prevent XSS and injection attacks
 */

/**
 * Sanitize string input - removes dangerous characters
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  
  // Trim whitespace
  str = str.trim();
  
  // Escape HTML to prevent XSS
  str = validator.escape(str);
  
  return str;
};

/**
 * Sanitize email
 */
const sanitizeEmail = (email) => {
  if (typeof email !== 'string') return email;
  
  email = email.trim().toLowerCase();
  
  // Normalize email
  return validator.normalizeEmail(email, {
    gmail_remove_dots: false,
    gmail_remove_subaddress: false,
    outlookdotcom_remove_subaddress: false,
    yahoo_remove_subaddress: false,
    icloud_remove_subaddress: false
  });
};

/**
 * Middleware: Sanitize registration input
 */
exports.sanitizeRegistration = (req, res, next) => {
  if (req.body.email) {
    req.body.email = sanitizeEmail(req.body.email);
    
    // Validate email format
    if (!validator.isEmail(req.body.email)) {
      return res.status(400).json({
        success: false,
        message: 'Formato email non valido'
      });
    }
  }
  
  if (req.body.nome) {
    req.body.nome = sanitizeString(req.body.nome);
    
    // Validate length
    if (req.body.nome.length < 2 || req.body.nome.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Nome deve essere tra 2 e 100 caratteri'
      });
    }
  }
  
  if (req.body.cognome) {
    req.body.cognome = sanitizeString(req.body.cognome);
    
    // Validate length
    if (req.body.cognome.length < 2 || req.body.cognome.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Cognome deve essere tra 2 e 100 caratteri'
      });
    }
  }
  
  if (req.body.telefono) {
    req.body.telefono = sanitizeString(req.body.telefono);
    
    // Optional: Validate phone format
    if (req.body.telefono && !validator.isMobilePhone(req.body.telefono, 'any')) {
      return res.status(400).json({
        success: false,
        message: 'Formato telefono non valido'
      });
    }
  }
  
  // Password - don't sanitize (allow special chars) but validate
  if (req.body.password) {
    if (typeof req.body.password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Password non valida'
      });
    }
    
    // Check length
    if (req.body.password.length < 8 || req.body.password.length > 128) {
      return res.status(400).json({
        success: false,
        message: 'Password deve essere tra 8 e 128 caratteri'
      });
    }
    
    // Check for common weak passwords (optional but recommended)
    const weakPasswords = ['password', '12345678', 'password123', 'qwerty123'];
    if (weakPasswords.includes(req.body.password.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Password troppo debole. Scegli una password più sicura.'
      });
    }
  }
  
  next();
};

/**
 * Middleware: Sanitize login input
 */
exports.sanitizeLogin = (req, res, next) => {
  if (req.body.email) {
    req.body.email = sanitizeEmail(req.body.email);
    
    if (!validator.isEmail(req.body.email)) {
      return res.status(400).json({
        success: false,
        message: 'Formato email non valido'
      });
    }
  }
  
  // Password validation (basic)
  if (req.body.password) {
    if (typeof req.body.password !== 'string' || req.body.password.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Password obbligatoria'
      });
    }
  }
  
  next();
};

/**
 * Middleware: Sanitize email input (for password reset, etc)
 */
exports.sanitizeEmailInput = (req, res, next) => {
  if (req.body.email) {
    req.body.email = sanitizeEmail(req.body.email);
    
    if (!validator.isEmail(req.body.email)) {
      return res.status(400).json({
        success: false,
        message: 'Formato email non valido'
      });
    }
  }
  
  next();
};

/**
 * Middleware: Sanitize token input
 */
exports.sanitizeToken = (req, res, next) => {
  if (req.body.token) {
    // Token should be alphanumeric
    if (typeof req.body.token !== 'string' || !validator.isAlphanumeric(req.body.token)) {
      return res.status(400).json({
        success: false,
        message: 'Token non valido'
      });
    }
    
    // Validate length (adjust based on your token length)
    if (req.body.token.length < 32 || req.body.token.length > 128) {
      return res.status(400).json({
        success: false,
        message: 'Token non valido'
      });
    }
  }
  
  next();
};

/**
 * Middleware: Sanitize password change input
 */
exports.sanitizePasswordChange = (req, res, next) => {
  ['currentPassword', 'newPassword'].forEach(field => {
    if (req.body[field]) {
      if (typeof req.body[field] !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Password non valida'
        });
      }
      
      if (req.body[field].length < 8 || req.body[field].length > 128) {
        return res.status(400).json({
          success: false,
          message: 'Password deve essere tra 8 e 128 caratteri'
        });
      }
    }
  });
  
  next();
};

/**
 * General XSS protection middleware
 */
exports.xssProtection = (req, res, next) => {
  // Check for common XSS patterns in all string fields
  const xssPatterns = [
    /<script[^>]*>[\s\S]*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe/gi,
    /<embed/gi,
    /<object/gi
  ];
  
  const checkForXSS = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        for (const pattern of xssPatterns) {
          if (pattern.test(obj[key])) {
            return true;
          }
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (checkForXSS(obj[key])) {
          return true;
        }
      }
    }
    return false;
  };
  
  if (checkForXSS(req.body)) {
    return res.status(400).json({
      success: false,
      message: 'Input non valido rilevato'
    });
  }
  
  next();
};

/**
 * Validate UUID format (for future use with UUID primary keys)
 */
exports.validateUUID = (paramName) => {
  return (req, res, next) => {
    const uuid = req.params[paramName];
    
    if (uuid && !validator.isUUID(uuid)) {
      return res.status(400).json({
        success: false,
        message: 'ID non valido'
      });
    }
    
    next();
  };
};

/**
 * Content-Type validation
 */
exports.requireJSON = (req, res, next) => {
  if (req.method !== 'GET' && !req.is('application/json')) {
    return res.status(415).json({
      success: false,
      message: 'Content-Type deve essere application/json'
    });
  }
  next();
};

/**
 * Prevent parameter pollution
 */
exports.preventParameterPollution = (req, res, next) => {
  // Check for duplicate parameters
  const checkDuplicates = (obj) => {
    const keys = Object.keys(obj);
    const duplicates = keys.filter((key, index) => {
      return Array.isArray(obj[key]) && obj[key].length > 1;
    });
    return duplicates.length > 0;
  };
  
  if (checkDuplicates(req.query) || checkDuplicates(req.body)) {
    return res.status(400).json({
      success: false,
      message: 'Parametri duplicati non consentiti'
    });
  }
  
  next();
};