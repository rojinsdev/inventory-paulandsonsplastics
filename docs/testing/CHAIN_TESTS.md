# 🧪 Chain Tests Documentation

Chain tests are end-to-end integration scripts designed to verify complex, multi-step business workflows in the Paul & Sons Inventory system. They ensure that atomic database operations, inventory balancing, and status transitions work correctly across different modules.

## 1. Available Chain Tests

### 🏭 Full Production Chain Test
**File**: `server/src/scripts/full-production-chain-test.ts`

Verifies the transformation of raw materials into finished products:
1. **Setup**: Creates temporary test templates and variants for caps/products.
2. **RM Deduction**: Deducts raw material stock (e.g., PP Granules).
3. **Inventory Addition**: Adds to semi-finished or packed stock balances.
4. **Balancing**: Verifies that the correct amount of cap and inner inventory is deducted during the packing step.
5. **Traceability**: Ensures production logs and audit trails are created.

### 📦 Sales Fulfillment Chain Test
**File**: `server/src/scripts/sales-fulfillment-chain-test.ts`

Verifies the strictly manual, PM-controlled fulfillment workflow:
1. **Order Creation**: Creates an order with both in-stock and backordered items.
2. **Backorder Management**: Ensures demand signals (production requests) are generated for out-of-stock items.
3. **Production Signal**: Updates a production request to `prepared` status (The Signal).
4. **Manual Reservation**: The PM clicks "Reserve & Forward to Dispatch" to move stock from `finished` to `reserved` (The Action).
5. **Partial/Full Dispatch**: Verifies stock deduction from `reserved` and final order status updates.

## 2. How to Run

Tests must be run from the `server` directory using `ts-node`.

### Command for Sales Fulfillment
```bash
cd server
node --dns-result-order=ipv4first -r ts-node/register src/scripts/sales-fulfillment-chain-test.ts
```

### Command for Full Production
```bash
cd server
node --dns-result-order=ipv4first -r ts-node/register src/scripts/full-production-chain-test.ts
```

> [!NOTE]
> The `--dns-result-order=ipv4first` flag is required if you are running against a local Supabase instance or if your environment has IPv6/IPv4 resolution conflicts.

## 3. What these tests catch
- **RPC Ambiguity**: Ensures functions like `adjust_cap_stock` don't have overloaded signatures.
- **Transactional Integrity**: Verifies that if one part of a multi-step process fails, the whole chain remains consistent.
- **Status Constraints**: Ensures orders don't move to `delivered` unless all items are correctly dispatched.
- **Negative Stock**: Catches violations of the negative stock constraints during automated inventory adjustments.

## 4. Best Practices for Adding Tests
- **Self-Cleaning**: Always use `finally` blocks to delete your test entities (orders, variants, templates) even if the test fails.
- **Unique Identifiers**: Append timestamps or UUIDs to test names (e.g., `Chain-Test-Cap-1712165000`) to avoid unique constraint violations in the database.
- **Logging**: Use descriptive log prefixes like `✅` for success and `💥` for failure to make terminal results scannable.
