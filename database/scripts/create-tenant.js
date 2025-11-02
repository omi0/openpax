/**
 * Create New Tenant Schema - Node.js Script
 * 
 * Programmatically creates a new restaurant tenant with all required tables
 * 
 * Usage:
 *   node create-tenant.js --name "Pizzeria Roma" --email "info@pizzeriaroma.it"
 * 
 * OR with all options:
 *   node create-tenant.js \
 *     --name "Pizzeria Roma" \
 *     --email "info@pizzeriaroma.it" \
 *     --slug "pizzeria-roma" \
 *     --phone "+39 02 1234567" \
 *     --city "Milano" \
 *     --address "Via Roma, 1"
 */

const { Client } = require('pg');
const fs = require('fs').promises;
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (flag) => {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : null;
};

const config = {
  name: getArg('--name'),
  email: getArg('--email'),
  slug: getArg('--slug'),
  phone: getArg('--phone') || null,
  city: getArg('--city') || null,
  address: getArg('--address') || null,
  cap: getArg('--cap') || null,
  paese: getArg('--paese') || 'IT'
};

// Validate required fields
if (!config.name || !config.email) {
  console.error('❌ Error: --name and --email are required');
  console.log('\nUsage:');
  console.log('  node create-tenant.js --name "Restaurant Name" --email "email@restaurant.com"');
  process.exit(1);
}

// Generate slug if not provided
if (!config.slug) {
  config.slug = config.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Database connection
const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'restaurant_saas',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD
});

/**
 * Generate next available schema name
 */
async function getNextSchemaName() {
  const result = await client.query(`
    SELECT schema_name 
    FROM public.ristoranti 
    WHERE schema_name ~ '^restaurant_[0-9]+$'
    ORDER BY schema_name DESC 
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    return 'restaurant_001';
  }

  const lastSchema = result.rows[0].schema_name;
  const number = parseInt(lastSchema.split('_')[1]) + 1;
  return `restaurant_${number.toString().padStart(3, '0')}`;
}

/**
 * Read SQL file
 */
async function readSQLFile(filename) {
  const filePath = path.join(__dirname, '../schema/tenant', filename);
  return await fs.readFile(filePath, 'utf8');
}

/**
 * Create tenant schema and tables
 */
async function createTenant() {
  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Check if email already exists
    const emailCheck = await client.query(
      'SELECT schema_name FROM public.ristoranti WHERE email = $1',
      [config.email]
    );

    if (emailCheck.rows.length > 0) {
      console.error(`❌ Error: Email ${config.email} already exists for tenant ${emailCheck.rows[0].schema_name}`);
      process.exit(1);
    }

    // Check if slug already exists
    const slugCheck = await client.query(
      'SELECT schema_name FROM public.ristoranti WHERE slug = $1',
      [config.slug]
    );

    if (slugCheck.rows.length > 0) {
      console.error(`❌ Error: Slug ${config.slug} already exists for tenant ${slugCheck.rows[0].schema_name}`);
      process.exit(1);
    }

    // Generate schema name
    const schemaName = await getNextSchemaName();
    console.log(`📝 Creating tenant: ${schemaName}`);

    // Begin transaction
    await client.query('BEGIN');

    // Create schema
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
    console.log(`✅ Schema created: ${schemaName}`);

    // Set search path
    await client.query(`SET search_path TO ${schemaName}, public`);

    // Create all tables
    const tableFiles = [
      '001_create_utenti.sql',
      '002_create_clienti.sql',
      '003_create_sale.sql',
      '004_create_tavoli.sql',
      '005_create_orario.sql',
      '006_create_orario_eccezioni.sql',
      '007_create_prenotazioni.sql',
      '008_create_impostazioni.sql',
      '009_create_notifiche_template.sql',
      '010_create_ip_rate_limit.sql'
    ];

    for (const file of tableFiles) {
      console.log(`   Creating table from ${file}...`);
      const sql = await readSQLFile(file);
      await client.query(sql);
    }

    console.log('✅ All tables created');

    // Register tenant in public schema
    await client.query('SET search_path TO public');
    await client.query(
      `INSERT INTO public.ristoranti 
       (schema_name, nome_ristorante, slug, email, telefono, indirizzo, citta, cap, paese, versione_schema)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        schemaName,
        config.name,
        config.slug,
        config.email,
        config.phone,
        config.address,
        config.city,
        config.cap,
        config.paese,
        '1.0.0'
      ]
    );

    console.log('✅ Tenant registered in public.ristoranti');

    // Commit transaction
    await client.query('COMMIT');

    console.log('\n🎉 Tenant created successfully!\n');
    console.log('Details:');
    console.log(`  Schema Name: ${schemaName}`);
    console.log(`  Restaurant:  ${config.name}`);
    console.log(`  Slug:        ${config.slug}`);
    console.log(`  Email:       ${config.email}`);
    console.log(`\n📝 Next steps:`);
    console.log(`  1. Create initial staff user in ${schemaName}.utenti`);
    console.log(`  2. Configure operating hours in ${schemaName}.orario`);
    console.log(`  3. Add rooms and tables`);
    console.log(`  4. Customize settings in ${schemaName}.impostazioni`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating tenant:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Run
createTenant().catch(console.error);
