import { createClient } from '@libsql/client';

let client;
export function db() {
  if (!client) {
    if (!process.env.TURSO_DATABASE_URL) throw new Error('TURSO_DATABASE_URL belum diisi.');
    client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return client;
}

const rowsOf = rs => rs.rows.map(r => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])));

// Data LMS kecil (puluhan–ratusan peserta): semua tabel inti dibaca dalam SATU round trip,
// lalu logika berjalan di memori — sama seperti webDb_() di versi Apps Script.
export const TABLES = ['users', 'curricula', 'stages', 'activities', 'resources', 'quiz_questions',
  'enrollments', 'mentor_assignments', 'assignments', 'certificates'];

export async function loadAll(extra = []) {
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
