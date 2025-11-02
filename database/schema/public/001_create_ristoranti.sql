-- ============================================================================
-- PUBLIC SCHEMA: Tenant Registry
-- ============================================================================
-- This table manages all restaurant tenants in the system
-- Each restaurant gets its own schema (e.g., restaurant_001, restaurant_002)

CREATE TABLE IF NOT EXISTS public.ristoranti (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    -- Schema identifier (must match PostgreSQL schema name)
    schema_name VARCHAR(63) UNIQUE NOT NULL,
    
    -- Restaurant identity
    nome_ristorante VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL, -- URL-friendly identifier
    
    -- Contact information
    email VARCHAR(255) UNIQUE NOT NULL,
    telefono VARCHAR(20),
    
    -- Location
    indirizzo TEXT,
    citta VARCHAR(100),
    cap VARCHAR(10),
    paese VARCHAR(2) DEFAULT 'IT',
    
    -- Technical metadata
    versione_schema VARCHAR(10) DEFAULT '1.0.0',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_ristoranti_schema ON public.ristoranti(schema_name);
CREATE INDEX IF NOT EXISTS idx_ristoranti_slug ON public.ristoranti(slug);

-- Comments for documentation
COMMENT ON TABLE public.ristoranti IS 'Master registry of all restaurant tenants';
COMMENT ON COLUMN public.ristoranti.schema_name IS 'PostgreSQL schema name for this tenant (e.g., restaurant_001)';
COMMENT ON COLUMN public.ristoranti.slug IS 'URL-friendly identifier for public-facing URLs';
COMMENT ON COLUMN public.ristoranti.versione_schema IS 'Schema version for migration tracking';
