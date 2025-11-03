# Database Schema - NEW ARCHITECTURE

**Multi-tenant Restaurant SaaS with Users in Public Schema**

---

NEW: Users at Platform Level

Users are now stored in the **public schema** (platform level), not in tenant schemas.



### **PUBLIC SCHEMA** (Platform Layer)

Contains platform-wide data and ALL users:

| Table | Purpose | Records |
|-------|---------|---------|
| `ristoranti` | Restaurant registry | One per tenant |
| `utenti` | ALL staff users (platform-level) | All users |
| `tenant_memberships` | User access to restaurants with roles | Many-to-many |

### **TENANT SCHEMA** (Business Data)

Contains restaurant-specific business data:

| Table | Purpose |
|-------|---------|
| `clienti` | Restaurant customers (guests) |
| `sale` | Rooms/dining areas |
| `tavoli` | Tables within rooms |
| `orario` | Operating schedule |
| `orario_eccezioni` | Date-specific overrides & closures |
| `prenotazioni` | Reservations/bookings |
| `impostazioni` | Restaurant settings |
| `notifiche_template` | Email/SMS templates |
| `ip_rate_limit` | IP rate limiting |

---