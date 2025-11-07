-- ============================================================================
-- TENANT SCHEMA: IP Rate Limiting
-- ============================================================================
-- Prevent booking abuse by tracking IP addresses
-- Limits bookings per IP address per day per restaurant

CREATE TABLE IF NOT EXISTS ip_rate_limit (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    -- IP tracking
    ip_address INET NOT NULL,
    
    -- Rate limiting counters
    prenotazioni_oggi INTEGER DEFAULT 1,
    tentativi_bloccati INTEGER DEFAULT 0, -- Track blocked attempts
    
    -- Date tracking
    data DATE DEFAULT CURRENT_DATE,
    ultima_prenotazione TIMESTAMP DEFAULT NOW(),
    
    -- Unique constraint: one record per IP per day
    UNIQUE(ip_address, data)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_ip_rate_limit_lookup ON ip_rate_limit(ip_address, data);
CREATE INDEX IF NOT EXISTS idx_ip_rate_limit_data ON ip_rate_limit(data);

-- Comments
COMMENT ON TABLE ip_rate_limit IS 'Track IP addresses to prevent booking abuse (per restaurant)';
COMMENT ON COLUMN ip_rate_limit.prenotazioni_oggi IS 'Number of successful bookings from this IP today';
COMMENT ON COLUMN ip_rate_limit.tentativi_bloccati IS 'Number of blocked booking attempts';

-- Usage:
-- On new booking from widget:
--   1. Check if IP exists for today
--   2. Get limit from impostazioni: SELECT valore FROM impostazioni WHERE chiave = 'ip_rate_limit_max_prenotazioni'
--   3. If count >= limit, block and increment tentativi_bloccati
--   4. Otherwise, increment prenotazioni_oggi
-- 
-- Cleanup old records periodically:
--   DELETE FROM ip_rate_limit WHERE data < CURRENT_DATE - INTERVAL '30 days';
