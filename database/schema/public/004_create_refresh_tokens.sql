-- ============================================================================
-- REFRESH TOKENS TABLE
-- ============================================================================
-- Manages refresh tokens for user authentication sessions
-- Supports multiple concurrent sessions per user with full audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.refresh_tokens (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    -- User relationship
    user_id INTEGER NOT NULL REFERENCES public.utenti(id) ON DELETE CASCADE,
    
    -- Token data
    token VARCHAR(512) NOT NULL UNIQUE,
    
    -- Session identification & security
    fingerprint VARCHAR(64), -- Browser/device fingerprint for additional security
    user_agent TEXT, -- Browser/device information
    ip_address VARCHAR(45), -- IPv4 or IPv6 address
    
    -- Token lifecycle
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN DEFAULT false,
    
    -- Usage tracking
    last_used_at TIMESTAMP DEFAULT NOW(),
    
    -- Audit timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Primary lookup: Find token (most common query)
CREATE INDEX idx_refresh_tokens_token 
ON refresh_tokens(token) 
WHERE revoked = false;

-- Find active tokens for a user (session management)
CREATE INDEX idx_refresh_tokens_user_active 
ON refresh_tokens(user_id, expires_at) 
WHERE revoked = false;

-- Cleanup expired tokens (maintenance job)
CREATE INDEX idx_refresh_tokens_cleanup 
ON refresh_tokens(expires_at, revoked);

-- Find by user and fingerprint (security validation)
CREATE INDEX idx_refresh_tokens_fingerprint 
ON refresh_tokens(user_id, fingerprint) 
WHERE revoked = false;

-- Track last usage for session monitoring
CREATE INDEX idx_refresh_tokens_last_used 
ON refresh_tokens(user_id, last_used_at DESC) 
WHERE revoked = false;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_refresh_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_refresh_tokens_updated_at
    BEFORE UPDATE ON refresh_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_refresh_tokens_updated_at();

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE refresh_tokens IS 'Stores refresh tokens for user authentication sessions with full audit trail';
COMMENT ON COLUMN refresh_tokens.token IS 'Hashed refresh token (should be stored hashed in production)';
COMMENT ON COLUMN refresh_tokens.fingerprint IS 'Browser fingerprint for additional security validation';
COMMENT ON COLUMN refresh_tokens.user_agent IS 'Browser/device user agent string for session identification';
COMMENT ON COLUMN refresh_tokens.ip_address IS 'IP address from which token was created';
COMMENT ON COLUMN refresh_tokens.last_used_at IS 'Last time this token was used to refresh access token';
COMMENT ON COLUMN refresh_tokens.revoked IS 'Whether this token has been manually revoked';

-- ============================================================================
-- NOTES
-- ============================================================================
-- 1. Token should be hashed before storage (use crypto.createHash('sha256'))
-- 2. Run cleanup job daily to remove expired tokens
-- 3. Consider implementing rate limiting on token creation per user
-- 4. Monitor last_used_at to detect suspicious activity
-- 5. Limit number of active sessions per user (recommended: 5-10)
