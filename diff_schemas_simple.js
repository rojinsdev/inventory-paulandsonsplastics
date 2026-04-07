const fs = require('fs');

function parseSqlOutput(filename) {
    const raw = fs.readFileSync(filename, 'utf-8');
    const match = raw.match(/\[{.*?}\]/); // Extract the array roughly, bypassing JSON string escape issues
    // Wait, let's just use regex to parse the table and column name out of the raw text
    const entries = [...raw.matchAll(/\\"table_name\\":\\"(.*?)\\",\\"column_name\\":\\"(.*?)\\",\\"data_type\\":\\"(.*?)\\"/g)];
    
    return entries.map(e => ({ table_name: e[1], column_name: e[2], data_type: e[3] }));
}

const prodCols = parseSqlOutput('C:/Users/Rojins/.gemini/antigravity/brain/980a3932-a819-4dae-8ee7-35b1f41d5e90/.system_generated/steps/58/output.txt');
const devCols = parseSqlOutput('C:/Users/Rojins/.gemini/antigravity/brain/980a3932-a819-4dae-8ee7-35b1f41d5e90/.system_generated/steps/59/output.txt');

const prodSet = new Set(prodCols.map(c => `${c.table_name}.${c.column_name}`));
const missingInProd = devCols.filter(c => !prodSet.has(`${c.table_name}.${c.column_name}`));

console.log("=== TABLES/COLUMNS MISSING IN PROD ===");
missingInProd.forEach(c => console.log(`- Table: ${c.table_name} | Column: ${c.column_name} (${c.data_type})`));
