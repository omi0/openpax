-- ============================================================================
-- TENANT SCHEMA: Date-Specific Rules & Closures
-- ============================================================================
-- Override base schedule for specific dates or recurring events
-- Supports: holidays, special events, Saturday overrides, closures

CREATE TABLE IF NOT EXISTS orario_eccezioni (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    -- Date range
    data_inizio DATE NOT NULL,
    data_fine DATE NOT NULL,
    
    -- Exception type
    tipo_eccezione VARCHAR(20) NOT NULL CHECK (tipo_eccezione IN ('chiusura', 'override', 'evento_speciale')),
    
    -- Service details (NULL if tipo = 'chiusura')
    nome_servizio VARCHAR(50),
    descrizione TEXT,
    
    -- Operating hours (NULL for closures)
    ora_apertura TIME,
    ora_chiusura TIME,
    
    -- Booking strategy override
    modalita_prenotazione VARCHAR(20) CHECK (modalita_prenotazione IN ('slot', 'continuous')),
    durata_slot INTEGER,
    max_prenotazioni_per_slot INTEGER,
    
    -- Booking duration overrides
    durata_prenotazione_default INTEGER,
    durata_prenotazione_min INTEGER,
    durata_prenotazione_max INTEGER,
    
    -- Capacity overrides
    capacita_max_persone INTEGER,
    capacita_max_tavoli INTEGER,
    
    -- Table management overrides
    consenti_sovrapposizione BOOLEAN,
    buffer_tempo INTEGER,
    
    -- Partial closure scope (NULL = affects everything)
    servizi_interessati VARCHAR(100)[], -- e.g., ['lunch'] to close only lunch
    tavoli_interessati INTEGER[], -- specific table IDs
    sale_interessate INTEGER[], -- specific room IDs
    
    -- Recurring exceptions (e.g., every Saturday)
    ricorrente BOOLEAN DEFAULT false,
    ricorrenza_tipo VARCHAR(20) CHECK (ricorrenza_tipo IN ('weekly', 'monthly', 'yearly')),
    ricorrenza_giorni INTEGER[], -- [6] for every Saturday
    
    -- Details
    motivo TEXT, -- 'Christmas Holiday', 'Private Event', 'Weekend Override'
    
    -- Status
    attivo BOOLEAN DEFAULT true,
    
    -- Audit timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CHECK (data_fine >= data_inizio),
    CHECK (
        (tipo_eccezione = 'chiusura' AND ora_apertura IS NULL) OR
        (tipo_eccezione IN ('override', 'evento_speciale') AND ora_apertura IS NOT NULL)
    ),
    CHECK (
        (ricorrente = false) OR
        (ricorrente = true AND ricorrenza_tipo IS NOT NULL)
    )
);

-- Indexes for date range queries
CREATE INDEX IF NOT EXISTS idx_orario_eccezioni_date ON orario_eccezioni(data_inizio, data_fine);
CREATE INDEX IF NOT EXISTS idx_orario_eccezioni_tipo ON orario_eccezioni(tipo_eccezione, attivo);
CREATE INDEX IF NOT EXISTS idx_orario_eccezioni_ricorrente ON orario_eccezioni(ricorrente, attivo);

-- Comments
COMMENT ON TABLE orario_eccezioni IS 'Date-specific schedule overrides and closures';
COMMENT ON COLUMN orario_eccezioni.tipo_eccezione IS 'chiusura: closed | override: different hours/rules | evento_speciale: special event';
COMMENT ON COLUMN orario_eccezioni.servizi_interessati IS 'NULL = all services | array of service names for partial closure';
COMMENT ON COLUMN orario_eccezioni.tavoli_interessati IS 'NULL = all tables | array of table IDs for partial closure';
COMMENT ON COLUMN orario_eccezioni.ricorrente IS 'true for recurring events (every Saturday, annual holidays)';
COMMENT ON COLUMN orario_eccezioni.ricorrenza_giorni IS 'Day of week array: [0]=Sunday, [6]=Saturday';

-- Examples:
-- Complete closure: INSERT INTO orario_eccezioni (data_inizio, data_fine, tipo_eccezione, motivo) 
--   VALUES ('2025-12-25', '2025-12-25', 'chiusura', 'Christmas');
-- 
-- Saturday override: INSERT INTO orario_eccezioni (data_inizio, data_fine, tipo_eccezione, nome_servizio, 
--   ora_apertura, ora_chiusura, modalita_prenotazione, durata_slot, ricorrente, ricorrenza_tipo, ricorrenza_giorni)
--   VALUES ('2025-01-01', '2025-12-31', 'override', 'dinner', '19:00', '23:30', 'slot', 90, true, 'weekly', ARRAY[6]);
