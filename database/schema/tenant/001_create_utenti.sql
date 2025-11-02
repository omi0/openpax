-- ============================================================================
-- TENANT SCHEMA: Staff Users
-- ============================================================================
-- Stores staff accounts with role-based access
-- Each restaurant has independent user accounts in their own schema

CREATE TABLE IF NOT EXISTS utenti (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    -- Authentication
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Profile information
    nome VARCHAR(100) NOT NULL,
    cognome VARCHAR(100) NOT NULL,
    telefono VARCHAR(20),
    
    -- Authorization
    ruolo VARCHAR(20) DEFAULT 'staff' CHECK (ruolo IN ('owner', 'manager', 'staff', 'viewer')),
    permessi JSONB DEFAULT '{}', -- Granular permissions override
    
    -- Account status
    attivo BOOLEAN DEFAULT true,
    ultimo_accesso TIMESTAMP,
    
    -- Password reset mechanism
    reset_token VARCHAR(255),
    reset_scadenza TIMESTAMP,
    
    -- Audit timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_utenti_email ON utenti(email);
CREATE INDEX IF NOT EXISTS idx_utenti_ruolo ON utenti(ruolo);
CREATE INDEX IF NOT EXISTS idx_utenti_attivo ON utenti(attivo);

-- Comments
COMMENT ON TABLE utenti IS 'Staff user accounts for this restaurant';
COMMENT ON COLUMN utenti.ruolo IS 'User role: owner (full access), manager (most features), staff (basic), viewer (read-only)';
COMMENT ON COLUMN utenti.permessi IS 'JSON object for granular permission overrides';
COMMENT ON COLUMN utenti.reset_token IS 'One-time token for password reset (expires after use or timeout)';
