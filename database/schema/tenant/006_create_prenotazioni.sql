-- ============================================================================
-- TENANT SCHEMA: Reservations
-- ============================================================================
-- Core booking table with customer data, table assignments, and status tracking
-- NOTE: References to public.utenti cannot use foreign keys (cross-schema limitation)

CREATE TABLE IF NOT EXISTS prenotazioni (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    -- Customer reference (business data - in tenant schema)
    cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
    
    -- Booking details
    data DATE NOT NULL,
    ora TIME NOT NULL,
    numero_persone INTEGER NOT NULL CHECK (numero_persone > 0),
    durata INTEGER DEFAULT 90, -- Booking duration in minutes
    
    -- Service reference
    nome_servizio VARCHAR(50), -- Which service period (lunch, dinner, etc.)
    
    -- Table assignment
    tavolo_id INTEGER REFERENCES tavoli(id) ON DELETE SET NULL, -- Single table
    tavoli_ids INTEGER[], -- Multiple tables (combined for large groups)
    sala_id INTEGER REFERENCES sale(id) ON DELETE SET NULL,
    
    -- Table assignment workflow
    assegnazione_stato VARCHAR(20) DEFAULT 'pending' 
        CHECK (assegnazione_stato IN ('pending', 'proposed', 'confirmed', 'manual')),
    assegnazione_proposta_at TIMESTAMP, -- When algorithm proposed table
    assegnazione_confermata_at TIMESTAMP, -- When owner confirmed assignment
    assegnazione_utente_id INTEGER, -- WHO assigned the table (references public.utenti.id - no FK possible)
    
    -- Booking status
    stato VARCHAR(20) DEFAULT 'confermata' 
        CHECK (stato IN ('pending', 'confermata', 'completata', 'cancellata', 'no_show')),
    
    -- Payment tracking
    richiede_deposito BOOLEAN DEFAULT false,
    deposito_pagato BOOLEAN DEFAULT false,
    importo_deposito NUMERIC(10,2),
    
    -- Customer data (denormalized for GDPR and performance)
    nome VARCHAR(100) NOT NULL,
    cognome VARCHAR(100),
    telefono VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    
    -- Special requests
    note_cliente TEXT, -- Customer-provided notes
    note_interne TEXT, -- Staff-only notes
    richieste_speciali TEXT, -- Special requests (birthday, anniversary, etc.)
    allergie TEXT, -- Dietary restrictions
    
    -- Source tracking
    fonte VARCHAR(50) DEFAULT 'widget' 
        CHECK (fonte IN ('widget', 'admin', 'phone', 'walkin', 'api')),
    ip_address INET,
    utente_creatore_id INTEGER, -- Staff who created booking (references public.utenti.id - no FK possible)
    
    -- Confirmation & reminders
    confermata_at TIMESTAMP,
    promemoria_inviato BOOLEAN DEFAULT false,
    promemoria_inviato_at TIMESTAMP,
    
    -- Audit timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    cancellata_at TIMESTAMP,
    cancellata_motivo TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_prenotazioni_data_ora ON prenotazioni(data, ora);
CREATE INDEX IF NOT EXISTS idx_prenotazioni_data_stato ON prenotazioni(data, stato);
CREATE INDEX IF NOT EXISTS idx_prenotazioni_cliente ON prenotazioni(cliente_id);
CREATE INDEX IF NOT EXISTS idx_prenotazioni_tavolo ON prenotazioni(tavolo_id);
CREATE INDEX IF NOT EXISTS idx_prenotazioni_stato ON prenotazioni(stato);
CREATE INDEX IF NOT EXISTS idx_prenotazioni_assegnazione ON prenotazioni(assegnazione_stato);
CREATE INDEX IF NOT EXISTS idx_prenotazioni_servizio_data ON prenotazioni(nome_servizio, data);
CREATE INDEX IF NOT EXISTS idx_prenotazioni_telefono ON prenotazioni(telefono);
CREATE INDEX IF NOT EXISTS idx_prenotazioni_email ON prenotazioni(email);
CREATE INDEX IF NOT EXISTS idx_prenotazioni_utente_creatore ON prenotazioni(utente_creatore_id);

-- Comments
COMMENT ON TABLE prenotazioni IS 'Restaurant reservations with customer and table tracking';
COMMENT ON COLUMN prenotazioni.cliente_id IS 'Reference to customer (NULL for one-time bookings)';
COMMENT ON COLUMN prenotazioni.durata IS 'Expected booking duration in minutes';
COMMENT ON COLUMN prenotazioni.tavoli_ids IS 'Array of table IDs for combined tables (large groups)';
COMMENT ON COLUMN prenotazioni.assegnazione_stato IS 'pending: no table | proposed: algorithm suggested | confirmed: approved | manual: staff assigned';
COMMENT ON COLUMN prenotazioni.assegnazione_utente_id IS 'References public.utenti.id (staff who assigned table) - FK not possible across schemas';
COMMENT ON COLUMN prenotazioni.stato IS 'pending: awaiting confirmation | confermata: active | completata: customer came | cancellata: cancelled | no_show: customer didn''t show';
COMMENT ON COLUMN prenotazioni.nome IS 'Denormalized from clienti for performance and GDPR (data persists even if customer deleted)';
COMMENT ON COLUMN prenotazioni.fonte IS 'How booking was created: widget, admin dashboard, phone, walk-in, or API';
COMMENT ON COLUMN prenotazioni.utente_creatore_id IS 'References public.utenti.id (staff who created booking) - FK not possible across schemas';

-- Note about cross-schema references:
-- utente_creatore_id and assegnazione_utente_id reference public.utenti.id
-- We cannot use FOREIGN KEY constraints across schemas in PostgreSQL
-- Application must ensure referential integrity
-- Query example: 
--   SELECT p.*, u.nome, u.cognome 
--   FROM prenotazioni p 
--   LEFT JOIN public.utenti u ON p.utente_creatore_id = u.id;
