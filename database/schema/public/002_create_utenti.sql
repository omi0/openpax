-- ============================================================================
-- PUBLIC SCHEMA: Platform Users (ALL USERS)
-- ============================================================================
-- Staff users are stored at the PLATFORM level, not per-tenant
-- This allows:
--   - Simple login (email + password, no tenant lookup needed)
--   - Global email uniqueness
--   - One user can access multiple restaurants
--   - Better security and UX

CREATE TABLE IF NOT EXISTS public.utenti (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    -- Authentication
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Profile (global)
    nome VARCHAR(100) NOT NULL,
    cognome VARCHAR(100) NOT NULL,
    telefono VARCHAR(20),
    
    -- Account status
    attivo BOOLEAN DEFAULT true,
    email_verificato BOOLEAN DEFAULT false,

    -- Verification Tokens
    verification_token VARCHAR(255),
    verification_expires TIMESTAMP,
    
    -- Security - Account lockout
    tentativi_falliti INTEGER DEFAULT 0,
    bloccato_fino TIMESTAMP,
    ultimo_tentativo_fallito TIMESTAMP,
    ultimo_accesso TIMESTAMP,
    
    -- Password reset mechanism
    reset_token VARCHAR(255),
    reset_scadenza TIMESTAMP,
    
    -- Multi-factor authentication (future)
    mfa_abilitato BOOLEAN DEFAULT false,
    mfa_secret VARCHAR(255),
    
    -- Audit timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_utenti_email ON public.utenti(email);
CREATE INDEX IF NOT EXISTS idx_utenti_attivo ON public.utenti(attivo);
CREATE INDEX IF NOT EXISTS idx_utenti_reset_token ON public.utenti(reset_token) WHERE reset_token IS NOT NULL;

-- Comments
COMMENT ON TABLE public.utenti IS 'Platform-level user accounts (staff for all restaurants)';
COMMENT ON COLUMN public.utenti.email IS 'Globally unique email address for login';
COMMENT ON COLUMN public.utenti.password_hash IS 'Bcrypt hashed password (12 rounds)';
COMMENT ON COLUMN public.utenti.tentativi_falliti IS 'Failed login attempts (resets on success)';
COMMENT ON COLUMN public.utenti.bloccato_fino IS 'Account locked until this timestamp (null = not locked)';
COMMENT ON COLUMN public.utenti.reset_token IS 'SHA-256 hashed password reset token (single-use, expires in 1 hour)';
COMMENT ON COLUMN public.utenti.mfa_abilitato IS 'Two-factor authentication enabled (TOTP)';
