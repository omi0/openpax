const nodemailer = require('nodemailer');

// Email configuration
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@example.com';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Auth Service';

// Create transporter based on environment configuration
let transporter;

if (process.env.NODE_ENV === 'production') {
  // Production email configuration (e.g., SendGrid, AWS SES, etc.)
  if (process.env.SMTP_HOST) {
    // SMTP configuration
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false'
      }
    });
  } else if (process.env.SENDGRID_API_KEY) {
    // SendGrid configuration
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    // Create a wrapper to match nodemailer interface
    transporter = {
      sendMail: async (options) => {
        const msg = {
          to: options.to,
          from: {
            email: EMAIL_FROM,
            name: EMAIL_FROM_NAME
          },
          subject: options.subject,
          text: options.text,
          html: options.html
        };
        
        return await sgMail.send(msg);
      }
    };
  } else if (process.env.AWS_SES_REGION) {
    // AWS SES configuration
    const AWS = require('aws-sdk');
    AWS.config.update({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_SES_REGION
    });
    
    transporter = nodemailer.createTransport({
      SES: new AWS.SES({ apiVersion: '2010-12-01' })
    });
  } else {
    // Fallback to console logging in production if no email service is configured
    console.warn('No email service configured for production. Emails will be logged to console.');
    transporter = {
      sendMail: async (options) => {
        console.log('Email would be sent:', options);
        return { messageId: 'console-' + Date.now() };
      }
    };
  }
} else {
  // Development configuration
  if (process.env.MAILTRAP_HOST) {
    // Mailtrap for development
    transporter = nodemailer.createTransport({
      host: process.env.MAILTRAP_HOST,
      port: process.env.MAILTRAP_PORT || 2525,
      auth: {
        user: process.env.MAILTRAP_USER,
        pass: process.env.MAILTRAP_PASS
      }
    });
  } else {
    // Use Ethereal Email for development (free testing service)
    const createTestAccount = async () => {
      const testAccount = await nodemailer.createTestAccount();
      return nodemailer.createTransporter({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
    };
    
    // Initialize transporter asynchronously
    createTestAccount().then(t => {
      transporter = t;
      console.log('Ethereal Email test account created');
    }).catch(err => {
      console.error('Failed to create test email account:', err);
      // Fallback to console logging
      transporter = {
        sendMail: async (options) => {
          console.log('Email would be sent:', options);
          return { messageId: 'console-' + Date.now() };
        }
      };
    });
  }
}

/**
 * Send email utility
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text content
 * @param {string} options.html - HTML content
 * @param {string} options.from - From email (optional)
 * @param {string} options.fromName - From name (optional)
 */
exports.sendEmail = async (options) => {
  try {
    // Wait for transporter to be initialized if necessary
    if (!transporter) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!transporter) {
        throw new Error('Email transporter not initialized');
      }
    }
    
    // Prepare email options
    const mailOptions = {
      from: `"${options.fromName || EMAIL_FROM_NAME}" <${options.from || EMAIL_FROM}>`,
      to: options.to,
      subject: options.subject,
      text: options.text || stripHtml(options.html),
      html: options.html || options.text
    };
    
    // Add optional fields
    if (options.cc) mailOptions.cc = options.cc;
    if (options.bcc) mailOptions.bcc = options.bcc;
    if (options.replyTo) mailOptions.replyTo = options.replyTo;
    if (options.attachments) mailOptions.attachments = options.attachments;
    
    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    // Log in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('Email sent:', info.messageId);
      if (nodemailer.getTestMessageUrl(info)) {
        console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
      }
    }
    
    return {
      success: true,
      messageId: info.messageId
    };
    
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
};

/**
 * Send bulk emails (with rate limiting)
 * @param {Array} recipients - Array of email options
 * @param {Object} options - Common options for all emails
 */
exports.sendBulkEmails = async (recipients, commonOptions = {}) => {
  const results = [];
  const batchSize = parseInt(process.env.EMAIL_BATCH_SIZE) || 10;
  const delayBetweenBatches = parseInt(process.env.EMAIL_BATCH_DELAY) || 1000;
  
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    
    const batchPromises = batch.map(recipient => {
      const emailOptions = {
        ...commonOptions,
        ...recipient
      };
      
      return exports.sendEmail(emailOptions)
        .then(result => ({ success: true, email: recipient.to, ...result }))
        .catch(error => ({ success: false, email: recipient.to, error: error.message }));
    });
    
    const batchResults = await Promise.allSettled(batchPromises);
    results.push(...batchResults.map(r => r.value || r.reason));
    
    // Delay between batches to avoid rate limiting
    if (i + batchSize < recipients.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
  
  return results;
};

/**
 * Email templates
 */
exports.templates = {
  /**
   * Welcome email template
   */
  welcome: (user, verificationUrl) => ({
    subject: 'Welcome to Our Service',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #007bff; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .button { display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #777; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome ${user.nome}!</h1>
            </div>
            <div class="content">
              <p>Thank you for joining us. We're excited to have you on board!</p>
              <p>Please verify your email address to get started:</p>
              <center>
                <a href="${verificationUrl}" class="button">Verify Email Address</a>
              </center>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all;">${verificationUrl}</p>
              <p>This link will expire in 24 hours.</p>
            </div>
            <div class="footer">
              <p>If you didn't create an account with us, please ignore this email.</p>
              <p>&copy; ${new Date().getFullYear()} Your Company. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `
  }),
  
  /**
   * Password reset email template
   */
  passwordReset: (user, resetUrl) => ({
    subject: 'Password Reset Request',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .button { display: inline-block; padding: 10px 20px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #777; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hi ${user.nome},</p>
              <p>You recently requested to reset your password. Click the button below to proceed:</p>
              <center>
                <a href="${resetUrl}" class="button">Reset Password</a>
              </center>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all;">${resetUrl}</p>
              <p><strong>This link will expire in 1 hour.</strong></p>
              <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Your Company. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `
  })
};

/**
 * Strip HTML tags from text
 */
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Test email configuration
 */
exports.testEmailConfiguration = async () => {
  try {
    if (!transporter) {
      return { success: false, error: 'Email transporter not configured' };
    }
    
    // Verify transporter configuration
    if (transporter.verify) {
      await transporter.verify();
    }
    
    return { success: true, message: 'Email configuration is valid' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};