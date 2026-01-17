# Database Migration Guide

## Prerequisites

Before running migrations, ensure you have:
1. ✅ Supabase project access
2. ✅ Database credentials (already in `server/.env`)
3. ✅ Backup or snapshot (recommended)

---

## Migration Scripts

Two migration files are ready:
- `database/migrations/001_add_machine_type.sql`
- `database/migrations/002_add_product_fields.sql`

---

## Method 1: Using Supabase Dashboard (Recommended)

### Step 1: Login to Supabase
1.Go to https://supabase.com/dashboard
2. Select your project: `gncbejlrycumifdhucqr`

### Step 2: Open SQL Editor
1. Click on "SQL Editor" in the left sidebar
2. Click "New query"

### Step 3: Execute Migrations

**First Migration - Add Machine Type:**
```sql
-- Copy and paste from: database/migrations/001_add_machine_type.sql
ALTER TABLE machines 
ADD COLUMN IF NOT EXISTS type TEXT 
CHECK (type IN ('extruder', 'cutting', 'printing', 'packing')) 
NOT NULL DEFAULT 'extruder';

COMMENT ON COLUMN machines.type IS 'Type of machine (extruder, cutting, printing, packing)';
```

Click **Run** → Verify success

**Second Migration - Add Product Fields:**
```sql
-- Copy and paste from: database/migrations/002_add_product_fields.sql
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS sku TEXT UNIQUE;

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS selling_price NUMERIC(10,2);

COMMENT ON COLUMN products.sku IS 'Stock Keeping Unit - unique product identifier';
COMMENT ON COLUMN products.selling_price IS 'Selling price per item in INR';
```

Click **Run** → Verify success

### Step 4: Verify Changes

Run this query to confirm:
```sql
-- Check machines table
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'machines';

-- Check products table
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'products';
```

**Expected Results:**
- `machines` table should show `type` column
- `products` table should show `sku` and `selling_price` columns

---

## Method 2: Using psql CLI (Alternative)

If you prefer command-line:

```bash
# Connect to Supabase database
psql "postgresql://postgres.gncbejlrycumifdhucqr:paul&sons@123@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"

# Run migration 1
\i database/migrations/001_add_machine_type.sql

# Run migration 2
\i database/migrations/002_add_product_fields.sql

# Verify
\d machines
\d products
```

---

## Post-Migration Steps

After successful migrations:

1. ✅ **Restart the server:**
   ```bash
   # Server will automatically pick up new schema
   # (already running with nodemon - will auto-restart)
   ```

2. ✅ **Test web app:**
   - Create a new machine → should include Type dropdown
   - Create a new product → should include SKU and Selling Price fields

3. ✅ **Update existing records (optional):**
   ```sql
   -- Set proper machine types if known
   UPDATE machines SET type = 'cutting' WHERE name LIKE '%Cut%';
   UPDATE machines SET type = 'printing' WHERE name LIKE '%Print%';
   -- etc.
   ```

---

## Rollback (If Needed)

If something goes wrong:

```sql
-- Rollback machine type
ALTER TABLE machines DROP COLUMN IF EXISTS type;

-- Rollback product fields
ALTER TABLE products DROP COLUMN IF EXISTS sku;
ALTER TABLE products DROP COLUMN IF EXISTS selling_price;
```

---

## Status Checklist

- [ ] Logged into Supabase Dashboard
- [ ] Executed migration 001 (machine type)
- [ ] Executed migration 002 (product fields)
- [ ] Verified schema changes
- [ ] Tested creating a machine via web app
- [ ] Tested creating a product via web app

Once complete, the database schema will be fully aligned with the API contracts!
