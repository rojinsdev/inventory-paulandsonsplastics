# Paul & Sons Plastics - Inventory & Production System
## Complete System Documentation

**Version**: 1.0  
**Last Updated**: January 15, 2026  
**Tech Stack**: Next.js 16, Node.js, PostgreSQL (Supabase), TypeScript

---

## Table of Contents
1. [System Overview](#system-overview)
2. [Environment Setup](#environment-setup)
3. [Database Schema](#database-schema)
4. [API Endpoints](#api-endpoints)
5. [Web Application Screens](#web-application-screens)
6. [Authentication & Authorization](#authentication--authorization)
7. [Business Logic](#business-logic)
8. [Deployment](#deployment)

---

## System Overview

### Architecture
```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   Next.js Web   │────────▶│   Node.js API   │────────▶│   PostgreSQL    │
│   (Port 3000)   │  HTTP   │   (Port 4000)   │   SQL   │   (Supabase)    │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

### Key Features
- **Production Management**: Track daily production by machine
- **Inventory State Machine**: Semi-Finished → Packed → Finished → Reserved
- **Sales Orders**: Stock reservation and delivery tracking
- **Role-Based Access**: Admin, Manager, Operator
- **Real-time Dashboard**: Production stats, inventory snapshot

---

## Environment Setup

### Server Environment Variables
**File**: `server/.env`

```bash
# Server Configuration
PORT=4000

# Supabase Configuration
SUPABASE_URL=https://gncbejlrycumifdhucqr.supabase.co
SUPABASE_KEY=sb_secret_k3fYr5Ug-fZqgZByokmhUw_HFBUAQCM

# Database URLs
DATABASE_URL="postgresql://postgres.gncbejlrycumifdhucqr:paul%26sons%40123@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.gncbejlrycumifdhucqr:paul%26sons%40123@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
```

**Important Notes**:
- `DATABASE_URL` uses transaction pooler (port 6543) for app queries
- `DIRECT_URL` uses direct connection (port 5432) for migrations
- Password contains special characters (`paul&sons@123`) - must be URL-encoded as `paul%26sons%40123`

### Web Environment Variables
**File**: `apps/web/.env.local`

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## Database Schema

### Core Tables

#### 1. **machines**
```sql
- id (uuid, PK)
- name (text, unique)
- type (text) -- 'extrusion' | 'injection' | 'blow_molding'
- category (text) -- 'primary' | 'secondary'
- max_die_weight (numeric)
- daily_running_cost (numeric)
- status (text) -- 'active' | 'maintenance' | 'inactive'
- created_at (timestamp)
```

#### 2. **products**
```sql
- id (uuid, PK)
- name (text)
- sku (text, unique)
- size (text)
- color (text)
- weight_grams (numeric)
- selling_price (numeric)
- items_per_packet (integer)
- packets_per_bundle (integer)
- created_at (timestamp)
```

#### 3. **machine_products** (Die Mapping)
```sql
- id (uuid, PK)
- machine_id (uuid, FK → machines)
- product_id (uuid, FK → products)
- die_weight (numeric)
- production_rate_per_hour (numeric)
- created_at (timestamp)
```

#### 4. **production_logs**
```sql
- id (uuid, PK)
- machine_id (uuid, FK → machines)
- product_id (uuid, FK → products)
- quantity_produced (integer)
- production_date (date)
- shift (text) -- 'morning' | 'evening' | 'night'
- operator_id (uuid, FK → user_profiles)
- efficiency_percent (numeric)
- downtime_minutes (integer)
- notes (text)
- created_at (timestamp)
```

#### 5. **stock_balances**
```sql
- product_id (uuid, FK → products, PK)
- state (text, PK) -- 'semi_finished' | 'packed' | 'finished' | 'reserved'
- quantity (integer)
- updated_at (timestamp)
```

**State Transitions**:
- `semi_finished` → `packed` (via `/api/inventory/pack`)
- `packed` → `finished` (via `/api/inventory/bundle`)
- `finished` → `reserved` (via sales order creation)
- `reserved` → *consumed* (via delivery confirmation)

#### 6. **inventory_transactions**
```sql
- id (uuid, PK)
- transaction_type (text) -- 'pack' | 'bundle' | 'reserve' | 'deliver'
- product_id (uuid, FK → products)
- quantity (integer)
- from_state (text)
- to_state (text)
- notes (text)
- created_at (timestamp)
```

#### 7. **customers**
```sql
- id (uuid, PK)
- name (text)
- phone (text)
- email (text)
- address (text)
- type (text) -- 'retail' | 'wholesale' | 'distributor'
- credit_limit (numeric)
- created_at (timestamp)
```

#### 8. **sales_orders**
```sql
- id (uuid, PK)
- customer_id (uuid, FK → customers)
- status (text) -- 'reserved' | 'delivered' | 'cancelled'
- order_date (timestamp)
- notes (text)
- created_at (timestamp)
```

#### 9. **sales_order_items**
```sql
- id (uuid, PK)
- sales_order_id (uuid, FK → sales_orders)
- product_id (uuid, FK → products)
- quantity_bundles (integer)
- created_at (timestamp)
```

#### 10. **system_settings**
```sql
- key (text, PK)
- value (jsonb)
- category (text)
- description (text)
- updated_at (timestamp)
```

**Key Settings**:
- `default_items_per_packet`: 12
- `default_packets_per_bundle`: 50
- `production_efficiency_threshold`: 80
- `low_stock_threshold`: 100

#### 11. **user_profiles**
```sql
- id (uuid, PK, FK → auth.users)
- email (text, unique)
- role (text) -- 'admin' | 'manager' | 'operator'
- full_name (text)
- phone (text)
- is_active (boolean)
- created_at (timestamp)
```

---

## API Endpoints

**Base URL**: `http://localhost:4000/api`

### Authentication
All endpoints (except `/auth/login`) require:
```
Authorization: Bearer <jwt_token>
```

#### Auth Endpoints
| Method | Endpoint | Description | Auth Required | Role Required |
|--------|----------|-------------|---------------|---------------|
| POST | `/auth/login` | User login | No | - |
| GET | `/auth/me` | Get current user | Yes | - |
| POST | `/auth/logout` | Logout | Yes | - |
| POST | `/auth/users` | Create user | Yes | admin |
| GET | `/auth/users` | List all users | Yes | admin |
| PATCH | `/auth/users/:id/deactivate` | Deactivate user | Yes | admin |

**Login Request**:
```json
{
  "email": "admin@paulandsons.com",
  "password": "admin123"
}
```

**Login Response**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "admin@paulandsons.com",
    "role": "admin",
    "full_name": "Admin User"
  }
}
```

---

### Machines
| Method | Endpoint | Description | Request Body |
|--------|----------|-------------|--------------|
| GET | `/machines` | List all machines | - |
| GET | `/machines/:id` | Get machine by ID | - |
| POST | `/machines` | Create machine | [Machine Object](#machine-object) |
| PUT | `/machines/:id` | Update machine | [Machine Object](#machine-object) |
| DELETE | `/machines/:id` | Delete machine | - |

#### Machine Object
```json
{
  "name": "Extrusion Machine 1",
  "type": "extrusion",
  "category": "primary",
  "max_die_weight": 500.5,
  "daily_running_cost": 5000,
  "status": "active"
}
```

---

### Products
| Method | Endpoint | Description | Request Body |
|--------|----------|-------------|--------------|
| GET | `/products` | List all products | - |
| GET | `/products/:id` | Get product by ID | - |
| POST | `/products` | Create product | [Product Object](#product-object) |
| PUT | `/products/:id` | Update product | [Product Object](#product-object) |
| DELETE | `/products/:id` | Delete product | - |

#### Product Object
```json
{
  "name": "HDPE Bag",
  "sku": "HDPE-001",
  "size": "12x18",
  "color": "White",
  "weight_grams": 50,
  "selling_price": 5.50,
  "items_per_packet": 12,
  "packets_per_bundle": 50
}
```

---

### Machine-Product Mapping (Die Mapping)
| Method | Endpoint | Description | Request Body |
|--------|----------|-------------|--------------|
| GET | `/machine-products` | List all mappings | - |
| GET | `/machine-products/:id` | Get mapping by ID | - |
| POST | `/machine-products` | Create mapping | [Mapping Object](#mapping-object) |
| PUT | `/machine-products/:id` | Update mapping | [Mapping Object](#mapping-object) |
| DELETE | `/machine-products/:id` | Delete mapping | - |

#### Mapping Object
```json
{
  "machine_id": "uuid",
  "product_id": "uuid",
  "die_weight": 300.5,
  "production_rate_per_hour": 500
}
```

---

### Production
| Method | Endpoint | Description | Request Body |
|--------|----------|-------------|--------------|
| GET | `/production` | List all production logs | - |
| GET | `/production/daily/:date` | Get production for date (YYYY-MM-DD) | - |
| POST | `/production/submit` | Submit production log | [Production Log](#production-log) |

#### Production Log
```json
{
  "machine_id": "uuid",
  "product_id": "uuid",
  "quantity_produced": 1000,
  "production_date": "2026-01-15",
  "shift": "morning",
  "operator_id": "uuid",
  "downtime_minutes": 30,
  "notes": "Normal operation"
}
```

**Response** includes calculated `efficiency_percent` based on:
- Target rate from `machine_products.production_rate_per_hour`
- Actual quantity produced
- Downtime minutes

---

### Inventory
| Method | Endpoint | Description | Request Body |
|--------|----------|-------------|--------------|
| GET | `/inventory` | Get all stock balances | - |
| GET | `/inventory/stock/:product_id` | Get stock for product | - |
| POST | `/inventory/pack` | Pack items (semi → packed) | [Pack Request](#pack-request) |
| POST | `/inventory/bundle` | Bundle packets (packed → finished) | [Bundle Request](#bundle-request) |

#### Pack Request
```json
{
  "product_id": "uuid",
  "packets_created": 100
}
```

**Logic**:
- Deducts `packets_created * items_per_packet` from `semi_finished`
- Adds `packets_created` to `packed` state

#### Bundle Request
```json
{
  "product_id": "uuid",
  "bundles_created": 10
}
```

**Logic**:
- Deducts `bundles_created * packets_per_bundle` from `packed`
- Adds `bundles_created` to `finished` state

---

### Customers
| Method | Endpoint | Description | Request Body |
|--------|----------|-------------|--------------|
| GET | `/customers` | List all customers | - |
| GET | `/customers/:id` | Get customer by ID | - |
| POST | `/customers` | Create customer | [Customer Object](#customer-object) |
| PUT | `/customers/:id` | Update customer | [Customer Object](#customer-object) |
| DELETE | `/customers/:id` | Delete customer | - |

#### Customer Object
```json
{
  "name": "ABC Trading Co.",
  "phone": "+91-9876543210",
  "email": "contact@abctrading.com",
  "address": "123 Market Street, Mumbai",
  "type": "wholesale",
  "credit_limit": 500000
}
```

---

### Sales Orders
| Method | Endpoint | Description | Request Body |
|--------|----------|-------------|--------------|
| GET | `/sales-orders` | List all orders | - |
| GET | `/sales-orders/:id` | Get order by ID | - |
| POST | `/sales-orders` | Create order (reserves stock) | [Order Request](#order-request) |
| PATCH | `/sales-orders/:id/status` | Update order status | [Status Update](#status-update) |
| DELETE | `/sales-orders/:id` | Delete order (unreserves stock) | - |

#### Order Request
```json
{
  "customer_id": "uuid",
  "items": [
    {
      "product_id": "uuid",
      "quantity_bundles": 50
    },
    {
      "product_id": "uuid",
      "quantity_bundles": 30
    }
  ],
  "notes": "Urgent delivery required"
}
```

**Stock Reservation Logic**:
1. Validates `finished` stock availability
2. Moves stock from `finished` → `reserved`
3. Creates order with status `reserved`

#### Status Update
```json
{
  "status": "delivered"
}
```

**Valid Transitions**:
- `reserved` → `delivered` (permanently removes from `reserved`)
- `reserved` → `cancelled` (returns stock to `finished`)

❌ Cannot cancel `delivered` orders

---

### Settings
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/settings` | Get all settings | Yes |
| GET | `/settings/category/:category` | Get by category | Yes |
| GET | `/settings/value/:key` | Get specific value | Yes |
| PATCH | `/settings/:key` | Update setting | Admin only |
| POST | `/settings/refresh-cache` | Refresh settings cache | Admin only |

---

## Web Application Screens

### Current Structure (To Be Refactored)
All routes currently under `/dashboard/`:

#### 1. **Dashboard** (`/dashboard`)
- **URL**: `/dashboard`
- **Features**:
  - Production overview (today's total)
  - Inventory snapshot (finished, semi-finished goods)
  - Per-machine production breakdown
  - Quick action links

#### 2. **Machines** (`/dashboard/config/machines`)
- **List** (`/dashboard/config/machines`): View all machines
- **Create** (`/dashboard/config/machines/new`): Add new machine
- **Edit** (`/dashboard/config/machines/[id]`): Update machine details

#### 3. **Products** (`/dashboard/config/products`)
- **List** (`/dashboard/config/products`): View all products
- **Create** (`/dashboard/config/products/new`): Add new product
- **Edit** (`/dashboard/config/products/[id]`): Update product details

#### 4. **Die Mapping** (`/dashboard/config/die-mapping`)
- Map products to machines with die weight and production rates

#### 5. **Inventory** (`/dashboard/inventory`)
- **Stock View** (`/dashboard/inventory/stock`): View by state (tabs)
- **Raw Materials** (`/dashboard/inventory/raw-materials`): Manage raw materials
- **Stock Availability** (`/dashboard/sales/stock-availability`): Live sellable stock

#### 6. **Customers** (`/dashboard/sales/customers`)
- **List** (`/dashboard/sales/customers`): View all customers
- **Create** (`/dashboard/sales/customers/new`): Add new customer
- **Edit** (`/dashboard/sales/customers/[id]`): Update customer

#### 7. **Sales Orders** (`/dashboard/sales/orders`)
- **List** (`/dashboard/sales/orders`): View all orders
- **Create** (`/dashboard/sales/orders/new`): Create order (reserves stock)
- Order status management (reserve, deliver, cancel)

#### 8. **Settings** (`/dashboard/config/settings`)
- System configuration (thresholds, defaults)

#### 9. **Analytics** (`/dashboard/analytics`)
- Production analytics
- Inventory trends
- Sales insights

### Planned Structure (After Refactor)
Using route groups for clean URLs:

```
(auth)/
  /login

(protected)/
  /dashboard
  /machines
  /products
  /machine-mapping
  /inventory
  /sales
  /customers
  /reports
  /settings
```

---

## Authentication & Authorization

### User Roles
| Role | Permissions |
|------|-------------|
| **admin** | Full system access, user management, settings |
| **manager** | Production, inventory, sales management |
| **operator** | Production log submission only |

### JWT Token Structure
```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "role": "admin",
  "iat": 1705334400,
  "exp": 1705420800
}
```

### Protected Routes (Middleware)
**File**: `apps/web/middleware.ts` (planned)

```typescript
export function middleware(request: NextRequest) {
  const token = request.cookies.get('access_token');
  
  // Redirect to login if not authenticated
  if (!token && request.nextUrl.pathname.startsWith('/(protected)')) {
    return NextResponse.redirect('/login');
  }
  
  // Redirect to dashboard if already logged in
  if (token && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect('/dashboard');
  }
}
```

### Default Users
| Email | Password | Role |
|-------|----------|------|
| admin@paulandsons.com | admin123 | admin |
| manager@paulandsons.com | manager123 | manager |
| operator@paulandsons.com | operator123 | operator |

---

## Business Logic

### 23-Hour Production Rule
**Location**: `server/src/modules/production/production.service.ts`

```typescript
// Cannot submit production for same machine+product combo twice within 23 hours
const hoursSinceLastProduction = (now - lastProduction.created_at) / (1000 * 60 * 60);
if (hoursSinceLastProduction < 23) {
  throw new Error('Cannot submit production within 23 hours of last submission');
}
```

### Efficiency Calculation
**Formula**:
```
workingMinutes = (8 hours * 60) - downtime_minutes
expectedOutput = production_rate_per_hour * (workingMinutes / 60)
efficiency = (actual_quantity / expectedOutput) * 100
```

### Stock Reservation Flow
1. **Order Creation** → Stock moves `finished` → `reserved`
2. **Order Delivery** → Stock removed from `reserved` (sold)
3. **Order Cancellation** → Stock returns `reserved` → `finished`

---

## Deployment

### Development Setup

#### 1. **Clone Repository**
```bash
git clone <repo-url>
cd inventory-production-system
```

#### 2. **Install Dependencies**
```bash
# Server
cd server
npm install

# Web
cd ../apps/web
npm install
```

#### 3. **Configure Environment**
Create `server/.env` and `apps/web/.env.local` as shown in [Environment Setup](#environment-setup).

#### 4. **Run Development Servers**
```bash
# Terminal 1: Server
cd server
npm run dev  # Runs on http://localhost:4000

# Terminal 2: Web
cd apps/web
npm run dev  # Runs on http://localhost:3000
```

### Production Build

#### Server
```bash
cd server
npm run build
npm start
```

#### Web
```bash
cd apps/web
npm run build
npm start
```

---

## API Response Standards

### Success Response
```json
{
  "data": {...},
  "message": "Operation successful"
}
```

### Error Response
```json
{
  "error": "Error message",
  "details": "Additional context"
}
```

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

---

## Database Migrations

**Location**: `database/migrations/`

Run migrations in order:
1. `001_add_machine_type.sql`
2. `002_add_product_fields.sql`
3. `003_create_user_profiles.sql`
4. `004_add_rls_policies.sql`
5. `005_create_system_settings.sql`

**Execute via Supabase SQL Editor** or using Prisma/Drizzle migration tools.

---

## Support & Troubleshooting

### Common Issues

#### 1. **Port Already in Use**
```bash
# Kill process on port 4000 (server)
npx kill-port 4000

# Kill process on port 3000 (web)
npx kill-port 3000
```

#### 2. **Database Connection Failed**
- Verify `SUPABASE_URL` and `SUPABASE_KEY` in `.env`
- Check Supabase project status
- Ensure password is URL-encoded in `DATABASE_URL`

#### 3. **Authentication Failed**
- Check JWT token in localStorage (`access_token`)
- Verify user exists in `user_profiles` table
- Confirm `is_active = true`

---

## Future Enhancements

- [ ] Real-time inventory updates via WebSockets
- [ ] Advanced analytics dashboards
- [ ] Mobile app for operators
- [ ] Barcode scanning integration
- [ ] Automated low-stock alerts
- [ ] Multi-warehouse support
- [ ] Role-based UI customization

---

**Document Version**: 1.0  
**Last Updated**: January 15, 2026  
**Maintained By**: Development Team
