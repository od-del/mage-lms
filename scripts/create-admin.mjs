// Membuat akun Super Admin pertama di database baru (tanpa data contoh).
//   npm run db:create-admin -- --id SA001 --name "Nama Lengkap" --email nama@magepos.co.id [--job "HR Manager"] [--outlet Pusat]
// Tabel dibuat otomatis kalau belum ada (sama seperti db:migrate).
// Password sementara hanya ditampilkan sekali di terminal — tidak disimpan ke file.
import { parseArgs } from 'node:util';
import { db, insert, audit, write, upgradeSchema } from '../lib/db.js';
import { hashPassword, tempPassword } from '../lib/password.js';

const { values: a } = parseArgs({
  options: {
    id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' },
    job: { type: 'string', default: '' }, outlet: { type: 'string', default: '' },
  },
});

const die = msg => { console.error('✗ ' + msg); process.exit(1); };
const id = (a.id || '').trim();
const name = (a.name || '').trim();
const email = (a.email || '').trim().toLowerCase();
if (!id || !name || !email) die('Wajib: --id <ID karyawan> --name "<nama>" --email <email>');
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) die('Email tidak valid: ' + email);

await upgradeSchema();

const taken = (await db().execute({
  sql: 'SELECT id, email FROM users WHERE id = ? COLLATE NOCASE OR email = ? COLLATE NOCASE',
  args: [id, email],
})).rows;
if (taken.length) die(`ID atau email sudah dipakai (${taken.map(r => r[0] + ' / ' + r[1]).join(', ')}). Reset password lewat menu Pengguna.`);

const dbName = (process.env.TURSO_DATABASE_URL || '').replace(/^libsql:\/\//, '').split('.')[0];
const pw = tempPassword();
await write([
  insert('users', { id, name, email, job: a.job.trim(), outlet: a.outlet.trim(), role: 'SUPER_ADMIN', active: 1, password_hash: hashPassword(pw) }),
  audit('cli', 'USER_SAVE', id, 'SUPER_ADMIN'),
]);

console.log(`✓ Super Admin dibuat di database "${dbName}"`);
console.log(`  Email            : ${email}`);
console.log(`  Password sementara: ${pw}`);
console.log('  Simpan sekarang — tidak ditampilkan lagi. Setelah login, ganti password di aplikasi.');
