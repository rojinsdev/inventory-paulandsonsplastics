const fs = require('fs');

function parseSqlOutput(filename) {
    const raw = fs.readFileSync(filename, 'utf-8');
    const entries = [...raw.matchAll(/\\"table_name\\":\\"(.*?)\\",\\"column_name\\":\\"(.*?)\\",\\"data_type\\":\\"(.*?)\\"/g)];
    return entries.map(e => ({ table_name: e[1], column_name: e[2], data_type: e[3] }));
}

const prodCols = parseSqlOutput('C:/Users/Rojins/.gemini/antigravity/brain/980a3932-a819-4dae-8ee7-35b1f41d5e90/.system_generated/steps/58/output.txt');
const devCols = parseSqlOutput('C:/Users/Rojins/.gemini/antigravity/brain/980a3932-a819-4dae-8ee7-35b1f41d5e90/.system_generated/steps/59/output.txt');

const prodTables = new Set(prodCols.map(c => c.table_name));
const devTables = new Set(devCols.map(c => c.table_name));

const missingTables = [...devTables].filter(t => !prodTables.has(t));

console.log("=== TABLES ENTIRELY MISSING IN PROD ===");
missingTables.forEach(t => console.log(`- ${t}`));
