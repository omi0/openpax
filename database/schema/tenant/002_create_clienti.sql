-- ============================================================================
-- TENANT SCHEMA: Customer CRM
-- ============================================================================
-- Customer relationship management and tracking
-- Stores customer profiles, preferences, and booking history

CREATE TABLE IF NOT EXISTS clienti (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    -- Personal information
    nome VARCHAR(100) NOT NULL,
    cognome VARCHAR(100),
    email VARCHAR(255),
    telefono VARCHAR(20) NOT NULL,
    
    -- CRM features
    vip BOOLEAN DEFAULT false,
    note TEXT, -- General notes about customer
    allergie TEXT, -- Dietary restrictions/allergies
    preferenze TEXT, -- Seating preferences, special requests
    
    -- Booking statistics
    totale_prenotazioni INTEGER DEFAULT 0,
    prenotazioni_completate INTEGER DEFAULT 0,
    prenotazioni_cancellate INTEGER DEFAULT 0,
    no_show_count INTEGER DEFAULT 0,
    ultima_prenotazione TIMESTAMP,
    
    -- GDPR compliance
    consenso_privacy BOOLEAN DEFAULT false NOT NULL,
    consenso_newsletter BOOLEAN DEFAULT false,
    
    -- Customer management
    blacklisted BOOLEAN DEFAULT false, -- Block problematic customers
    
    -- Source tracking
    ip_address INET,
    fonte VARCHAR(50), -- 'website', 'phone', 'walkin', 'widget'
    
    -- Audit timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_clienti_telefono ON clienti(telefono);
CREATE INDEX IF NOT EXISTS idx_clienti_email ON clienti(email);
CREATE INDEX IF NOT EXISTS idx_clienti_vip ON clienti(vip);
CREATE INDEX IF NOT EXISTS idx_clienti_ultima_prenotazione ON clienti(ultima_prenotazione DESC);
CREATE INDEX IF NOT EXISTS idx_clienti_blacklisted ON clienti(blacklisted);

-- Comments
COMMENT ON TABLE clienti IS 'Customer profiles and CRM data';
COMMENT ON COLUMN clienti.vip IS 'VIP customers get priority treatment and notifications';
COMMENT ON COLUMN clienti.no_show_count IS 'Track customers who don''t show up for reservations';
COMMENT ON COLUMN clienti.consenso_privacy IS 'REQUIRED: GDPR consent to store personal data';
COMMENT ON COLUMN clienti.consenso_newsletter IS 'OPTIONAL: Marketing communications consent';
COMMENT ON COLUMN clienti.blacklisted IS 'Prevent future bookings from problematic customers';
