const fs = require('fs');

const lines = fs.readFileSync('server/migrations/20260407_sync_prod.sql', 'utf-8').split('\n');

const part1 = lines.slice(0, 500).join('\n');
const part2 = lines.slice(500).join('\n');

fs.writeFileSync('server/migrations/20260407_sync_prod_part1.sql', part1);
fs.writeFileSync('server/migrations/20260407_sync_prod_part2.sql', part2);
