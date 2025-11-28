-- ============================================================================
-- TENANT SCHEMA: Tables
-- ============================================================================
-- Individual tables within rooms
-- Supports flexible seating ranges and floor plan visualization

CREATE TABLE IF NOT EXISTS tavoli (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sala_id INTEGER REFERENCES sale(id) ON DELETE CASCADE,
    
    -- Table identification
    numero VARCHAR(20) NOT NULL, -- 'T1', '12', 'Patio-A'
    
    -- Seating capacity
    posti INTEGER NOT NULL DEFAULT 2,
    
    -- Special rules (override global settings)
    solo_su_richiesta BOOLEAN DEFAULT false, -- Not bookable via widget
    prenotazione_minima_persone INTEGER, -- Minimum party size for this table
    durata_prenotazione_custom INTEGER, -- Custom booking duration (minutes)
    
    -- Floor plan visualization (for drag-and-drop UI)
    posizione_x NUMERIC(10,2),
    posizione_y NUMERIC(10,2),
    forma VARCHAR(20) DEFAULT 'rectangle' CHECK (forma IN ('rectangle', 'circle', 'square', 'oval')),
    
    -- Status
    attivo BOOLEAN DEFAULT true,
    note TEXT, -- Internal notes about this table
    
    -- Audit timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(sala_id, numero),
    CHECK (posti_max >= posti_min)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tavoli_sala ON tavoli(sala_id);
CREATE INDEX IF NOT EXISTS idx_tavoli_attivo ON tavoli(attivo);
CREATE INDEX IF NOT EXISTS idx_tavoli_posti ON tavoli(posti_min, posti_max);

-- Comments
COMMENT ON TABLE tavoli IS 'Individual tables within restaurant rooms';
COMMENT ON COLUMN tavoli.numero IS 'Table number/identifier (can be alphanumeric)';
COMMENT ON COLUMN tavoli.solo_su_richiesta IS 'If true, table only bookable by staff (not in widget)';
COMMENT ON COLUMN tavoli.posizione_x IS 'X coordinate for floor plan visualization';
COMMENT ON COLUMN tavoli.posizione_y IS 'Y coordinate for floor plan visualization';
COMMENT ON COLUMN tavoli.forma IS 'Table shape for visual representation';
