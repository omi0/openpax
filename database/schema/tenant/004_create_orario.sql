-- ============================================================================
-- TENANT SCHEMA: Operating Schedule (Base Rules)
-- ============================================================================
-- Recurring weekly schedule for restaurant services
-- Each service (lunch, dinner, brunch) can have different booking rules

CREATE TABLE IF NOT EXISTS orario (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    -- Service definition (fully customizable)
    nome_servizio VARCHAR(50) NOT NULL, -- 'lunch', 'dinner', 'brunch', 'aperitivo', etc.
    descrizione TEXT,
    giorno_settimana INTEGER NOT NULL CHECK (giorno_settimana BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
    
    -- Operating hours
    ora_apertura TIME NOT NULL,
    ora_chiusura TIME NOT NULL,
    
    -- Booking strategy
    modalita_prenotazione VARCHAR(20) DEFAULT 'continuous' CHECK (modalita_prenotazione IN ('slot', 'continuous')),
    
    -- Slot-based booking configuration
    durata_slot INTEGER, -- Minutes per time slot (30, 60, 90)
    max_prenotazioni_per_slot INTEGER, -- How many bookings can share the same slot
    
    -- Booking duration rules
    durata_prenotazione_default INTEGER DEFAULT 90, -- Default table occupancy time
    durata_prenotazione_min INTEGER DEFAULT 60,
    durata_prenotazione_max INTEGER DEFAULT 180,
    
    -- Capacity management (for continuous mode)
    capacita_max_persone INTEGER, -- Maximum total people at once
    capacita_max_tavoli INTEGER, -- Maximum tables in use at once
    
    -- Table turnover management
    consenti_sovrapposizione BOOLEAN DEFAULT false, -- Allow overlapping bookings
    buffer_tempo INTEGER DEFAULT 0, -- Minutes between bookings (cleaning/setup time)
    
    -- Display preferences
    ordine INTEGER DEFAULT 0, -- Display order in UI
    colore VARCHAR(7), -- Hex color for calendar visualization
    
    -- Status
    attivo BOOLEAN DEFAULT true,
    
    -- Audit timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(giorno_settimana, nome_servizio),
    CHECK (ora_chiusura > ora_apertura),
    CHECK (durata_prenotazione_max >= durata_prenotazione_min),
    CHECK (
        (modalita_prenotazione = 'slot' AND durata_slot IS NOT NULL) OR
        (modalita_prenotazione = 'continuous')
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orario_giorno_attivo ON orario(giorno_settimana, attivo);
CREATE INDEX IF NOT EXISTS idx_orario_servizio ON orario(nome_servizio);

-- Comments
COMMENT ON TABLE orario IS 'Base recurring weekly schedule for restaurant services';
COMMENT ON COLUMN orario.giorno_settimana IS '0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday';
COMMENT ON COLUMN orario.modalita_prenotazione IS 'slot: fixed time slots | continuous: book any time within hours';
COMMENT ON COLUMN orario.durata_slot IS 'REQUIRED for slot mode: minutes per time slot (e.g., 30, 60, 90)';
COMMENT ON COLUMN orario.max_prenotazioni_per_slot IS 'For slot mode: how many bookings can share the same time slot';
COMMENT ON COLUMN orario.capacita_max_persone IS 'For continuous mode: maximum total people at any given time';
COMMENT ON COLUMN orario.buffer_tempo IS 'Minutes between bookings for table cleanup and preparation';
