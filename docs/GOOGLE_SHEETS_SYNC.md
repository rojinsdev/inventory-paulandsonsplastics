# Google Sheets mirror (live sync)

The API server can append rows to a Google Spreadsheet when business events occur. This gives a **human-readable mirror** of sales, purchases, customer payments, cash-flow lines, and daily snapshots of customer/supplier balances.

## This is not your primary backup

- **Google Sheets** can be edited accidentally, has API quotas, and may lag or miss events if the server is down.
- For disaster recovery, use **Supabase automated backups** and **Point-in-Time Recovery (PITR)** on production, plus optional logical exports (`pg_dump`).

Treat Sheets as an **auxiliary** operational copy, not a replacement for database backups.

## Google Cloud setup (one-time)

1. In [Google Cloud Console](https://console.cloud.google.com/), create or pick a project.
2. Enable **Google Sheets API** (APIs & Services → Library).
3. Create a **service account** (IAM → Service Accounts → Create). Grant no optional roles required for Sheets beyond API access.
4. Create a **JSON key** for that service account and download it.
5. Create a **Google Spreadsheet**. Share it with the service account **email** (looks like `something@project-id.iam.gserviceaccount.com`) with **Editor** access.
6. In the spreadsheet, add **tabs** with these **exact names** (see [`server/src/modules/integrations/google-sheets.constants.ts`](../server/src/modules/integrations/google-sheets.constants.ts)):

| Tab name | Suggested row 1 headers |
|----------|-------------------------|
| `Sales_orders` | `timestamp_utc` \| `event` \| `order_id` \| `customer_id` \| `total_or_amount` \| `detail` \| `extra` \| `user_id` |
| `Sales_dispatch_lines` | `timestamp_utc` \| `dispatch_id` \| `order_id` \| `customer_id` \| `item_id` \| `quantity` \| `unit_price` \| `line_total` \| `payment_mode` \| `order_status` \| `user_id` |
| `Customer_payments` | `timestamp_utc` \| `payment_id` \| `order_id` \| `customer_id` \| `amount` \| `payment_mode` \| `factory_id` \| `user_id` |
| `Customers_snapshot` | `snapshot_at_utc` \| `customer_id` \| `name` \| `balance_due` \| `credit_limit` |
| `Purchases` | `timestamp_utc` \| `event` \| `purchase_id` **or** `payment_id` (supplier_payment rows) \| `supplier_id` \| `total_amount` \| `paid_or_amount` \| `item_type_or_empty` \| `factory_id` \| `user_id` \| `notes` |
| `Suppliers_snapshot` | `snapshot_at_utc` \| `supplier_id` \| `name` \| `balance_due` \| `credit_limit` |
| `Cash_flow` | `timestamp_utc` \| `log_id` \| `date` \| `category_id` \| `category_name` \| `factory_id` \| `amount` \| `payment_mode` \| `reference_id` \| `notes` \| `is_automatic` |

Headers are **your** documentation aid; the app only **appends** data rows.

## Server environment variables

| Variable | Description |
|----------|-------------|
| `SHEETS_SYNC_ENABLED` | `true` or `1` to turn on sync. Default off if unset. |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | From the spreadsheet URL: `.../d/<SPREADSHEET_ID>/edit` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | **Optional:** entire service account JSON as a **single-line** string (escape newlines in `private_key` as `\n`). |
| `GOOGLE_SERVICE_ACCOUNT_PATH` | **Optional:** absolute path to the JSON key file on the server (preferred on EC2). |
| `SHEETS_SNAPSHOT_CRON` | **Optional:** cron expression for daily customer/supplier snapshots (default `15 2 * * *` — 02:15 server local time). |

Provide **either** `GOOGLE_SERVICE_ACCOUNT_JSON` **or** `GOOGLE_SERVICE_ACCOUNT_PATH`, not both required.

## Behaviour

- **Event bus** drives most rows: order created / status / prepared, customer payments, purchases, purchase payments, dispatch batches (including credit-only), and each `cash_flow_logs` insert (including shared splits and transfers).
- **Cron** appends `Customers_snapshot` and `Suppliers_snapshot` on the schedule above.
- Failures to append are **logged** only; they do **not** fail API requests.

## Optional: Supabase Database Webhooks

If you later add writes that **bypass** the Node server (e.g. mobile → Supabase RPC only), consider Supabase **Database Webhooks** on `dispatch_records` or `cash_flow_logs` to hit a small HTTPS worker that appends to Sheets. The current codebase uses **Node-emitted events** for dispatch after `process_partial_dispatch` to avoid that gap for server-mediated deliveries.

## Supabase backups (production)

In the Supabase dashboard: **Project Settings → Database** — enable **daily backups** and, on paid tiers, **PITR** for point-in-time restore. Document your RPO/RTO for the business separately.
