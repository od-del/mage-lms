// Membuat/menaikkan skema database Turso (aman dijalankan berulang).
// Aplikasi juga menjalankan ini otomatis saat permintaan pertama.
import { db, upgradeSchema } from '../lib/db.js';

await upgradeSchema();
const rs = await db().execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
console.log('Tabel siap:', rs.rows.map(r => r[0]).join(', '));
