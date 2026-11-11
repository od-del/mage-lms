import crypto from 'node:crypto';
import { createClient } from '@libsql/client';
import { SCHEMA, ADDED_COLUMNS } from './schema.js';

let client;
export function db() {
  if (!client) {
    if (!process.env.TURSO_DATABASE_URL) throw new Error('TURSO_DATABASE_URL belum diisi.');
    client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return client;
}

const rowsOf = rs => rs.rows.map(r => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])));

/* ---------- pembaruan skema otomatis ----------
   Database lama (v1) dinaikkan ke v2 saat permintaan pertama: tabel/kolom baru dibuat, materi
   dipindah ke perpustakaan (resource_links), dan master jabatan/outlet/mentor diisi dari data yang ada.
   Semua langkah aman dijalankan berulang dan bersamaan (ID tetap + INSERT OR IGNORE). */
export const slugId = (prefix, s) => prefix + '_' + (String(s).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'X')
  + '_' + crypto.createHash('sha1').update(String(s).toLowerCase()).digest('hex').slice(0, 4).toUpperCase();

export async function upgradeSchema() {
  const c = db();
  await c.batch(SCHEMA, 'write');
  for (const [table, col, def] of ADDED_COLUMNS) {
    const cols = rowsOf(await c.execute(`PRAGMA table_info(${table})`)).map(r => r.name);
    if (cols.includes(col)) continue;
    try { await c.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); }
    catch (e) { if (!/duplicate column/i.test(String(e.message))) throw e; }
  }
  // Materi lama yang menempel di aktivitas/stage/kurikulum → tautan perpustakaan.
  // Test dengan induk tidak ditautkan sendiri: ikut modul/SOP induknya.
  await c.batch([
    `INSERT OR IGNORE INTO resource_links (id, resource_id, activity_id, stage_id, curriculum_id, seq)
       SELECT 'RL_' || id, id, activity_id, CASE WHEN activity_id IS NULL THEN stage_id END,
              CASE WHEN activity_id IS NULL AND stage_id IS NULL THEN curriculum_id END, seq
       FROM resources WHERE parent_id IS NULL AND (activity_id IS NOT NULL OR stage_id IS NOT NULL OR curriculum_id IS NOT NULL)`,
    `UPDATE resources SET activity_id = NULL, stage_id = NULL, curriculum_id = NULL
       WHERE activity_id IS NOT NULL OR stage_id IS NOT NULL OR curriculum_id IS NOT NULL`,
    // Kolom "Jenis" dihapus dari form: materi yang dulu ditandai IT Support berganti format.
    `UPDATE resources SET kind = 'IT_SUPPORT' WHERE category = 'IT_TOOL' AND kind IN ('MODULE', 'SOP', 'VIDEO')`,
  ], 'write');
  const seeded = rowsOf(await c.execute("SELECT value FROM meta WHERE key = 'v2_masters'"));
  if (seeded.length) return;
  // Sekali saja: isi master jabatan, outlet, dan mentor dari data pengguna & pendaftaran yang ada.
  const users = rowsOf(await c.execute('SELECT job, outlet FROM users'));
  const ma = rowsOf(await c.execute('SELECT m.mentor_id, e.curriculum_id FROM mentor_assignments m JOIN enrollments e ON e.id = m.enrollment_id WHERE m.active = 1'));
  const uniq = list => [...new Map(list.map(x => String(x || '').trim()).filter(Boolean).map(x => [x.toLowerCase(), x])).values()];
  const byMentor = new Map();
  ma.forEach(r => byMentor.set(r.mentor_id, [...new Set([...(byMentor.get(r.mentor_id) || []), r.curriculum_id])]));
  await c.batch([
    ...uniq(users.map(u => u.job)).map(name => ({ sql: 'INSERT OR IGNORE INTO positions (id, name) VALUES (?, ?)', args: [slugId('POS', name), name] })),
    ...uniq(users.map(u => u.outlet)).map(name => ({ sql: 'INSERT OR IGNORE INTO outlets (id, name) VALUES (?, ?)', args: [slugId('OUT', name), name] })),
    ...[...byMentor].map(([id, curs]) => ({ sql: 'INSERT OR IGNORE INTO mentors (user_id, curricula) VALUES (?, ?)', args: [id, JSON.stringify(curs)] })),
    { sql: "INSERT OR IGNORE INTO meta (key, value) VALUES ('v2_masters', ?)", args: [new Date().toISOString()] },
  ], 'write');
}

let upgraded;
const ensureSchema = () => (upgraded ||= upgradeSchema().catch(e => { upgraded = null; throw e; }));

// Data LMS kecil (puluhan–ratusan peserta): semua tabel inti dibaca dalam SATU round trip,
// lalu logika berjalan di memori — sama seperti webDb_() di versi Apps Script.
export const TABLES = ['users', 'curricula', 'stages', 'activities', 'resources', 'resource_links', 'quiz_questions',
  'enrollments', 'mentor_assignments', 'assignments', 'certificates', 'positions', 'outlets', 'mentors'];

export async function loadAll(extra = []) {
  await ensureSchema();
  const stmts = TABLES.map(t => `SELECT * FROM ${t}`).concat(extra);
  const rs = await db().batch(stmts, 'read');
  const out = {};
  TABLES.forEach((t, i) => { out[t] = rowsOf(rs[i]); });
  out.extra = rs.slice(TABLES.length).map(rowsOf);
  return out;
}

export async function query(sql, args = []) {
  return rowsOf(await db().execute({ sql, args }));
}

// Semua perubahan satu aksi ditulis dalam satu transaksi.
export async function write(stmts) {
  const list = stmts.filter(Boolean);
  if (list.length) await db().batch(list, 'write');
}

export function upsert(table, obj) {
  const cols = Object.keys(obj);
  return {
    sql: `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
          ON CONFLICT(id) DO UPDATE SET ${cols.filter(c => c !== 'id').map(c => `${c} = excluded.${c}`).join(', ')}`,
    args: cols.map(c => obj[c] === undefined ? null : obj[c]),
  };
}

export function insert(table, obj) {
  const cols = Object.keys(obj);
  return { sql: `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, args: cols.map(c => obj[c] ?? null) };
}

export function update(table, id, fields) {
  const cols = Object.keys(fields);
  return { sql: `UPDATE ${table} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`, args: cols.map(c => fields[c] ?? null).concat([id]) };
}

export function audit(actor, action, target = '', detail = '') {
  return insert('audit_log', { actor, action, target: String(target), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
}
