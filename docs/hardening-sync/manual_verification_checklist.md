# Manual Verification Checklist - Production Hardening

Perform these manual tests after the Production sync to ensure the systems are operating as expected.

## 1. Credit Limit Enforcement (Financial Safety)
Go to a Customer with a low credit limit (e.g., set to ₹1,000 for testing). Create a Sales Order for ₹10,000.
**Expected**: The order creation should be blocked by the database with "Insufficient credit limit".
Verify that increasing the limit or recording a payment allows subsequent orders.

## 2. Inter-Factory Transfer (Logistics Integrity)
Move 100 units of a product from Factory A to Factory B.
**Expected**: Stock in Factory A decreases by 100, Stock in Factory B increases by 100.
Transaction type "transfer" appears in the audit log for both factories.

## 3. Shipping & Balance Sync (Cash Flow Tracking)
Dispatch half of a ₹5,000 Sales Order (₹2,500).
**Expected**: The Customer's `balance_due` profile should increase by exactly ₹2,500.
Reserved stock for the remaining 50% should stay unchanged until the next dispatch.

## 4. Production RM Consumption (Wastage Audit)
Log a production run for 100 items (Ideal weight: 50g each) and enter a Measured weight of 52g.
**Expected**: Raw material deduction of 5.2kg (not 5.0kg).
Wastage log record of 0.2kg is created automatically.

## 5. Machine-Cap Mapping (Production Traceability)
Log a Cap Production entry using a specific Machine ID.
**Expected**: The record is saved correctly and associated with the machine ID for efficiency reporting.
Verify that cycle time calculations appear correctly in the production analytics.
