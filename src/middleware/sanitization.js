const validator = require('validator');
const xss = require('xss');

/**
 * Custom XSS filter options
 */
const xssOptions = {
  whiteList: {}, // No HTML tags allowed
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
  css: false
};

/**
 * Sanitize string input - removes dangerous characters
 */
const sanitizeString = (str, options = {}) => {
  if (typeof str !== 'string') return str;
  
  // Trim whitespace
  str = str.trim();
  
  // Apply XSS protection
  if (!options.allowHtml) {
    str = xss(str, xssOptions);
  }
  
  // Remove null bytes
  str = str.replace(/\0/g, '');
  
  // Normalize Unicode
  str = str.normalize('NFC');
  
  return str;
};

/**
 * Sanitize email with proper validation
 */
const sanitizeEmail = (email) => {
  if (typeof email !== 'string') return null;
  
  email = email.trim().toLowerCase();
  
  // Validate email format first
  if (!validator.isEmail(email)) {
    return null;
  }
  
  // Normalize email
  email = validator.normalizeEmail(email, {
    gmail_remove_dots: false,
    gmail_remove_subaddress: false,
    outlookdotcom_remove_subaddress: false,
    yahoo_remove_subaddress: false,
    icloud_remove_subaddress: false,
    all_lowercase: true
  });
  
  return email;
};

/**
 * Validate password strength
 */
const validatePassword = (password) => {
  const errors = [];
  
  if (typeof password !== 'string') {
    errors.push('Password must be a string');
    return { valid: false, errors };
  }
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  
  if (password.length > 128) {
    errors.push('Password must not exceed 128 characters');
  }
  
  // Check for complexity (optional - can be configured)
  if (process.env.ENFORCE_PASSWORD_COMPLEXITY === 'true') {
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
  }
  
  // Check for common weak passwords
  const weakPasswords = [
    'password', 'password123', '12345678', '123456789',
    'qwerty123', 'admin123', 'letmein', 'welcome123'
  ];
  
  if (weakPasswords.includes(password.toLowerCase())) {
    errors.push('Password is too common. Please choose a stronger password');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Validate phone number
 */
const validatePhone = (phone) => {
  if (!phone) return null;
  
  // Remove common formatting characters
  phone = phone.replace(/[\s\-\(\)\.]/g, '');
  
  // Basic international phone validation
  if (!validator.isMobilePhone(phone, 'any', { strictMode: false })) {
    return null;
  }
  
  return phone;
};

/**
 * Middleware: Sanitize registration input
 */
exports.sanitizeRegistration = (req, res, next) => {
  const errors = {};
  
  // Email validation
  if (!req.body.email) {
    errors.email = 'Email is required';
  } else {
    const sanitizedEmail = sanitizeEmail(req.body.email);
    if (!sanitizedEmail) {
      errors.email = 'Invalid email format';
    } else {
      req.body.email = sanitizedEmail;
    }
  }
  
  // Password validation
  if (!req.body.password) {
    errors.password = 'Password is required';
  } else {
    const passwordValidation = validatePassword(req.body.password);
    if (!passwordValidation.valid) {
      errors.password = passwordValidation.errors[0];
    }
  }
  
  // Name validation
  if (!req.body.nome) {
    errors.nome = 'First name is required';
  } else {
    req.body.nome = sanitizeString(req.body.nome);
    if (req.body.nome.length < 2 || req.body.nome.length > 100) {
      errors.nome = 'First name must be between 2 and 100 characters';
    }
    if (!/^[a-zA-ZÀ-ÿ\s\-']+$/.test(req.body.nome)) {
      errors.nome = 'First name contains invalid characters';
    }
  }
  
  // Surname validation
  if (!req.body.cognome) {
    errors.cognome = 'Last name is required';
  } else {
    req.body.cognome = sanitizeString(req.body.cognome);
    if (req.body.cognome.length < 2 || req.body.cognome.length > 100) {
      errors.cognome = 'Last name must be between 2 and 100 characters';
    }
    if (!/^[a-zA-ZÀ-ÿ\s\-']+$/.test(req.body.cognome)) {
      errors.cognome = 'Last name contains invalid characters';
    }
  }
  
  // Phone validation (optional)
  if (req.body.telefono) {
    const validPhone = validatePhone(req.body.telefono);
    if (!validPhone) {
      errors.telefono = 'Invalid phone number format';
    } else {
      req.body.telefono = validPhone;
    }
  }
  
  // Return errors if any
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }
  
  next();
};

/**
 * Middleware: Sanitize login input
 */
exports.sanitizeLogin = (req, res, next) => {
  const errors = {};
  
  // Email validation
  if (!req.body.email) {
    errors.email = 'Email is required';
  } else {
    const sanitizedEmail = sanitizeEmail(req.body.email);
    if (!sanitizedEmail) {
      errors.email = 'Invalid email format';
    } else {
      req.body.email = sanitizedEmail;
    }
  }
  
  // Password validation (basic check only)
  if (!req.body.password) {
    errors.password = 'Password is required';
  } else if (typeof req.body.password !== 'string') {
    errors.password = 'Invalid password format';
  }
  
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }
  
  next();
};

/**
 * Middleware: Sanitize password change input
 */
exports.sanitizePasswordChange = (req, res, next) => {
  const errors = {};
  
  // Current password validation
  if (!req.body.currentPassword) {
    errors.currentPassword = 'Current password is required';
  } else if (typeof req.body.currentPassword !== 'string') {
    errors.currentPassword = 'Invalid password format';
  }
  
  // New password validation
  if (!req.body.newPassword) {
    errors.newPassword = 'New password is required';
  } else {
    const passwordValidation = validatePassword(req.body.newPassword);
    if (!passwordValidation.valid) {
      errors.newPassword = passwordValidation.errors[0];
    }
    
    // Check if new password is same as current
    if (req.body.currentPassword === req.body.newPassword) {
      errors.newPassword = 'New password must be different from current password';
    }
  }
  
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }
  
  next();
};

/**
 * Middleware: Sanitize password reset request
 */
exports.sanitizePasswordReset = (req, res, next) => {
  const errors = {};
  
  if (!req.body.email) {
    errors.email = 'Email is required';
  } else {
    const sanitizedEmail = sanitizeEmail(req.body.email);
    if (!sanitizedEmail) {
      errors.email = 'Invalid email format';
    } else {
      req.body.email = sanitizedEmail;
    }
  }
  
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }
  
  next();
};

/**
 * Middleware: Sanitize token input
 */
exports.sanitizeToken = (req, res, next) => {
  const token = req.body.token || req.query.token || req.params.token;
  
  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'Token is required'
    });
  }
  
  // Validate token format (hexadecimal string)
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid token format'
    });
  }
  
  // Normalize token placement
  req.body.token = token;
  
  next();
};

/**
 * General XSS protection middleware
 */
exports.xssProtection = (req, res, next) => {
  // Deep sanitize all string values in req.body
  const sanitizeObject = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Skip password fields from sanitization
        if (!key.toLowerCase().includes('password')) {
          obj[key] = sanitizeString(obj[key]);
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  };
  
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  
  next();
};

/**
 * SQL Injection prevention middleware
 */
exports.sqlInjectionProtection = (req, res, next) => {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /(--|\||;|\/\*|\*\/)/g,
    /(\bOR\b\s*\d+\s*=\s*\d+)/gi,
    /(\bAND\b\s*\d+\s*=\s*\d+)/gi
  ];
  
  const checkForSQLInjection = (value) => {
    if (typeof value !== 'string') return false;
    
    for (const pattern of sqlPatterns) {
      if (pattern.test(value)) {
        return true;
      }
    }
    return false;
  };
  
  const checkObject = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        if (checkForSQLInjection(obj[key])) {
          return true;
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (checkObject(obj[key])) {
          return true;
        }
      }
    }
    return false;
  };
  
  // Check query parameters
  if (req.query && checkObject(req.query)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid input detected'
    });
  }
  
  // Check body (except passwords)
  if (req.body) {
    const bodyToCheck = { ...req.body };
    delete bodyToCheck.password;
    delete bodyToCheck.currentPassword;
    delete bodyToCheck.newPassword;
    
    if (checkObject(bodyToCheck)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input detected'
      });
    }
  }
  
  next();
};

/**
 * Content-Type validation
 */
exports.requireJSON = (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({
      success: false,
      message: 'Content-Type must be application/json'
    });
  }
  next();
};

/**
 * Prevent parameter pollution
 */
exports.preventParameterPollution = (req, res, next) => {
  // Check for arrays in parameters (indicates pollution)
  const checkForArrays = (obj) => {
    for (const key in obj) {
      if (Array.isArray(obj[key]) && obj[key].length > 1) {
        return true;
      }
    }
    return false;
  };
  
  if ((req.query && checkForArrays(req.query)) || 
      (req.body && checkForArrays(req.body))) {
    return res.status(400).json({
      success: false,
      message: 'Duplicate parameters not allowed'
    });
  }
  
  next();
};

/**
 * File upload validation middleware
 */
exports.validateFileUpload = (options = {}) => {
  const {
    maxSize = 5 * 1024 * 1024, // 5MB default
    allowedTypes = ['image/jpeg', 'image/png', 'image/gif'],
    allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif']
  } = options;
  
  return (req, res, next) => {
    if (!req.files || Object.keys(req.files).length === 0) {
      return next();
    }
    
    for (const file of Object.values(req.files)) {
      // Check file size
      if (file.size > maxSize) {
        return res.status(400).json({
          success: false,
          message: `File size exceeds maximum allowed size of ${maxSize / 1024 / 1024}MB`
        });
      }
      
      // Check MIME type
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: 'File type not allowed'
        });
      }
      
      // Check file extension
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!allowedExtensions.includes(ext)) {
        return res.status(400).json({
          success: false,
          message: 'File extension not allowed'
        });
      }
    }
    
    next();
  };
};

/**
 * Middleware: Sanitize restaurant creation input
 */
exports.sanitizeRestaurantCreation = (req, res, next) => {
  const errors = {};
  
  // Restaurant name validation
  if (!req.body.nome_ristorante) {
    errors.nome_ristorante = 'Restaurant name is required';
  } else {
    req.body.nome_ristorante = sanitizeString(req.body.nome_ristorante);
    if (req.body.nome_ristorante.length < 2 || req.body.nome_ristorante.length > 255) {
      errors.nome_ristorante = 'Restaurant name must be between 2 and 255 characters';
    }
  }
  
  // Email validation
  if (!req.body.email) {
    errors.email = 'Email is required';
  } else {
    const sanitizedEmail = sanitizeEmail(req.body.email);
    if (!sanitizedEmail) {
      errors.email = 'Invalid email format';
    } else {
      req.body.email = sanitizedEmail;
    }
  }
  
  // Phone validation (optional)
  if (req.body.telefono) {
    const validPhone = validatePhone(req.body.telefono);
    if (!validPhone) {
      errors.telefono = 'Invalid phone number format';
    } else {
      req.body.telefono = validPhone;
    }
  }
  
  // Address validation (optional)
  if (req.body.indirizzo) {
    req.body.indirizzo = sanitizeString(req.body.indirizzo);
    if (req.body.indirizzo.length > 500) {
      errors.indirizzo = 'Address must not exceed 500 characters';
    }
  }
  
  // City validation (optional)
  if (req.body.citta) {
    req.body.citta = sanitizeString(req.body.citta);
    if (req.body.citta.length > 100) {
      errors.citta = 'City must not exceed 100 characters';
    }
    if (!/^[a-zA-ZÀ-ÿ\s\-']+$/.test(req.body.citta)) {
      errors.citta = 'City contains invalid characters';
    }
  }
  
  // Postal code validation (optional)
  if (req.body.cap) {
    req.body.cap = sanitizeString(req.body.cap);
    if (req.body.cap.length > 10) {
      errors.cap = 'Postal code must not exceed 10 characters';
    }
    // Italian postal code format (5 digits) or generic alphanumeric
    if (!/^[0-9A-Z\s\-]{3,10}$/.test(req.body.cap)) {
      errors.cap = 'Invalid postal code format';
    }
  }
  
  // Country validation (optional, defaults to IT)
  if (req.body.paese) {
    req.body.paese = sanitizeString(req.body.paese).toUpperCase();
    // ISO 3166-1 alpha-2 country code
    if (!/^[A-Z]{2}$/.test(req.body.paese)) {
      errors.paese = 'Country must be a valid 2-letter ISO code';
    }
  }
  
  // Return errors if any
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }
  
  next();
};

/**
 * Middleware: Sanitize restaurant update input
 */
exports.sanitizeRestaurantUpdate = (req, res, next) => {
  const errors = {};
  const allowedFields = ['nome_ristorante', 'email', 'telefono', 'indirizzo', 'citta', 'cap', 'paese'];
  
  // Remove any fields not in allowedFields
  const bodyKeys = Object.keys(req.body);
  for (const key of bodyKeys) {
    if (!allowedFields.includes(key)) {
      delete req.body[key];
    }
  }
  
  // Restaurant name validation (optional for update)
  if (req.body.nome_ristorante !== undefined) {
    if (!req.body.nome_ristorante) {
      errors.nome_ristorante = 'Restaurant name cannot be empty';
    } else {
      req.body.nome_ristorante = sanitizeString(req.body.nome_ristorante);
      if (req.body.nome_ristorante.length < 2 || req.body.nome_ristorante.length > 255) {
        errors.nome_ristorante = 'Restaurant name must be between 2 and 255 characters';
      }
    }
  }
  
  // Email validation (optional for update)
  if (req.body.email !== undefined) {
    if (!req.body.email) {
      errors.email = 'Email cannot be empty';
    } else {
      const sanitizedEmail = sanitizeEmail(req.body.email);
      if (!sanitizedEmail) {
        errors.email = 'Invalid email format';
      } else {
        req.body.email = sanitizedEmail;
      }
    }
  }
  
  // Phone validation (optional)
  if (req.body.telefono !== undefined) {
    if (req.body.telefono) {
      const validPhone = validatePhone(req.body.telefono);
      if (!validPhone) {
        errors.telefono = 'Invalid phone number format';
      } else {
        req.body.telefono = validPhone;
      }
    } else {
      req.body.telefono = null; // Allow clearing phone
    }
  }
  
  // Address validation (optional)
  if (req.body.indirizzo !== undefined) {
    if (req.body.indirizzo) {
      req.body.indirizzo = sanitizeString(req.body.indirizzo);
      if (req.body.indirizzo.length > 500) {
        errors.indirizzo = 'Address must not exceed 500 characters';
      }
    } else {
      req.body.indirizzo = null; // Allow clearing address
    }
  }
  
  // City validation (optional)
  if (req.body.citta !== undefined) {
    if (req.body.citta) {
      req.body.citta = sanitizeString(req.body.citta);
      if (req.body.citta.length > 100) {
        errors.citta = 'City must not exceed 100 characters';
      }
      if (!/^[a-zA-ZÀ-ÿ\s\-']+$/.test(req.body.citta)) {
        errors.citta = 'City contains invalid characters';
      }
    } else {
      req.body.citta = null; // Allow clearing city
    }
  }
  
  // Postal code validation (optional)
  if (req.body.cap !== undefined) {
    if (req.body.cap) {
      req.body.cap = sanitizeString(req.body.cap);
      if (req.body.cap.length > 10) {
        errors.cap = 'Postal code must not exceed 10 characters';
      }
      if (!/^[0-9A-Z\s\-]{3,10}$/.test(req.body.cap)) {
        errors.cap = 'Invalid postal code format';
      }
    } else {
      req.body.cap = null; // Allow clearing postal code
    }
  }
  
  // Country validation (optional)
  if (req.body.paese !== undefined) {
    if (req.body.paese) {
      req.body.paese = sanitizeString(req.body.paese).toUpperCase();
      if (!/^[A-Z]{2}$/.test(req.body.paese)) {
        errors.paese = 'Country must be a valid 2-letter ISO code';
      }
    } else {
      req.body.paese = null; // Allow clearing country
    }
  }
  
  // Return errors if any
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }
  
  // Check if there are any fields to update
  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No valid fields provided for update'
    });
  }
  
  next();
};

/**
 * Settings Sanitization
 * specific logic to ensure 'integers' are numbers and 'booleans' are true/false strings
 * even though the DB stores them as text.
 */
exports.sanitizeSettingsUpdate = (req, res, next) => {
  if (!req.body || typeof req.body !== 'object') {
    return next();
  }

  const settings = req.body;
  const sanitizedSettings = {};
  const errors = [];

  Object.keys(settings).forEach(key => {
    let value = settings[key];

    // INTEGER CHECKS
    if (/^(max_|min_|deposito_da_|ip_rate_limit_max)/.test(key) || /(_ore|_giorni|_persone)$/.test(key)) {
      const intVal = parseInt(value, 10);
      if (isNaN(intVal) || intVal < 0) {
        errors.push(`Setting '${key}' must be a positive integer`);
      } else {
        sanitizedSettings[key] = intVal.toString();
      }
    }

    // Already passed in the correct format from frontend ?
    
    // // BOOLEAN CHECKS
    // else if (/(_attivo|consenti_|richiedi_|notifica_|mostra_|blocco_)/.test(key)) {
    //   if (value === 'true' || value === true || value === '1') {
    //     sanitizedSettings[key] = 'true';
    //   } else if (value === 'false' || value === false || value === '0') {
    //     sanitizedSettings[key] = 'false';
    //   } else {
    //     errors.push(`Setting '${key}' must be a boolean (true/false)`);
    //   }
    // }

    // // HEX COLOR CHECKS
    // else if (key.includes('colore')) {
    //   if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value)) {
    //     errors.push(`Setting '${key}' must be a valid Hex color code`);
    //   } else {
    //     sanitizedSettings[key] = value;
    //   }
    // }

    // CURRENCY/FLOAT CHECKS
    else if (key === 'importo_deposito_per_persona') {
      const floatVal = parseFloat(value);
      if (isNaN(floatVal) || floatVal < 0) {
        errors.push(`Setting '${key}' must be a valid amount`);
      } else {
        sanitizedSettings[key] = floatVal.toFixed(2); // "10.00"
      }
    }

    // 5. ENUM CHECK 
    else if (key === 'lingua_default') {
      const allowed = ['it', 'en', 'es', 'fr', 'de'];
      if (!allowed.includes(value)) errors.push(`Invalid language code`);
      else sanitizedSettings[key] = value;
    }
    
    // 6. BASIC STRING TRIM
    else {
      if (typeof value === 'string') {
        sanitizedSettings[key] = value.trim();
      } else {
        sanitizedSettings[key] = value;
      }
    }
  });

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors,
    });
  }

  req.body = sanitizedSettings;
  next();
};