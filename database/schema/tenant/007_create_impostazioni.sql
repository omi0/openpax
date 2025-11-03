-- ============================================================================
-- TENANT SCHEMA: Restaurant Settings
-- ============================================================================
-- Flexible key-value configuration for per-restaurant customization
-- Settings can be updated without schema changes

CREATE TABLE IF NOT EXISTS impostazioni (
    chiave VARCHAR(100) PRIMARY KEY,
    valore TEXT NOT NULL,
    tipo VARCHAR(20) DEFAULT 'string' CHECK (tipo IN ('string', 'integer', 'boolean', 'json', 'array')),
    categoria VARCHAR(50),
    descrizione TEXT,
    
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Default settings for new restaurant schemas
INSERT INTO impostazioni (chiave, valore, tipo, categoria, descrizione) VALUES
-- Booking rules
('max_persone_prenotazione', '12', 'integer', 'booking', 'Maximum guests per single booking'),
('min_persone_prenotazione', '1', 'integer', 'booking', 'Minimum guests per booking'),
('anticipo_minimo_ore', '2', 'integer', 'booking', 'Minimum hours in advance to book'),
('anticipo_massimo_giorni', '60', 'integer', 'booking', 'Maximum days in advance to book'),
('consenti_stesso_giorno', 'true', 'boolean', 'booking', 'Allow same-day bookings'),

-- Table assignment
('modalita_assegnazione_tavoli', 'semi_automatic', 'string', 'table_management', 'Table assignment mode: automatic, semi_automatic, manual'),
('algoritmo_assegnazione', 'optimal_fit', 'string', 'table_management', 'Assignment algorithm: optimal_fit, first_available, largest_table'),
('consenti_unione_tavoli', 'true', 'boolean', 'table_management', 'Allow combining multiple tables for large groups'),
('max_tavoli_unione', '3', 'integer', 'table_management', 'Maximum tables that can be combined'),

-- Confirmation & deposits
('conferma_automatica', 'true', 'boolean', 'booking', 'Automatically confirm bookings without manual approval'),
('richiedi_deposito', 'false', 'boolean', 'booking', 'Require deposit for large groups'),
('deposito_da_persone', '8', 'integer', 'booking', 'Require deposit for bookings with X or more people'),
('importo_deposito_per_persona', '10.00', 'string', 'booking', 'Deposit amount per person (in restaurant currency)'),

-- Notifications
('promemoria_attivo', 'true', 'boolean', 'notification', 'Send booking reminders to customers'),
('promemoria_ore_prima', '24', 'integer', 'notification', 'Hours before booking to send reminder'),
('email_notifiche', '', 'string', 'notification', 'Restaurant email for booking notifications'),
('telefono_notifiche', '', 'string', 'notification', 'Restaurant phone for SMS notifications'),
('notifica_nuova_prenotazione', 'true', 'boolean', 'notification', 'Notify restaurant on new booking'),

-- Widget customization
('widget_attivo', 'true', 'boolean', 'widget', 'Enable public booking widget'),
('widget_colore_primario', '#e63946', 'string', 'widget', 'Widget primary color (hex)'),
('widget_colore_secondario', '#ffffff', 'string', 'widget', 'Widget secondary color (hex)'),
('widget_logo_url', '', 'string', 'widget', 'Logo image URL for widget'),
('widget_messaggio_benvenuto', 'Prenota il tuo tavolo', 'string', 'widget', 'Welcome message in widget'),
('widget_mostra_tavoli', 'false', 'boolean', 'widget', 'Show table selection in public widget'),
('widget_richiedi_email', 'true', 'boolean', 'widget', 'Require email in booking form'),
('widget_richiedi_note', 'false', 'boolean', 'widget', 'Show notes/special requests field'),

-- Business settings
('timezone', 'Europe/Rome', 'string', 'business', 'Restaurant timezone'),
('lingua_default', 'it', 'string', 'business', 'Default language (it, en, es, fr, de)'),
('valuta', 'EUR', 'string', 'business', 'Currency code (EUR, USD, GBP)'),
('nome_visualizzato', '', 'string', 'business', 'Display name (if different from registered name)'),
('website', '', 'string', 'business', 'Restaurant website URL'),
('descrizione', '', 'string', 'business', 'Short description for public pages'),

-- Feature toggles
('gestione_sale_attiva', 'true', 'boolean', 'features', 'Enable multi-room management'),
('crm_attivo', 'true', 'boolean', 'features', 'Enable customer CRM tracking'),
('tracciamento_vip', 'true', 'boolean', 'features', 'Track and highlight VIP customers'),
('blocco_no_show', 'false', 'boolean', 'features', 'Auto-block customers after repeated no-shows'),
('max_no_show_consentiti', '3', 'integer', 'features', 'Maximum no-shows before auto-blocking customer'),

-- IP Rate limiting
('ip_rate_limit_attivo', 'true', 'boolean', 'security', 'Enable IP-based rate limiting'),
('ip_rate_limit_max_prenotazioni', '3', 'integer', 'security', 'Max bookings per IP per day');

-- Index for category filtering
CREATE INDEX IF NOT EXISTS idx_impostazioni_categoria ON impostazioni(categoria);

-- Comments
COMMENT ON TABLE impostazioni IS 'Flexible key-value configuration for restaurant-specific settings';
COMMENT ON COLUMN impostazioni.tipo IS 'Data type hint for parsing values';
COMMENT ON COLUMN impostazioni.categoria IS 'Grouping for UI organization';
