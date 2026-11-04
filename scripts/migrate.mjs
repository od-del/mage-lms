// Membuat tabel di database Turso (aman dijalankan berulang).
import { db } from '../lib/db.js';
import { SCHEMA } from '../lib/schema.js';

await db().batch(SCHEMA, 'write');
const rs = await db().execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
console.log('Tabel siap:', rs.rows.map(r => r[0]).join(', '));
