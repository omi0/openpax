const { query, transaction } = require('../config/database');
const crypto = require('crypto');

/**
 * Restaurant Model
 * Manages restaurant entities and tenant relationships
 */
class Restaurant {
  /**
   * Create a new restaurant and tenant schema
   */
  static async create(restaurantData, ownerId) {
    return transaction(async (client) => {
      const { 
        nome_ristorante, 
        email, 
        telefono = null,
        indirizzo = null,
        citta = null,
        cap = null,
        paese = 'IT'
      } = restaurantData;

      // Generate slug from restaurant name
      const baseSlug = nome_ristorante
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      // Ensure unique slug
      let slug = baseSlug;
      let counter = 1;
      while (true) {
        const existingSlug = await client.query(
          'SELECT id FROM public.ristoranti WHERE slug = $1',
          [slug]
        );
        if (existingSlug.rows.length === 0) break;
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      // Generate schema name (max 63 chars for PostgreSQL)
      const schemaName = `tenant_${slug.substring(0, 50).replace(/-/g, '_')}`;

      // 1. Insert restaurant record
      const restaurantSql = `
        INSERT INTO public.ristoranti (
          schema_name, nome_ristorante, slug, email, 
          telefono, indirizzo, citta, cap, paese
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, schema_name, slug, created_at
      `;
      
      const restaurantResult = await client.query(restaurantSql, [
        schemaName,
        nome_ristorante,
        slug,
        email.toLowerCase(),
        telefono,
        indirizzo,
        citta,
        cap,
        paese
      ]);

      const restaurant = restaurantResult.rows[0];

      // 2. Create tenant membership for owner
      const membershipSql = `
        INSERT INTO public.tenant_memberships (
          utente_id, tenant_id, ruolo, permessi, accettato_at
        )
        VALUES ($1, $2, 'owner', $3, NOW())
        RETURNING id
      `;

      const ownerPermissions = {
        all: true,
        manage_users: true,
        manage_settings: true,
        manage_bookings: true,
        view_reports: true
      };

      await client.query(membershipSql, [
        ownerId,
        restaurant.id,
        JSON.stringify(ownerPermissions)
      ]);

      // 3. Create tenant schema
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);

      // 4. Create tenant tables
      await this.createTenantTables(client, schemaName);

      // 5. Insert default settings
      // GO to the todo inside the function and finish them before uncommenting --> await this.insertDefaultSettings(client, schemaName);

      return {
        id: restaurant.id,
        schemaName: restaurant.schema_name,
        slug: restaurant.slug,
        nomeRistorante: nome_ristorante,
        email,
        createdAt: restaurant.created_at
      };
    });
  }

  /**
   * Create all tenant-specific tables
   */
  static async createTenantTables(client, schemaName) {
    // Create tables in order of dependencies
    
    // 1. Clienti (customers)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.clienti (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        cognome VARCHAR(100),
        email VARCHAR(255),
        telefono VARCHAR(20) NOT NULL,
        vip BOOLEAN DEFAULT false,
        note TEXT,
        allergie TEXT,
        preferenze TEXT,
        totale_prenotazioni INTEGER DEFAULT 0,
        prenotazioni_completate INTEGER DEFAULT 0,
        prenotazioni_cancellate INTEGER DEFAULT 0,
        no_show_count INTEGER DEFAULT 0,
        ultima_prenotazione TIMESTAMP,
        consenso_privacy BOOLEAN DEFAULT false NOT NULL,
        consenso_newsletter BOOLEAN DEFAULT false,
        blacklisted BOOLEAN DEFAULT false,
        ip_address INET,
        fonte VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 2. Sale (rooms)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.sale (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        descrizione TEXT,
        capacita_massima INTEGER,
        attivo BOOLEAN DEFAULT true,
        ordine INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    `);

    // 3. Tavoli (tables)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.tavoli (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        sala_id INTEGER REFERENCES sale(id) ON DELETE CASCADE,
        numero VARCHAR(20) NOT NULL,
        posti_min INTEGER NOT NULL DEFAULT 2,
        posti_max INTEGER NOT NULL DEFAULT 4,
        solo_su_richiesta BOOLEAN DEFAULT false,
        prenotazione_minima_persone INTEGER,
        durata_prenotazione_custom INTEGER,
        posizione_x NUMERIC(10,2),
        posizione_y NUMERIC(10,2),
        forma VARCHAR(20) DEFAULT 'rectangle' CHECK (forma IN ('rectangle', 'circle', 'square', 'oval')),
        attivo BOOLEAN DEFAULT true,
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(sala_id, numero),
        CHECK (posti_max >= posti_min)
      )
    `);

    // 4. Orario (operating hours)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.orario (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        nome_servizio VARCHAR(50) NOT NULL,
        descrizione TEXT,
        giorno_settimana INTEGER NOT NULL CHECK (giorno_settimana BETWEEN 0 AND 6),
        ora_apertura TIME NOT NULL,
        ora_chiusura TIME NOT NULL,
        modalita_prenotazione VARCHAR(20) DEFAULT 'slot' CHECK (modalita_prenotazione IN ('slot', 'continuous')),
        durata_slot INTEGER,
        max_prenotazioni_per_slot INTEGER,
        durata_prenotazione_default INTEGER DEFAULT 90,
        durata_prenotazione_min INTEGER DEFAULT 60,
        durata_prenotazione_max INTEGER DEFAULT 180,
        capacita_max_persone INTEGER,
        capacita_max_tavoli INTEGER,
        consenti_sovrapposizione BOOLEAN DEFAULT false,
        buffer_tempo INTEGER DEFAULT 0,
        ordine INTEGER DEFAULT 0,
        colore VARCHAR(7),
        attivo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(giorno_settimana, nome_servizio),
        CHECK (ora_chiusura > ora_apertura),
        CHECK (durata_prenotazione_max >= durata_prenotazione_min),
        CHECK (
            (modalita_prenotazione = 'slot' AND durata_slot IS NOT NULL) OR
            (modalita_prenotazione = 'continuous')
        )
      )
    `);

    // 5. Orario eccezioni (schedule exceptions)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.orario_eccezioni (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        data_inizio DATE NOT NULL,
        data_fine DATE NOT NULL,
        tipo_eccezione VARCHAR(20) NOT NULL CHECK (tipo_eccezione IN ('chiusura', 'override', 'evento_speciale')),
        nome_servizio VARCHAR(50),
        descrizione TEXT,
        ora_apertura TIME,
        ora_chiusura TIME,
        modalita_prenotazione VARCHAR(20) CHECK (modalita_prenotazione IN ('slot', 'continuous')),
        durata_slot INTEGER,
        max_prenotazioni_per_slot INTEGER,
        durata_prenotazione_default INTEGER,
        durata_prenotazione_min INTEGER,
        durata_prenotazione_max INTEGER,
        capacita_max_persone INTEGER,
        capacita_max_tavoli INTEGER,
        consenti_sovrapposizione BOOLEAN,
        buffer_tempo INTEGER,
        servizi_interessati VARCHAR(100)[],
        tavoli_interessati INTEGER[],
        sale_interessate INTEGER[],
        ricorrente BOOLEAN DEFAULT false,
        ricorrenza_tipo VARCHAR(20) CHECK (ricorrenza_tipo IN ('weekly', 'monthly', 'yearly')),
        ricorrenza_giorni INTEGER[],
        motivo TEXT,
        attivo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CHECK (data_fine >= data_inizio),
        CHECK (
            (tipo_eccezione = 'chiusura' AND ora_apertura IS NULL) OR
            (tipo_eccezione IN ('override', 'evento_speciale') AND ora_apertura IS NOT NULL)
        ),
        CHECK (
            (ricorrente = false) OR
            (ricorrente = true AND ricorrenza_tipo IS NOT NULL)
        )
      )
    `);

    // 6. Prenotazioni (reservations)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.prenotazioni (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
        data DATE NOT NULL,
        ora TIME NOT NULL,
        numero_persone INTEGER NOT NULL CHECK (numero_persone > 0),
        durata INTEGER DEFAULT 90,
        nome_servizio VARCHAR(50),
        tavolo_id INTEGER REFERENCES tavoli(id) ON DELETE SET NULL,
        tavoli_ids INTEGER[],
        sala_id INTEGER REFERENCES sale(id) ON DELETE SET NULL,
        assegnazione_stato VARCHAR(20) DEFAULT 'pending' 
            CHECK (assegnazione_stato IN ('pending', 'proposed', 'confirmed', 'manual')),
        assegnazione_proposta_at TIMESTAMP,
        assegnazione_confermata_at TIMESTAMP, 
        assegnazione_utente_id INTEGER,
        stato VARCHAR(20) DEFAULT 'confermata' 
            CHECK (stato IN ('pending', 'confermata', 'completata', 'cancellata', 'no_show')),
        richiede_deposito BOOLEAN DEFAULT false,
        deposito_pagato BOOLEAN DEFAULT false,
        importo_deposito NUMERIC(10,2),
        nome VARCHAR(100) NOT NULL,
        cognome VARCHAR(100),
        telefono VARCHAR(20) NOT NULL,
        email VARCHAR(255),
        note_cliente TEXT,
        note_interne TEXT,
        richieste_speciali TEXT,
        allergie TEXT,
        fonte VARCHAR(50) DEFAULT 'widget' 
            CHECK (fonte IN ('widget', 'admin', 'phone', 'walkin', 'api')),
        ip_address INET,
        utente_creatore_id INTEGER,
        confermata_at TIMESTAMP,
        promemoria_inviato BOOLEAN DEFAULT false,
        promemoria_inviato_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        cancellata_at TIMESTAMP,
        cancellata_motivo TEXT
      )
    `);

    // 7. Impostazioni (settings)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.impostazioni (
        chiave VARCHAR(100) PRIMARY KEY,
        valore JSONB NOT NULL,
        categoria VARCHAR(50),
        descrizione TEXT,
        updated_at TIMESTAMPTZ DEFAULT now()
      )


      INSERT INTO impostazioni (chiave, valore, categoria, descrizione) VALUES
        ('max_persone_prenotazione', '12'::jsonb, 'booking', 'Maximum guests per single booking'),
        ('min_persone_prenotazione', '1'::jsonb, 'booking', 'Minimum guests per booking'),
        ('anticipo_minimo_ore', '2'::jsonb, 'booking', 'Minimum hours in advance to book'),
        ('anticipo_massimo_giorni', '60'::jsonb, 'booking', 'Maximum days in advance to book'),
        ('consenti_stesso_giorno', 'true'::jsonb, 'booking', 'Allow same-day bookings'),
        ('modalita_assegnazione_tavoli', '"semi_automatic"'::jsonb, 'table_management', 'Table assignment mode: automatic, semi_automatic, manual'),
        ('algoritmo_assegnazione', '"optimal_fit"'::jsonb, 'table_management', 'Assignment algorithm: optimal_fit, first_available, largest_table'),
        ('consenti_unione_tavoli', 'true'::jsonb, 'table_management', 'Allow combining multiple tables for large groups'),
        ('max_tavoli_unione', '3'::jsonb, 'table_management', 'Maximum tables that can be combined'),
        ('conferma_automatica', 'true'::jsonb, 'booking', 'Automatically confirm bookings without manual approval'),
        ('richiedi_deposito', 'false'::jsonb, 'booking', 'Require deposit for large groups'),
        ('deposito_da_persone', '8'::jsonb, 'booking', 'Require deposit for bookings with X or more people'),
        ('importo_deposito_per_persona', '10.00'::jsonb, 'booking', 'Deposit amount per person (in restaurant currency)'),
        ('promemoria_attivo', 'true'::jsonb, 'notification', 'Send booking reminders to customers'),
        ('promemoria_ore_prima', '24'::jsonb, 'notification', 'Hours before booking to send reminder'),
        ('email_notifiche', '""'::jsonb, 'notification', 'Restaurant email for booking notifications'),
        ('telefono_notifiche', '""'::jsonb, 'notification', 'Restaurant phone for SMS notifications'),
        ('notifica_nuova_prenotazione', 'true'::jsonb, 'notification', 'Notify restaurant on new booking'),
        ('widget_attivo', 'true'::jsonb, 'widget', 'Enable public booking widget'),
        ('widget_colore_primario', '"#e63946"'::jsonb, 'widget', 'Widget primary color (hex)'),
        ('widget_colore_secondario', '"#ffffff"'::jsonb, 'widget', 'Widget secondary color (hex)'),
        ('widget_logo_url', '""'::jsonb, 'widget', 'Logo image URL for widget'),
        ('widget_messaggio_benvenuto', '"Prenota il tuo tavolo"'::jsonb, 'widget', 'Welcome message in widget'),
        ('widget_mostra_tavoli', 'false'::jsonb, 'widget', 'Show table selection in public widget'),
        ('widget_richiedi_email', 'true'::jsonb, 'widget', 'Require email in booking form'),
        ('widget_richiedi_note', 'false'::jsonb, 'widget', 'Show notes/special requests field'),
        ('timezone', '"Europe/Rome"'::jsonb, 'business', 'Restaurant timezone'),
        ('lingua_default', '"it"'::jsonb, 'business', 'Default language (it, en, es, fr, de)'),
        ('valuta', '"EUR"'::jsonb, 'business', 'Currency code (EUR, USD, GBP)'),
        ('nome_visualizzato', '""'::jsonb, 'business', 'Display name (if different from registered name)'),
        ('website', '""'::jsonb, 'business', 'Restaurant website URL'),
        ('descrizione', '""'::jsonb, 'business', 'Short description for public pages'),
        ('gestione_sale_attiva', 'true'::jsonb, 'features', 'Enable multi-room management'),
        ('crm_attivo', 'true'::jsonb, 'features', 'Enable customer CRM tracking'),
        ('tracciamento_vip', 'true'::jsonb, 'features', 'Track and highlight VIP customers'),
        ('blocco_no_show', 'false'::jsonb, 'features', 'Auto-block customers after repeated no-shows'),
        ('max_no_show_consentiti', '3'::jsonb, 'features', 'Maximum no-shows before auto-blocking customer'),
        ('ip_rate_limit_attivo', 'true'::jsonb, 'security', 'Enable IP-based rate limiting'),
        ('ip_rate_limit_max_prenotazioni', '3'::jsonb, 'security', 'Max bookings per IP per day')
        ON CONFLICT (chiave) DO NOTHING;
    `);

    // 8. Notifiche template
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.notifiche_template (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('conferma', 'promemoria', 'cancellazione', 'modifica', 'no_show')),
        canale VARCHAR(20) NOT NULL CHECK (canale IN ('email', 'sms')),
        oggetto VARCHAR(255),
        corpo TEXT NOT NULL,
        variabili JSONB DEFAULT '["{{nome}}", "{{data}}", "{{ora}}", "{{persone}}", "{{tavolo}}"]',
        attivo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(tipo, canale)
      )
    `);

    // 9. IP rate limiting
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.ip_rate_limit (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        ip_address INET NOT NULL,
        prenotazioni_oggi INTEGER DEFAULT 1,
        tentativi_bloccati INTEGER DEFAULT 0,
        data DATE DEFAULT CURRENT_DATE,
        ultima_prenotazione TIMESTAMP DEFAULT NOW(),
        UNIQUE(ip_address, data)
      )
    `);

    // Create indexes for better performance
    await client.query(`CREATE INDEX idx_${schemaName}_prenotazioni_data ON ${schemaName}.prenotazioni(data)`);
    await client.query(`CREATE INDEX idx_${schemaName}_prenotazioni_stato ON ${schemaName}.prenotazioni(stato)`);
    await client.query(`CREATE INDEX idx_${schemaName}_clienti_email ON ${schemaName}.clienti(email)`);
    await client.query(`CREATE INDEX idx_${schemaName}_clienti_telefono ON ${schemaName}.clienti(telefono)`);
    await client.query(`CREATE INDEX idx_${schemaName}_sale_attivo ON ${schemaName}.sale(attivo)`);
    await client.query(`CREATE INDEX idx_${schemaName}_sale_ordine ON ${schemaName}.sale(ordine)`);
    await client.query(`CREATE INDEX idx_${schemaName}_tavoli_sala ON ${schemaName}.tavoli(sala_id)`);
    await client.query(`CREATE INDEX idx_${schemaName}_tavoli_attivo ON ${schemaName}.tavoli(attivo)`);
    await client.query(`CREATE INDEX idx_${schemaName}_tavoli_posti ON ${schemaName}.tavoli(posti_min, posti_max)`);
    await client.query(`CREATE INDEX idx_${schemaName}_orario_giorno_attivo ON ${schemaName}.orario(giorno_settimana, attivo)`);
    await client.query(`CREATE INDEX idx_${schemaName}_orario_servizio ON ${schemaName}.orario(nome_servizio)`);
    await client.query(`CREATE INDEX idx_${schemaName}_orario_eccezioni ON ${schemaName}.orario_eccezioni(data_inizio, data_fine)`);
    await client.query(`CREATE INDEX idx_${schemaName}_orario_eccezioni_tipo ON ${schemaName}.orario_eccezioni(tipo_eccezione, attivo)`);
    await client.query(`CREATE INDEX idx_${schemaName}_orario_eccezioni_ricorrente ON ${schemaName}.orario_eccezioni(ricorrente, attivo)`);
    await client.query(`CREATE INDEX idx_${schemaName}_prenotazioni_data_ora ON ${schemaName}.prenotazioni(data, ora)`);
    await client.query(`CREATE INDEX idx_${schemaName}_prenotazioni_data_stato ON ${schemaName}.prenotazioni(data, stato)`);
    await client.query(`CREATE INDEX idx_${schemaName}_prenotazioni_cliente ON ${schemaName}.prenotazioni(cliente_id)`);
    await client.query(`CREATE INDEX idx_${schemaName}_prenotazioni_tavolo ON ${schemaName}.prenotazioni(tavolo_id)`);
    await client.query(`CREATE INDEX idx_${schemaName}_prenotazioni_stato ON ${schemaName}.prenotazioni(stato)`);
    await client.query(`CREATE INDEX idx_${schemaName}_prenotazioni_assegnazione ON ${schemaName}.prenotazioni(assegnazione_stato)`);
    await client.query(`CREATE INDEX idx_${schemaName}_prenotazioni_servizio_data ON ${schemaName}.prenotazioni(nome_servizio, data)`);
    await client.query(`CREATE INDEX idx_${schemaName}_prenotazioni_telefono ON ${schemaName}.prenotazioni(telefono)`);
    await client.query(`CREATE INDEX idx_${schemaName}_prenotazioni_email ON ${schemaName}.prenotazioni(email)`);
    await client.query(`CREATE INDEX idx_${schemaName}_prenotazioni_utente_creatore ON ${schemaName}.prenotazioni(utente_creatore_id)`);
    await client.query(`CREATE INDEX idx_${schemaName}_impostazioni_categoria ON ${schemaName}.impostazioni(categoria)`);
  }

  /**
   * Insert default settings for new restaurant TODO: Adapt to db schema
   */
  static async insertDefaultSettings(client, schemaName) {
    const defaultSettings = [
      {
        chiave: 'booking_advance_days',
        valore: JSON.stringify({ value: 30 }),
        categoria: 'booking',
        descrizione: 'Days in advance bookings can be made'
      },
      {
        chiave: 'booking_time_slot',
        valore: JSON.stringify({ value: 15 }),
        categoria: 'booking',
        descrizione: 'Time slot intervals in minutes'
      },
      {
        chiave: 'min_booking_notice',
        valore: JSON.stringify({ value: 2 }),
        categoria: 'booking',
        descrizione: 'Minimum hours notice for bookings'
      },
      {
        chiave: 'max_party_size',
        valore: JSON.stringify({ value: 12 }),
        categoria: 'booking',
        descrizione: 'Maximum party size'
      },
      {
        chiave: 'confirmation_required',
        valore: JSON.stringify({ value: true }),
        categoria: 'booking',
        descrizione: 'Require confirmation for bookings'
      },
      {
        chiave: 'default_booking_duration',
        valore: JSON.stringify({ value: 120 }),
        categoria: 'booking',
        descrizione: 'Default booking duration in minutes'
      },
      {
        chiave: 'notifications_enabled',
        valore: JSON.stringify({ email: true, sms: false }),
        categoria: 'notifications',
        descrizione: 'Notification channels enabled'
      }
    ];

    for (const setting of defaultSettings) {
      await client.query(
        `INSERT INTO ${schemaName}.impostazioni (chiave, valore, categoria, descrizione)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (chiave) DO NOTHING`,
        [setting.chiave, setting.valore, setting.categoria, setting.descrizione]
      );
    }

    // Insert default operating hours (Monday-Sunday) :TODO adapt to db schema as seen upwards
    const defaultHours = [
      { day: 0, lunch_open: null, lunch_close: null, dinner_open: null, dinner_close: null, closed: true }, // Sunday
      { day: 1, lunch_open: '12:00', lunch_close: '15:00', dinner_open: '19:00', dinner_close: '23:00', closed: false },
      { day: 2, lunch_open: '12:00', lunch_close: '15:00', dinner_open: '19:00', dinner_close: '23:00', closed: false },
      { day: 3, lunch_open: '12:00', lunch_close: '15:00', dinner_open: '19:00', dinner_close: '23:00', closed: false },
      { day: 4, lunch_open: '12:00', lunch_close: '15:00', dinner_open: '19:00', dinner_close: '23:00', closed: false },
      { day: 5, lunch_open: '12:00', lunch_close: '15:00', dinner_open: '19:00', dinner_close: '23:00', closed: false },
      { day: 6, lunch_open: '12:00', lunch_close: '15:00', dinner_open: '19:00', dinner_close: '23:00', closed: false }
    ];

    for (const hours of defaultHours) {
      await client.query(
        `INSERT INTO ${schemaName}.orario 
         (giorno_settimana, apertura_pranzo, chiusura_pranzo, apertura_cena, chiusura_cena, chiuso)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [hours.day, hours.lunch_open, hours.lunch_close, hours.dinner_open, hours.dinner_close, hours.closed]
      );
    }
  }

  /**
   * Find restaurant by ID
   */
  static async findById(restaurantId) {
    const sql = `
      SELECT r.*, 
             COUNT(DISTINCT tm.utente_id) as staff_count
      FROM public.ristoranti r
      LEFT JOIN public.tenant_memberships tm ON r.id = tm.tenant_id AND tm.attivo = true
      WHERE r.id = $1
      GROUP BY r.id
    `;
    
    const result = await query(sql, [restaurantId]);
    return result.rows[0] || null;
  }

  /**
   * Find restaurant by slug
   */
  static async findBySlug(slug) {
    const sql = 'SELECT * FROM public.ristoranti WHERE slug = $1 AND attivo = true';
    const result = await query(sql, [slug]);
    return result.rows[0] || null;
  }

  /**
   * Get all restaurants for a user
   */
  static async findByUserId(userId) {
    const sql = `
      SELECT r.*, tm.ruolo, tm.permessi, tm.accettato_at
      FROM public.ristoranti r
      INNER JOIN public.tenant_memberships tm ON r.id = tm.tenant_id
      WHERE tm.utente_id = $1 AND tm.attivo = true AND r.attivo = true
      ORDER BY tm.ruolo = 'owner' DESC, r.created_at DESC
    `;
    
    const result = await query(sql, [userId]);
    return result.rows;
  }

  /**
   * Check if user has access to restaurant
   */
  static async checkUserAccess(userId, restaurantId, requiredRole = null) {
    const sql = `
      SELECT ruolo, permessi
      FROM public.tenant_memberships
      WHERE utente_id = $1 AND tenant_id = $2 AND attivo = true
    `;
    
    const result = await query(sql, [userId, restaurantId]);
    
    if (result.rows.length === 0) {
      return { hasAccess: false };
    }

    const membership = result.rows[0];
    const roleHierarchy = { owner: 4, manager: 3, staff: 2, viewer: 1 };

    if (requiredRole) {
      const hasRequiredRole = roleHierarchy[membership.ruolo] >= roleHierarchy[requiredRole];
      return {
        hasAccess: hasRequiredRole,
        role: membership.ruolo,
        permissions: membership.permessi
      };
    }

    return {
      hasAccess: true,
      role: membership.ruolo,
      permissions: membership.permessi
    };
  }

  /**
   * Update restaurant details
   */
  static async update(restaurantId, updates) {
    const allowedFields = ['nome_ristorante', 'email', 'telefono', 'indirizzo', 'citta', 'cap', 'paese'];
    const updateFields = [];
    const values = [];
    let valueIndex = 1;

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateFields.push(`${field} = $${valueIndex}`);
        values.push(updates[field]);
        valueIndex++;
      }
    }

    if (updateFields.length === 0) {
      return null;
    }

    values.push(restaurantId);
    
    const sql = `
      UPDATE public.ristoranti
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $${valueIndex}
      RETURNING *
    `;

    const result = await query(sql, values);
    return result.rows[0];
  }

  /**
   * Deactivate restaurant (soft delete)
   */
  static async deactivate(restaurantId) {
    const sql = `
      UPDATE public.ristoranti
      SET attivo = false, updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `;

    const result = await query(sql, [restaurantId]);
    
    if (result.rowCount > 0) {
      // Also deactivate all memberships
      await query(
        'UPDATE public.tenant_memberships SET attivo = false WHERE tenant_id = $1',
        [restaurantId]
      );
    }

    return result.rowCount > 0;
  }

  /**
   * Get restaurant statistics
   */
  static async getStats(restaurantId, schemaName) {
    const stats = {};

    // Get staff count
    const staffSql = `
      SELECT COUNT(*) as total,
             COUNT(*) FILTER (WHERE ruolo = 'owner') as owners,
             COUNT(*) FILTER (WHERE ruolo = 'manager') as managers,
             COUNT(*) FILTER (WHERE ruolo = 'staff') as staff
      FROM public.tenant_memberships
      WHERE tenant_id = $1 AND attivo = true
    `;
    const staffResult = await query(staffSql, [restaurantId]);
    stats.staff = staffResult.rows[0];

    // Get booking stats for today
    const bookingSql = `
      SELECT COUNT(*) as total,
             COUNT(*) FILTER (WHERE stato = 'confermata') as confirmed,
             COUNT(*) FILTER (WHERE stato = 'arrivato') as arrived,
             COUNT(*) FILTER (WHERE stato = 'completata') as completed
      FROM ${schemaName}.prenotazioni
      WHERE data = CURRENT_DATE
    `;
    const bookingResult = await query(bookingSql);
    stats.todayBookings = bookingResult.rows[0];

    // Get table count
    const tableSql = `
      SELECT COUNT(*) as total,
             COUNT(*) FILTER (WHERE attivo = true) as active
      FROM ${schemaName}.tavoli
    `;
    const tableResult = await query(tableSql);
    stats.tables = tableResult.rows[0];

    return stats;
  }
}

module.exports = Restaurant;