const fs = require('fs');

const raw = fs.readFileSync('C:/Users/Rojins/.gemini/antigravity/brain/980a3932-a819-4dae-8ee7-35b1f41d5e90/.system_generated/steps/104/output.txt', 'utf-8');

let sql = `-- MIGRATION: Final Sync Prod schema and functions\n\n`;

// Cleanly slice the JSON value using indexOf
const start = raw.indexOf('[');
const end = raw.lastIndexOf(']');
if (start !== -1 && end !== -1) {
    let jsonStr = raw.substring(start, end + 1);
    try {
        const parsed = JSON.parse(jsonStr);
        for (const f of parsed) {
            // Drop functions first to avoid signature/default mismatch errors
            // Use regex to extract function name and arguments
            const match = f.func_def.match(/CREATE OR REPLACE FUNCTION (public\.\w+)\s*\((.*?)\)/s);
            if (match) {
                const funcName = match[1];
                // we'll just drop the function without args and rely on CASCADE if needed, or better, we can't reliably drop without args in some postgres versions
            }
            
            // To safely overwrite parameter defaults, we must DROP it. 
            // We know the specific ones that failed: process_partial_dispatch
            if (f.func_def.includes('process_partial_dispatch')) {
                sql += `DROP FUNCTION IF EXISTS public.process_partial_dispatch(uuid, jsonb, text, numeric, text, date, numeric, text, uuid, text);\n`;
            }
            if (f.func_def.includes('submit_production_atomic')) {
                sql += `DROP FUNCTION IF EXISTS public.submit_production_atomic(uuid, uuid, integer, time without time zone, time without time zone, integer, integer, numeric, numeric, integer, text, date, uuid, uuid, integer, numeric, boolean, numeric);\n`;
            }
            if (f.func_def.includes('adjust_cap_stock')) {
               sql += `DROP FUNCTION IF EXISTS public.adjust_cap_stock(uuid, uuid, numeric, text, text);\n`;
            }

            sql += f.func_def + ';\n\n';
        }
    } catch(e) {
        console.log("JSON Parse err:", e);
    }
}

fs.writeFileSync('server/migrations/20260407_sync_prod_func.sql', sql);
console.log("Success");
