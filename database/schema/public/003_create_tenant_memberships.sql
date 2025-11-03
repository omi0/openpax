-- ============================================================================
-- PUBLIC SCHEMA: User-Tenant Relationships
-- ============================================================================
-- Links users to restaurants with role-based access
-- A user can have access to multiple restaurants with different roles

CREATE TABLE IF NOT EXISTS public.tenant_memberships (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    -- Relationships
    utente_id INTEGER NOT NULL REFERENCES public.utenti(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL REFERENCES public.ristoranti(id) ON DELETE CASCADE,
    
    -- Role per tenant (user can be owner in one restaurant, staff in another)
    ruolo VARCHAR(20) NOT NULL CHECK (ruolo IN ('owner', 'manager', 'staff', 'viewer')),
    
    -- Granular permissions (JSON for custom permissions per tenant)
    permessi JSONB DEFAULT '{}',
    
    -- Status
    attivo BOOLEAN DEFAULT true,
    
    -- Invitation tracking
    invitato_da INTEGER REFERENCES public.utenti(id) ON DELETE SET NULL,
    invitato_at TIMESTAMP,
    accettato_at TIMESTAMP,
    
    -- Audit timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(utente_id, tenant_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_memberships_user ON public.tenant_memberships(utente_id);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON public.tenant_memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user_tenant ON public.tenant_memberships(utente_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_memberships_active ON public.tenant_memberships(attivo);

-- Comments
COMMENT ON TABLE public.tenant_memberships IS 'User access to tenants with role-based permissions';
COMMENT ON COLUMN public.tenant_memberships.ruolo IS 'User role in this restaurant: owner (full access), manager (most features), staff (basic operations), viewer (read-only)';
COMMENT ON COLUMN public.tenant_memberships.permessi IS 'JSON object for granular permission overrides (e.g., {"can_delete_bookings": false})';
COMMENT ON COLUMN public.tenant_memberships.invitato_da IS 'Which user invited this person to the restaurant';

-- Example queries:
-- Get all restaurants a user can access:
--   SELECT r.* FROM public.ristoranti r 
--   JOIN public.tenant_memberships tm ON r.id = tm.tenant_id 
--   WHERE tm.utente_id = ? AND tm.attivo = true;
--
-- Get all staff for a restaurant:
--   SELECT u.* FROM public.utenti u
--   JOIN public.tenant_memberships tm ON u.id = tm.utente_id
--   WHERE tm.tenant_id = ? AND tm.attivo = true;
