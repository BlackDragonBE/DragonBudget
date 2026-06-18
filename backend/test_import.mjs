import { readFileSync } from 'node:fs';

const csv = readFileSync('T:/Scripts/nodejs/DragonBudget/csv_exports/data.csv');
const form = new FormData();
form.append('file', new Blob([csv], { type: 'text/csv' }), 'data.csv');

const r = await fetch('http://localhost:3000/api/import', { method: 'POST', body: form });
console.log('Status:', r.status);
console.log('Body:', await r.text());
