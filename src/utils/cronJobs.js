const cron = require('node-cron');
const RefreshToken = require('../models/refreshToken');

/**
 * Cron Jobs for Refresh Token Maintenance
 * 
 * Setup:
 * 1. npm install node-cron
 * 2. Import this file in your server.js/app.js
 * 3. Call initializeCronJobs()
 */

/**
 * Initialize all cron jobs
 */
function initializeCronJobs() {
  console.log('Initializing cron jobs...');

  // Daily cleanup of expired tokens
  setupTokenCleanup();

  // Hourly security monitoring (optional)
  setupSecurityMonitoring();

  console.log('Cron jobs initialized');
}

/**
 * Daily cleanup of expired and old revoked tokens
 * Runs at 3:00 AM every day
 */
function setupTokenCleanup() {
  cron.schedule('0 3 * * *', async () => {
    try {
      console.log('Starting refresh token cleanup...');
      
      const deletedCount = await RefreshToken.cleanupExpired();
      
      console.log(`Cleaned up ${deletedCount} expired/revoked refresh tokens`);
      
      // Optional: Log to monitoring service
      if (process.env.LOG_TO_MONITORING) {
        logToMonitoring('token_cleanup', { deletedCount });
      }
    } catch (error) {
      console.error('Token cleanup failed:', error);
      
      // Optional: Alert administrators
      if (process.env.ALERT_ON_CRON_FAILURE) {
        alertAdministrators('token_cleanup_failed', error);
      }
    }
  });

  console.log('Token cleanup job scheduled (daily at 3:00 AM)');
}

/**
 * Hourly security monitoring
 * Checks for suspicious activity patterns
 * Runs every hour at :15 minutes past the hour
 */
function setupSecurityMonitoring() {
  cron.schedule('15 * * * *', async () => {
    try {
      console.log('Running security monitoring...');
      
      // Get statistics about active tokens
      const stats = await getTokenStatistics();
      
      console.log('Token statistics:', stats);
      
      // Check for anomalies
      if (stats.totalActiveSessions > 10000) {
        console.warn('High number of active sessions detected');
        // Optional: Send alert
      }
      
      if (stats.tokensCreatedLastHour > 1000) {
        console.warn('High token creation rate detected');
        // Optional: Check for potential attack
      }
      
    } catch (error) {
      console.error('Security monitoring failed:', error);
    }
  });

  console.log('Security monitoring job scheduled (hourly)');
}

/**
 * Get token statistics for monitoring
 */
async function getTokenStatistics() {
  const { query } = require('../config/database');
  
  const sql = `
    SELECT 
      COUNT(*) as total_active_sessions,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as tokens_created_last_hour,
      COUNT(*) FILTER (WHERE last_used_at > NOW() - INTERVAL '1 hour') as active_last_hour,
      COUNT(*) FILTER (WHERE revoked = true) as total_revoked,
      COUNT(DISTINCT user_id) as unique_users
    FROM refresh_tokens
    WHERE expires_at > NOW() AND revoked = false
  `;
  
  const result = await query(sql);
  return result.rows[0];
}

/**
 * Optional: Log to external monitoring service
 */
function logToMonitoring(event, data) {
  // Implement your monitoring service integration here
  // Examples: Datadog, New Relic, CloudWatch, etc.
  console.log('Monitoring event:', event, data);
}

/**
 * Optional: Alert administrators
 */
function alertAdministrators(event, error) {
  // Implement your alerting system here
  // Examples: Email, Slack, PagerDuty, etc.
  console.error('Alert:', event, error);
}

/**
 * Manual cleanup endpoint (for admin use)
 */
async function manualCleanup() {
  console.log('Manual cleanup initiated...');
  
  try {
    const deletedCount = await RefreshToken.cleanupExpired();
    console.log(`Manually cleaned up ${deletedCount} tokens`);
    return { success: true, deletedCount };
  } catch (error) {
    console.error('Manual cleanup failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Graceful shutdown - stop all cron jobs
 */
function stopCronJobs() {
  console.log('Stopping cron jobs...');
  cron.getTasks().forEach(task => task.stop());
  console.log('All cron jobs stopped');
}

module.exports = {
  initializeCronJobs,
  stopCronJobs,
  manualCleanup,
  getTokenStatistics
};

/**
 * Example usage in server.js:
 * 
 * const { initializeCronJobs, stopCronJobs } = require('./utils/cronJobs');
 * 
 * // Start cron jobs
 * initializeCronJobs();
 * 
 * // Graceful shutdown
 * process.on('SIGTERM', () => {
 *   stopCronJobs();
 *   // ... other cleanup
 * });
 */