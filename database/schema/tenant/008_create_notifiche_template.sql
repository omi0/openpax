-- ============================================================================
-- TENANT SCHEMA: Notification Templates
-- ============================================================================
-- Email and SMS templates for automated customer communications
-- Supports template variables for personalization

CREATE TABLE IF NOT EXISTS notifiche_template (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    
    -- Template identification
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('conferma', 'promemoria', 'cancellazione', 'modifica', 'no_show')),
    canale VARCHAR(20) NOT NULL CHECK (canale IN ('email', 'sms')),
    
    -- Email-specific
    oggetto VARCHAR(255), -- Email subject (NULL for SMS)
    
    -- Message content
    corpo TEXT NOT NULL,
    
    -- Available variables (JSON documentation)
    variabili JSONB DEFAULT '["{{nome}}", "{{data}}", "{{ora}}", "{{persone}}", "{{tavolo}}"]',
    
    -- Status
    attivo BOOLEAN DEFAULT true,
    
    -- Audit timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Ensure one template per type+channel combination
    UNIQUE(tipo, canale)
);

-- Default templates for Italian restaurants
INSERT INTO notifiche_template (tipo, canale, oggetto, corpo, variabili) VALUES
-- Confirmation email
('conferma', 'email', 
 'Prenotazione confermata - {{nome_ristorante}}',
 'Gentile {{nome}},

La tua prenotazione è stata confermata!

Dettagli:
- Data: {{data}}
- Ora: {{ora}}
- Persone: {{persone}}
- Tavolo: {{tavolo}}

{{note_speciali}}

Non vediamo l''ora di accoglierti!

Per modifiche o cancellazioni, contattaci al {{telefono_ristorante}}.

Cordiali saluti,
{{nome_ristorante}}',
 '["{{nome}}", "{{data}}", "{{ora}}", "{{persone}}", "{{tavolo}}", "{{nome_ristorante}}", "{{telefono_ristorante}}", "{{note_speciali}}"]'::jsonb),

-- Confirmation SMS
('conferma', 'sms',
 NULL,
 'Prenotazione confermata! {{data}} ore {{ora}} per {{persone}} persone. {{nome_ristorante}}',
 '["{{nome}}", "{{data}}", "{{ora}}", "{{persone}}", "{{nome_ristorante}}"]'::jsonb),

-- Reminder email
('promemoria', 'email',
 'Promemoria prenotazione - {{nome_ristorante}}',
 'Gentile {{nome}},

Ti ricordiamo la tua prenotazione:

Data: {{data}}
Ora: {{ora}}
Persone: {{persone}}

A domani!

{{nome_ristorante}}
{{indirizzo_ristorante}}
{{telefono_ristorante}}',
 '["{{nome}}", "{{data}}", "{{ora}}", "{{persone}}", "{{nome_ristorante}}", "{{indirizzo_ristorante}}", "{{telefono_ristorante}}"]'::jsonb),

-- Reminder SMS
('promemoria', 'sms',
 NULL,
 'Promemoria: prenotazione domani {{ora}} per {{persone}} persone. Ti aspettiamo! {{nome_ristorante}}',
 '["{{ora}}", "{{persone}}", "{{nome_ristorante}}"]'::jsonb),

-- Cancellation email
('cancellazione', 'email',
 'Prenotazione cancellata - {{nome_ristorante}}',
 'Gentile {{nome}},

La tua prenotazione del {{data}} alle {{ora}} è stata cancellata.

Speriamo di rivederti presto!

{{nome_ristorante}}',
 '["{{nome}}", "{{data}}", "{{ora}}", "{{nome_ristorante}}"]'::jsonb);

-- Comments
COMMENT ON TABLE notifiche_template IS 'Email and SMS templates for automated customer notifications';
COMMENT ON COLUMN notifiche_template.tipo IS 'Notification type: conferma, promemoria, cancellazione, modifica, no_show';
COMMENT ON COLUMN notifiche_template.canale IS 'Delivery channel: email or sms';
COMMENT ON COLUMN notifiche_template.corpo IS 'Message body with {{variable}} placeholders';
COMMENT ON COLUMN notifiche_template.variabili IS 'JSON array of available template variables for documentation';
