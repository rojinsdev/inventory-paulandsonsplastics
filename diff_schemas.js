const fs = require('fs');

function parseSqlOutput(filename) {
    const raw = fs.readFileSync(filename, 'utf-8');
    const startIdx = raw.indexOf('[');
    const endIdx = raw.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1) {
        return JSON.parse(raw.substring(startIdx, endIdx + 1));
    }
    return [];
}

const prodCols = parseSqlOutput('C:/Users/Rojins/.gemini/antigravity/brain/980a3932-a819-4dae-8ee7-35b1f41d5e90/.system_generated/steps/58/output.txt');
const devCols = parseSqlOutput('C:/Users/Rojins/.gemini/antigravity/brain/980a3932-a819-4dae-8ee7-35b1f41d5e90/.system_generated/steps/59/output.txt');

const prodSet = new Set(prodCols.map(c => `${c.table_name}.${c.column_name}`));
const devSet = new Set(devCols.map(c => `${c.table_name}.${c.column_name}`));

const missingInProd = devCols.filter(c => !prodSet.has(`${c.table_name}.${c.column_name}`));
const missingInDev = prodCols.filter(c => !devSet.has(`${c.table_name}.${c.column_name}`));

console.log("=== MISSING IN PROD (Found in Dev but not in Prod) ===");
missingInProd.forEach(c => console.log(`${c.table_name}.${c.column_name} (${c.data_type})`));

console.log("\n=== EXTRA IN PROD (Found in Prod but not in Dev) ===");
missingInDev.forEach(c => console.log(`${c.table_name}.${c.column_name} (${c.data_type})`));
