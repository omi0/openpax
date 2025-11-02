# Database Documentation

PostgreSQL database

### Multi-Tenancy Approach: **Schema-per-Tenant**

- **Single Database**: `restaurant_saas`
- **Public Schema**: Shared tenant registry
- **Per-Restaurant Schemas**: `restaurant_001`, `restaurant_002`, etc.

### Benefits

**Data Isolation**: Each restaurant has its own PostgreSQL schema  
**Security**: Schema-level permissions and access control  
**Scalability**: Support 100-5,000 restaurants on single database  
**Customization**: Per-tenant schema modifications if needed  
**Cost Effective**: Single database server, no separate databases  
**Easy Backups**: Backup individual schemas or entire database  

##  Directory Structure

database/
├── README.md                    # This file
├── DATABASE_SETUP.md            # Complete setup guide
│
├── schema/
│   ├── public/
│   │   └── 001_create_ristoranti.sql         # Tenant registry
│   │
│   └── tenant/
│       ├── 001_create_utenti.sql             # Staff users
│       ├── 002_create_clienti.sql            # Customer CRM
│       ├── 003_create_sale.sql               # Rooms/areas
│       ├── 004_create_tavoli.sql             # Tables
│       ├── 005_create_orario.sql             # Operating schedule
│       ├── 006_create_orario_eccezioni.sql   # Date overrides & closures
│       ├── 007_create_prenotazioni.sql       # Reservations
│       ├── 008_create_impostazioni.sql       # Settings
│       ├── 009_create_notifiche_template.sql # Email/SMS templates
│       └── 010_create_ip_rate_limit.sql      # IP rate limiting
│
├── scripts/
│   ├── create-tenant-schema.sql # SQL script for new tenant
│   └── create-tenant.js         # Node.js script for new tenant
│
├── migrations/
│   └── (future migration scripts)
│
└── seeds/
    └── (demo data for testing)


## Schema Design

### Public Schema

| Table | Purpose |
|-------|---------|
| `ristoranti` | Master registry of all restaurant tenants |

### Per-Restaurant Schema (restaurant_XXX)

| Table | Purpose |
|-------|---------|
| `utenti` | Staff user accounts (owner, manager, staff) |
| `clienti` | Customer CRM with booking history |
| `sale` | Restaurant rooms/dining areas |
| `tavoli` | Individual tables with seating capacity |
| `orario` | Base weekly operating schedule |
| `orario_eccezioni` | Date-specific overrides, closures, holidays |
| `prenotazioni` | Customer reservations |
| `impostazioni` | Restaurant-specific configuration |
| `notifiche_template` | Email/SMS templates |
| `ip_rate_limit` | IP-based booking rate limiting |


| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11 | Initial schema design |
