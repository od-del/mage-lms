// Uji API ujung-ke-ujung (mengubah data!). Jalankan pada database uji, lalu `npm run db:seed -- --reset`.
//   node scripts/smoke.mjs http://localhost:3000 .seed-credentials.txt
import fs from 'node:fs';
const [base, credFile] = process.argv.slice(2);
const creds = Object.fromEntries(fs.readFileSync(credFile, 'utf8').split('\n').filter(l => l.includes('@')).map(l => { const [, e, p] = l.split('\t'); return [e, p]; }));
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if (!ok) fails++; };

async function login(email, password = creds[email]) {
  const r = await fetch(base + '/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  return { status: r.status, cookie, body: await r.json() };
}
async function rpc(cookie, action, params = {}) {
  const r = await fetch(base + '/api/rpc', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ action, params }) });
  return { status: r.status, ...(await r.json()) };
}

const bad = await login('sari@mage-lms.local', 'salah-123');
check('login wrong password rejected', bad.status === 401, bad.body.error);
const noAuth = await rpc('', 'home');
check('rpc without session → 401', noAuth.status === 401);

const sa = (await login('admin@mage-lms.local')).cookie, sari = (await login('sari@mage-lms.local')).cookie, mira = (await login('mira@mage-lms.local')).cookie;
check('3 logins ok', !!sa && !!sari && !!mira);

const meSa = await rpc(sa, 'me');
check('super admin roles', meSa.data && meSa.data.roles.includes('SUPER_ADMIN') && meSa.data.roles.includes('ADMIN'), JSON.stringify(meSa.data?.roles));
for (const a of ['allEnrollments', 'dashboard', 'curriculumTree', 'contentCatalog', 'usersList', 'health', 'sopLibrary', 'home']) {
  const r = await rpc(sa, a);
  check('super admin ' + a, r.status === 200 && r.data, r.error || '');
}
const deny = await rpc(sari, 'dashboard');
check('trainee cannot open dashboard', deny.status === 400, deny.error);
const denyU = await rpc(sari, 'usersList');
check('trainee cannot list users', denyU.status === 400);

const home = await rpc(sari, 'home');
check('sari home has tasks', home.data.tasks.length >= 1, home.data.tasks.map(t => t.name + ':' + t.actions).join(', '));
const det = await rpc(sari, 'enrollmentDetail', { id: 'ENR_SO20003_C1' });
check('sari detail', det.status === 200 && det.data.stages.length === 3, det.error || det.data.stages.map(s => s.name + '=' + s.status).join(', '));
const other = await rpc(sari, 'enrollmentDetail', { id: 'ENR_SO20011_C1' });
check('sari cannot open Budi', other.status === 400);

// Sari: tandai grinder selesai → praktik B3 terbuka, masuk antrean Mira? (mentor Sari = Mira)
const b2 = home.data.tasks.find(t => t.id === 'B2');
const act = await rpc(sari, 'activityAction', { assignmentId: b2.assignmentId, action: 'SELF_CONFIRM' });
check('sari SELF_CONFIRM B2', act.status === 200 && act.data.status === 'Completed', act.error || act.data.status);
const again = await rpc(sari, 'activityAction', { assignmentId: b2.assignmentId, action: 'SELF_CONFIRM' });
check('repeat action rejected', again.status === 400);
const mh = await rpc(mira, 'home');
const q = mh.data.queue.find(x => x.id === 'B3');
check('B3 appears in Mira queue', !!q, mh.data.queue.map(x => x.trainee + ':' + x.name).join(', '));
const pass = await rpc(mira, 'activityAction', { assignmentId: q.assignmentId, action: 'MENTOR_PASS' });
check('mira MENTOR_PASS → stage Latte Art opens', pass.status === 200 && pass.data.advanced.includes('Latte Art'), pass.error || JSON.stringify(pass.data));

// Kuis: ambil post-test K3 untuk Rina? Rina tidak punya kuis. Uji kuis pada data baru: buat soal tidak perlu — cek quizGet yang sudah lulus.
const k3 = det.data.stages[0].activities.find(a => a.id === 'A2');
const qg = await rpc(sari, 'quizGet', { assignmentId: k3.assignmentId, resourceId: 'R_K3_POST' });
check('completed post-test not available', qg.status === 200 && qg.data.available === false && qg.data.done === true, qg.error || qg.data.reason);
const qa = await rpc(sari, 'quizGet', { assignmentId: k3.assignmentId, resourceId: 'R_ESP_POST' });
check('quiz from another activity rejected', qa.status === 400);

// Enroll Rina ke C1 lewat admin (preview + create) lalu kerjakan pre/post-test K3.
const opt = await rpc(sa, 'enrollmentOptions', { employeeId: 'so20019' });
check('enrollment options (case-insensitive id)', opt.status === 200 && opt.data.curricula.some(c => c.id === 'C1'), opt.error || '');
const pv = await rpc(sa, 'enrollmentCreate', { employeeId: 'SO20019', curriculumId: 'C1', mentorId: 'M001', preview: true });
check('enroll preview', pv.status === 200 && pv.data.preview && pv.data.newAssignments > 0, pv.error || '');
const cr = await rpc(sa, 'enrollmentCreate', { employeeId: 'SO20019', curriculumId: 'C1', mentorId: 'M001', preview: false });
check('enroll create', cr.status === 200 && !cr.data.preview, cr.error || '');
const dup = await rpc(sa, 'enrollmentCreate', { employeeId: 'SO20019', curriculumId: 'C1', mentorId: 'M001', preview: false });
check('duplicate enroll rejected', dup.status === 400, dup.error);
const rina = (await login('rina@mage-lms.local')).cookie;
const rd = await rpc(rina, 'enrollmentDetail', { id: cr.data.enrollmentId });
const a2 = rd.data.stages[0].activities.find(a => a.id === 'A2');
check('A2 locked until A1 done', a2.status === 'Locked', a2.status);
for (const id of ['A1a', 'A1b']) {
  const x = rd.data.stages[0].activities.find(a => a.id === id);
  await rpc(rina, 'activityAction', { assignmentId: x.assignmentId, action: 'SELF_CONFIRM' });
}
const postFirst = await rpc(rina, 'quizGet', { assignmentId: a2.assignmentId, resourceId: 'R_K3_POST' });
check('post-test blocked before pre-test', postFirst.data && postFirst.data.available === false, postFirst.data?.reason);
const pre = await rpc(rina, 'quizGet', { assignmentId: a2.assignmentId, resourceId: 'R_K3_PRE' });
check('pre-test available, no answers leaked', pre.data.available && pre.data.questions.length === 4 && pre.data.questions.every(x => x.answer === undefined));
const wrong = Object.fromEntries(pre.data.questions.map(x => [x.id, 3]));
const ps = await rpc(rina, 'quizSubmit', { assignmentId: a2.assignmentId, resourceId: 'R_K3_PRE', answers: wrong });
check('pre-test submit', ps.status === 200 && ps.data.score === 0, JSON.stringify(ps.data || ps.error));
const post = await rpc(rina, 'quizGet', { assignmentId: a2.assignmentId, resourceId: 'R_K3_POST' });
const wrongPost = Object.fromEntries(post.data.questions.map(x => [x.id, 3]));
const fail1 = await rpc(rina, 'quizSubmit', { assignmentId: a2.assignmentId, resourceId: 'R_K3_POST', answers: wrongPost });
check('post-test fail recorded', fail1.data && fail1.data.passed === false, JSON.stringify(fail1.data || fail1.error));
const right = { [post.data.questions[0].id]: 1, [post.data.questions[1].id]: 0, [post.data.questions[2].id]: 1, [post.data.questions[3].id]: 1 };
const ok2 = await rpc(rina, 'quizSubmit', { assignmentId: a2.assignmentId, resourceId: 'R_K3_POST', answers: right });
check('post-test pass → stage 2 opens', ok2.data && ok2.data.passed && ok2.data.score === 100 && ok2.data.advanced.includes('Espresso Basic'), JSON.stringify(ok2.data || ok2.error));
const hist = await rpc(rina, 'enrollmentDetail', { id: cr.data.enrollmentId });
check('history has 3 attempts', hist.data.stages[0].activities.find(a => a.id === 'A2').history.length === 3);

const cert = await rpc(sa, 'certificate', { enrollmentId: 'ENR_SO20011_C1' });
check('certificate for finished enrollment', cert.status === 200 && cert.data.id.startsWith('CERT-'), cert.error || '');
const cert2 = await rpc(sari, 'certificate', { enrollmentId: 'ENR_SO20003_C1' });
check('no certificate before finishing', cert2.status === 400);

const pw = await rpc(sa, 'passwordReset', { userId: 'SO20019' });
check('password reset gives temp password', pw.status === 200 && /^Mage-/.test(pw.data.temp));
const oldLogin = await login('rina@mage-lms.local');
check('old password no longer works', oldLogin.status === 401);
const newLogin = await login('rina@mage-lms.local', pw.data.temp);
check('temp password works', newLogin.status === 200);
const cp = await rpc(newLogin.cookie, 'changePassword', { current: pw.data.temp, next: 'short' });
check('weak password rejected', cp.status === 400, cp.error);

console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
