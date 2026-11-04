// Mengisi data contoh. Password acak ditulis ke .seed-credentials.txt (tidak ikut git).
//   npm run db:seed            → hanya jika database masih kosong
//   npm run db:seed -- --reset → hapus semua data lalu isi ulang
import fs from 'node:fs';
import { db, loadAll, insert, write } from '../lib/db.js';
import { SCHEMA } from '../lib/schema.js';
import { hashPassword, tempPassword } from '../lib/password.js';
import { recompute } from '../lib/lms.js';

const reset = process.argv.includes('--reset');
await db().batch(SCHEMA, 'write');
const [{ n }] = (await db().execute('SELECT COUNT(*) AS n FROM users')).rows.map(r => ({ n: r[0] }));
if (n > 0 && !reset) { console.log('Database sudah berisi data. Pakai --reset untuk mengisi ulang.'); process.exit(0); }
if (reset) await db().batch(['quiz_attempts', 'certificates', 'assignments', 'mentor_assignments', 'enrollments', 'quiz_questions', 'resources', 'activities', 'stages', 'curricula', 'audit_log', 'users'].map(t => 'DELETE FROM ' + t), 'write');

const creds = [];
const user = (id, name, email, job, outlet, role = '') => {
  const pw = tempPassword();
  creds.push(`${role || 'USER'}\t${email}\t${pw}`);
  return { id, name, email, job, outlet, role, active: 1, password_hash: hashPassword(pw) };
};
const users = [
  user('SA001', 'Super Admin', 'admin@mage-lms.local', 'LMS Owner', 'Pusat', 'SUPER_ADMIN'),
  user('HR001', 'Hana HR', 'hr@mage-lms.local', 'HR Officer', 'Pusat', 'ADMIN'),
  user('M001', 'Mira Mentor', 'mira@mage-lms.local', 'Head Bar', 'Kemang'),
  user('M002', 'Andi Pratama', 'andi@mage-lms.local', 'Bar Lead', 'Senopati'),
  user('SO20003', 'Sari Wulandari', 'sari@mage-lms.local', 'Barista', 'Kemang'),
  user('SO20011', 'Budi Santoso', 'budi@mage-lms.local', 'Barista', 'Senopati'),
  user('SO20019', 'Rina Kartika', 'rina@mage-lms.local', 'Server', 'Kemang'),
];

const curricula = [
  { id: 'C1', name: 'Barista Dasar', description: 'Kurikulum dasar barista: orientasi, espresso, dan latte art.', active: 1 },
  { id: 'C2', name: 'Service Excellence', description: 'Standar pelayanan tamu untuk server.', active: 1 },
];
const stages = [
  { id: 'ST1', curriculum_id: 'C1', name: 'Orientasi', seq: 1, active: 1 },
  { id: 'ST2', curriculum_id: 'C1', name: 'Espresso Basic', seq: 2, active: 1 },
  { id: 'ST3', curriculum_id: 'C1', name: 'Latte Art', seq: 3, active: 1 },
  { id: 'SV1', curriculum_id: 'C2', name: 'Orientasi Servis', seq: 1, active: 1 },
];
const act = (id, stage_id, seq, name, rule, extra = {}) => ({ id, stage_id, parent_id: null, name, seq, rule, required_for_stage: 1, required_for_parent: 1,
  pre_required: 0, post_required: 0, passing_score: 70, prerequisite_id: null, due_days: null, active: 1, ...extra });
const activities = [
  act('A1', 'ST1', 1, 'Pengenalan Outlet', 'ALL_REQUIRED_CHILDREN'),
  act('A1a', 'ST1', 1, 'Tur dapur & bar', 'SELF_CONFIRMED', { parent_id: 'A1', required_for_stage: 0 }),
  act('A1b', 'ST1', 2, 'Kenalan dengan tim outlet', 'SELF_CONFIRMED', { parent_id: 'A1', required_for_stage: 0 }),
  act('A2', 'ST1', 2, 'Kuis K3 & Higiene', 'PRE_SUBMITTED_AND_POST_PASSED', { pre_required: 1, post_required: 1 }),
  act('B1', 'ST2', 1, 'Teori Espresso', 'ACKNOWLEDGED', { post_required: 1 }),
  act('B2', 'ST2', 2, 'Kalibrasi grinder', 'SELF_CONFIRMED', { due_days: 7 }),
  act('B3', 'ST2', 3, 'Praktik espresso dengan mentor', 'MENTOR_PASSED'),
  act('L1', 'ST3', 1, 'Steaming susu', 'MENTOR_PASSED'),
  act('L2', 'ST3', 2, 'Latte art dasar (heart & tulip)', 'MENTOR_PASSED'),
  act('G1', 'SV1', 1, 'Standar greeting tamu', 'ACKNOWLEDGED'),
  act('G2', 'SV1', 2, 'Praktik melayani tamu', 'MENTOR_PASSED'),
];
const res = (id, kind, title, url, loc, seq = 1) => ({ id, kind, title, url, activity_id: null, stage_id: null, curriculum_id: null, parent_id: null, seq, active: 1, ...loc });
const resources = [
  res('R_OUTLET', 'MODULE', 'Modul Pengenalan Outlet', 'https://www.example.com/modul/pengenalan-outlet', { activity_id: 'A1' }),
  res('R_TUR', 'VIDEO', 'Video tur outlet', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', { activity_id: 'A1a' }),
  res('R_K3', 'MODULE', 'Materi K3 & Higiene', 'https://www.example.com/modul/k3-higiene', { activity_id: 'A2' }),
  res('R_K3_PRE', 'PRE_TEST', 'Pre-test K3', '', { activity_id: 'A2', parent_id: 'R_K3' }, 0),
  res('R_K3_POST', 'POST_TEST', 'Post-test K3', '', { activity_id: 'A2', parent_id: 'R_K3' }, 2),
  res('R_ESP', 'MODULE', 'Modul Teori Espresso', 'https://www.example.com/modul/teori-espresso', { activity_id: 'B1' }),
  res('R_ESP_POST', 'POST_TEST', 'Post-test Espresso', '', { activity_id: 'B1', parent_id: 'R_ESP' }, 2),
  res('R_GRINDER', 'SOP', 'SOP Kalibrasi Grinder', 'https://www.example.com/sop/kalibrasi-grinder', { activity_id: 'B2' }),
  res('R_EKSTRAKSI', 'VIDEO', 'Video teknik ekstraksi', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', { activity_id: 'B3' }),
  res('R_LATTE', 'MODULE', 'Modul Latte Art', 'https://www.example.com/modul/latte-art', { stage_id: 'ST3' }),
  res('R_SOP_BUKA', 'SOP', 'SOP Pembukaan Outlet', 'https://www.example.com/sop/pembukaan-outlet', { curriculum_id: 'C1' }),
  res('R_SOP_K3L', 'SOP', 'SOP K3L Umum', 'https://www.example.com/sop/k3l-umum', {}),
  res('R_GREET', 'SOP', 'SOP Greeting Tamu', 'https://www.example.com/sop/greeting', { activity_id: 'G1' }),
];
const q = (resource_id, seq, question, options, answer) => ({ id: `Q_${resource_id}_${seq}`, resource_id, seq, question, options: JSON.stringify(options), answer });
const k3 = [
  ['Kapan tangan wajib dicuci?', ['Hanya sebelum pulang', 'Sebelum menyentuh makanan & setelah dari toilet', 'Saat terlihat kotor saja', 'Tidak perlu jika memakai sarung tangan'], 1],
  ['Suhu aman penyimpanan susu segar di kulkas adalah…', ['0–4 °C', '8–12 °C', '15–20 °C', 'Suhu ruang'], 0],
  ['Lantai bar basah. Apa tindakan pertama?', ['Biarkan kering sendiri', 'Pasang tanda lantai basah lalu keringkan', 'Lanjut bekerja hati-hati', 'Lapor saat tutup outlet'], 1],
  ['APAR digunakan untuk…', ['Membersihkan mesin', 'Memadamkan api awal', 'Mendinginkan ruangan', 'Menyemprot hama'], 1],
];
const esp = [
  ['Rasio espresso standar (dose : yield) adalah sekitar…', ['1 : 1', '1 : 2', '1 : 5', '1 : 10'], 1],
  ['Waktu ekstraksi espresso yang ideal kira-kira…', ['5–10 detik', '25–30 detik', '60 detik', '2 menit'], 1],
  ['Espresso terasa asam dan encer. Penyebab paling mungkin?', ['Gilingan terlalu kasar', 'Gilingan terlalu halus', 'Tamping terlalu kuat', 'Air terlalu panas'], 0],
];
const questions = [
  ...k3.map((x, i) => q('R_K3_PRE', i + 1, ...x)),
  ...k3.map((x, i) => q('R_K3_POST', i + 1, ...x)),
  ...esp.map((x, i) => q('R_ESP_POST', i + 1, ...x)),
];

await write([...users, ...curricula, ...stages, ...activities, ...resources, ...questions].map(row => insert(
  users.includes(row) ? 'users' : curricula.includes(row) ? 'curricula' : stages.includes(row) ? 'stages' : activities.includes(row) ? 'activities' : resources.includes(row) ? 'resources' : 'quiz_questions', row)));

// Pendaftaran contoh + simulasi progres memakai mesin LMS yang sama dengan aplikasi.
const d = await loadAll();
const stmts = [];
const enroll = (userId, curId, mentorId, daysAgo) => {
  const e = { id: `ENR_${userId}_${curId}`, user_id: userId, curriculum_id: curId, status: 'Active', start_date: new Date(Date.now() - daysAgo * 864e5).toISOString(), finished_at: null };
  d.enrollments.push(e); stmts.push(insert('enrollments', e));
  const m = { id: `MA_${e.id}`, enrollment_id: e.id, mentor_id: mentorId, active: 1, created_at: e.start_date };
  d.mentor_assignments.push(m); stmts.push(insert('mentor_assignments', m));
  return e;
};
const pending = []; // perubahan tugas ditulis setelah semua tugas dibuat
const progress = (e, actId, fields, ago = 1) => {
  const a = d.assignments.find(x => x.enrollment_id === e.id && x.activity_id === actId);
  Object.assign(a, fields, { evidence_at: fields.evidence_at === undefined ? a.evidence_at : fields.evidence_at });
  if (fields.pre_score !== undefined) a.pre_at = new Date(Date.now() - ago * 864e5).toISOString();
  if (fields.post_score !== undefined) a.post_at = new Date(Date.now() - ago * 864e5).toISOString();
  pending.push(a);
  recompute(d, e, stmts, 'seed');
};
const sari = enroll('SO20003', 'C1', 'M001', 6), budi = enroll('SO20011', 'C1', 'M002', 20), rina = enroll('SO20019', 'C2', 'M001', 18);
[sari, budi, rina].forEach(e => recompute(d, e, stmts, 'seed'));
const at = days => new Date(Date.now() - days * 864e5).toISOString();
// Sari: orientasi selesai, sedang di Espresso Basic (teori lulus, grinder & praktik belum).
progress(sari, 'A1a', { evidence_at: at(5) }); progress(sari, 'A1b', { evidence_at: at(5) });
progress(sari, 'A2', { pre_score: 50, post_score: 100, post_passed: 1, post_attempts: 1 }, 4);
progress(sari, 'B1', { evidence_at: at(2), theory_status: 'ACKNOWLEDGED', post_score: 67, post_passed: 0, post_attempts: 1 }, 3);
progress(sari, 'B1', { post_score: 100, post_passed: 1, post_attempts: 2 }, 2);
// Budi: semua stage selesai → sertifikat terbit.
['A1a', 'A1b'].forEach(x => progress(budi, x, { evidence_at: at(18) }));
progress(budi, 'A2', { pre_score: 75, post_score: 100, post_passed: 1, post_attempts: 1 }, 17);
progress(budi, 'B1', { evidence_at: at(12), theory_status: 'ACKNOWLEDGED', post_score: 100, post_passed: 1, post_attempts: 1 }, 12);
progress(budi, 'B2', { evidence_at: at(11) });
progress(budi, 'B3', { evidence_at: at(9), practical_status: 'PASSED' });
progress(budi, 'L1', { evidence_at: at(5), practical_status: 'PASSED' });
progress(budi, 'L2', { evidence_at: at(3), practical_status: 'PASSED' });
// Rina: greeting sudah dibaca, praktik menunggu mentor dan sudah lewat tenggat.
progress(rina, 'G1', { evidence_at: at(15), theory_status: 'ACKNOWLEDGED' });
const g2 = d.assignments.find(x => x.enrollment_id === rina.id && x.activity_id === 'G2');
g2.due_at = at(4); pending.push(g2);

// Tulis: tugas baru dulu (insert dari recompute), lalu keadaan akhir setiap tugas.
const cols = ['status', 'due_at', 'evidence_at', 'theory_status', 'practical_status', 'pre_score', 'pre_at', 'post_score', 'post_at', 'post_passed', 'post_attempts', 'completed_at'];
const finalRows = d.assignments.map(a => ({ sql: `UPDATE assignments SET ${cols.map(c => c + ' = ?').join(', ')} WHERE id = ?`, args: cols.map(c => a[c] ?? null).concat(a.id) }));
const attempts = [
  ['A2', sari, 'PRE_TEST', 'R_K3_PRE', 50, 1, 4], ['A2', sari, 'POST_TEST', 'R_K3_POST', 100, 1, 4], ['B1', sari, 'POST_TEST', 'R_ESP_POST', 67, 0, 3], ['B1', sari, 'POST_TEST', 'R_ESP_POST', 100, 1, 2],
  ['A2', budi, 'PRE_TEST', 'R_K3_PRE', 75, 1, 17], ['A2', budi, 'POST_TEST', 'R_K3_POST', 100, 1, 17], ['B1', budi, 'POST_TEST', 'R_ESP_POST', 100, 1, 12],
].map(([actId, e, kind, rid, score, passed, ago], i) => insert('quiz_attempts', { id: 'QA_SEED_' + i, assignment_id: `AA_${e.id}_${actId}`, resource_id: rid, kind, score, passed, answers: '{}', created_at: at(ago) }));
await write([...stmts.filter(s => /^INSERT INTO (enrollments|mentor_assignments|assignments|certificates)/.test(s.sql.trim())),
  ...stmts.filter(s => /^UPDATE enrollments/.test(s.sql.trim())), ...finalRows, ...attempts]);

fs.writeFileSync(new URL('../.seed-credentials.txt', import.meta.url), '# Akun contoh Mage LMS (jangan di-commit)\nROLE\tEMAIL\tPASSWORD\n' + creds.join('\n') + '\n', { mode: 0o600 });
const check = await loadAll();
console.log(`Seed selesai: ${check.users.length} pengguna, ${check.enrollments.length} pendaftaran, ${check.assignments.length} tugas, ${check.certificates.length} sertifikat.`);
console.log('Akun & password contoh: .seed-credentials.txt');
