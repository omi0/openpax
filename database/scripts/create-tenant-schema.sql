-- ============================================================================
-- SCRIPT: Create New Tenant Schema
-- ============================================================================
-- This script creates a complete tenant schema for a new restaurant
-- 
-- USAGE:
--   Replace 'restaurant_XXX' with actual schema name (e.g., restaurant_001)
--   Run this script as a superuser or database owner
--
-- EXAMPLE:
--   psql -U postgres -d restaurant_saas -v schema_name=restaurant_001 -f create-tenant-schema.sql
-- ============================================================================

-- Set variables (replace these or pass via -v flag)
\set schema_name 'restaurant_001'

-- Create the schema
CREATE SCHEMA IF NOT EXISTS :schema_name;

-- Set search path to new schema
SET search_path TO :schema_name, public;

-- Run all table creation scripts in order
\i ../schema/tenant/001_create_utenti.sql
\i ../schema/tenant/002_create_clienti.sql
\i ../schema/tenant/003_create_sale.sql
\i ../schema/tenant/004_create_tavoli.sql
\i ../schema/tenant/005_create_orario.sql
\i ../schema/tenant/006_create_orario_eccezioni.sql
\i ../schema/tenant/007_create_prenotazioni.sql
\i ../schema/tenant/008_create_impostazioni.sql
\i ../schema/tenant/009_create_notifiche_template.sql
\i ../schema/tenant/010_create_ip_rate_limit.sql

-- Register tenant in public.ristoranti table
SET search_path TO public;

INSERT INTO public.ristoranti (schema_name, nome_ristorante, slug, email, versione_schema)
VALUES (
    :'schema_name',
    'REPLACE_WITH_RESTAURANT_NAME',
    'REPLACE_WITH_SLUG',
    'REPLACE_WITH_EMAIL',
    '1.0.0'
)
ON CONFLICT (schema_name) DO NOTHING;

-- Success message
\echo 'Tenant schema created successfully!'
\echo 'Schema name: ' :schema_name
\echo ''
\echo 'IMPORTANT: Update the restaurant details in public.ristoranti table:'
\echo 'UPDATE public.ristoranti SET '
\echo '  nome_ristorante = ''Your Restaurant Name'', '
\echo '  slug = ''your-restaurant-slug'', '
\echo '  email = ''contact@restaurant.com'', '
\echo '  telefono = ''+39...'', '
\echo '  indirizzo = ''Address'', '
\echo '  citta = ''City'', '
\echo '  cap = ''12345'' '
\echo 'WHERE schema_name = ''' :schema_name ''';'

-- Reset search path
SET search_path TO public;
