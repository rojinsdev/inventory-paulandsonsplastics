/**
 * Apply pending prod sync migrations (same SQL as server/migrations/*.sql).
 * Uses PROD_DATABASE_URL, or DIRECT_URL from server/.env (via dotenv).
 *
 * Usage from server/:
 *   node scripts/apply-migrations-prod-202604.mjs
 */
import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const FILES = [
  ['fix_inner_id_stock_filter', '202604092100_fix_inner_id_stock_filter.sql'],
  ['fix_inner_id_resolution_fallback', '202604092200_fix_inner_id_resolution_fallback.sql'],
  ['fix_process_partial_dispatch_signature', '202604092300_fix_process_partial_dispatch_signature.sql'],
  ['stabilize_create_order_atomic', '202604100000_stabilize_create_order_atomic.sql'],
  ['stabilize_prepare_order_items', '202604100001_stabilize_prepare_order_items.sql'],
  ['add_system_validation_functions', '202604100003_add_system_validation_functions.sql'],
  ['add_error_logging_system', '202604100004_add_error_logging_system.sql'],
  ['add_get_system_health_summary_rpc', '202604102008_add_get_system_health_summary_rpc.sql'],
  ['fix_adjust_stock_overload_ambiguity', '202604102250_fix_adjust_stock_overload_ambiguity.sql'],
  ['fix_adjust_stock_update_first', '202604102320_fix_adjust_stock_update_first.sql'],
  ['repair_adjust_stock_after_102250_reapplied', '202604111200_repair_adjust_stock_after_102250_reapplied.sql'],
  ['ensure_adjust_cap_inner_stock_rpc', '202604111230_ensure_adjust_cap_inner_stock_rpc.sql'],
];

const DEV_VERSIONS = {
  fix_inner_id_stock_filter: '20260409144745',
  fix_inner_id_resolution_fallback: '20260409145427',
  fix_process_partial_dispatch_signature: '20260409145813',
  stabilize_create_order_atomic: '20260410142310',
  stabilize_prepare_order_items: '20260410142353',
  add_system_validation_functions: '20260410142513',
  add_error_logging_system: '20260410142542',
  add_get_system_health_summary_rpc: '20260410144017',
  fix_adjust_stock_overload_ambiguity: '20260410172221',
  fix_adjust_stock_update_first: '20260410173122',
  repair_adjust_stock_after_102250_reapplied: '20260410174117',
  ensure_adjust_cap_inner_stock_rpc: '20260410174605',
};

const url = process.env.PROD_DATABASE_URL || process.env.DIRECT_URL;
if (!url) {
  console.error('Set PROD_DATABASE_URL or DIRECT_URL (e.g. in server/.env).');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
});
await client.connect();

for (const [name, file] of FILES) {
  const full = path.join(root, 'migrations', file);
  const sql = fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
  const version = DEV_VERSIONS[name];
  if (!version) throw new Error(`Missing version mapping for ${name}`);

  const byVersion = await client.query(
    'SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1',
    [version]
  );
  if (byVersion.rowCount > 0) {
    console.log(`Skip (version exists): ${version} ${name}`);
    continue;
  }

  const byName = await client.query(
    'SELECT version FROM supabase_migrations.schema_migrations WHERE name = $1',
    [name]
  );
  if (byName.rowCount > 0) {
    const prev = byName.rows[0].version;
    if (prev !== version) {
      await client.query(
        'UPDATE supabase_migrations.schema_migrations SET version = $1 WHERE name = $2',
        [version, name]
      );
      console.log(`Aligned version ${prev} -> ${version} for ${name}`);
    } else {
      console.log(`Skip (name exists, version ok): ${name}`);
    }
    continue;
  }

  console.log(`Applying ${file} ...`);
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
       VALUES ($1, $2, $3::text[])`,
      [version, name, [sql]]
    );
    await client.query('COMMIT');
    console.log(`OK: ${version} ${name}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`FAILED: ${name}`, e.message);
    process.exit(1);
  }
}

await client.end();
console.log('Done.');
