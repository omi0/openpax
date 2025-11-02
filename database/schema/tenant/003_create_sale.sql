-- ============================================================================
-- TENANT SCHEMA: Rooms/Dining Areas
-- ============================================================================
-- Different rooms or areas within the restaurant
-- Examples: Main Dining Room, Patio, Private Room, Bar Area

CREATE TABLE IF NOT EXISTS sale (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    -- Room identification
    nome VARCHAR(100) NOT NULL,
    descrizione TEXT,
    
    -- Capacity
    capacita_massima INTEGER, -- Maximum people in this room
    
    -- Status
    attivo BOOLEAN DEFAULT true,
    ordine INTEGER DEFAULT 0, -- Display order in UI
    
    -- Audit timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_sale_attivo ON sale(attivo);

-- Comments
COMMENT ON TABLE sale IS 'Restaurant rooms or dining areas';
COMMENT ON COLUMN sale.ordine IS 'Display order in UI (lower numbers appear first)';
COMMENT ON COLUMN sale.capacita_massima IS 'Total seating capacity for this room';
