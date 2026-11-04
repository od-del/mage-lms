// Mesin LMS: aturan status aktivitas, kenaikan stage, kuis, dan data tiap halaman.
// Port dari JPT_LMS_V2_Master_Manual.gs + WebApp.gs. Status yang dulu dihitung formula
// "Current Status" di sheet sekarang dihitung di sini (recompute) dan disimpan ke kolom status.
import crypto from 'node:crypto';
import { insert, update, audit } from './db.js';

export const RULES = ['SELF_CONFIRMED', 'ACKNOWLEDGED', 'MENTOR_PASSED', 'PRE_SUBMITTED_AND_POST_PASSED', 'ALL_REQUIRED_CHILDREN'];
export const KINDS = ['MODULE', 'VIDEO', 'SOP', 'PRE_TEST', 'POST_TEST'];
const DEFAULT_DUE_DAYS = 14;
const DUE_SOON_DAYS = 3;

export class UserError extends Error {}
const fail = msg => { throw new UserError(msg); };
const nowIso = () => new Date().toISOString();
const uid = prefix => prefix + '_' + crypto.randomBytes(5).toString('hex');
const isTest = kind => kind === 'PRE_TEST' || kind === 'POST_TEST';
const bySeq = (a, b) => (a.seq - b.seq) || String(a.id).localeCompare(String(b.id));
const pct = (n, d) => d ? Math.round(n / d * 100) : 0;

/* ---------- akses ---------- */
export function meOf(d, userId) {
  const u = d.users.find(x => x.id === userId && x.active);
  if (!u) return null;
  const roles = [];
  if (u.role === 'SUPER_ADMIN') roles.push('SUPER_ADMIN', 'ADMIN');
  else if (u.role === 'ADMIN') roles.push('ADMIN');
  const activeEnr = new Set(d.enrollments.filter(e => e.status === 'Active').map(e => e.id));
  if (d.mentor_assignments.some(m => m.mentor_id === u.id && m.active && activeEnr.has(m.enrollment_id))) roles.push('MENTOR');
  if (d.enrollments.some(e => e.user_id === u.id)) roles.push('TRAINEE');
  return { id: u.id, employeeId: u.id, name: u.name, email: u.email, job: u.job, outlet: u.outlet, roles, hasPassword: !!u.password_hash };
}
export const has = (me, role) => me.roles.includes(role);
export function need(me, role) { if (!has(me, role)) fail('Halaman ini khusus ' + (role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin/HR') + '.'); }

const mentorIds = (d, enrId) => d.mentor_assignments.filter(m => m.enrollment_id === enrId && m.active).map(m => m.mentor_id);
function canView(d, me, enr) {
  return enr.user_id === me.id || has(me, 'ADMIN') || mentorIds(d, enr.id).includes(me.id);
}
function enrollmentOr404(d, me, id) {
  const enr = d.enrollments.find(e => e.id === id);
  if (!enr || !canView(d, me, enr)) fail('Pendaftaran tidak ditemukan atau kamu tidak punya akses.');
  return enr;
}

/* ---------- aturan status ---------- */
const activitiesOfStage = (d, stageId) => d.activities.filter(a => a.stage_id === stageId && a.active).sort(bySeq);
const stagesOf = (d, curId) => d.stages.filter(s => s.curriculum_id === curId && s.active).sort(bySeq);
const assignmentsOf = (d, enrId) => d.assignments.filter(a => a.enrollment_id === enrId);

export function quizOk(act, a) {
  return (!act.pre_required || a.pre_score !== null) && (!act.post_required || (a.post_score !== null && !!a.post_passed));
}
function ruleDone(d, act, a, byAct) {
  switch (act.rule) {
    case 'PRE_SUBMITTED_AND_POST_PASSED': return a.pre_score !== null && a.post_score !== null && !!a.post_passed;
    case 'ALL_REQUIRED_CHILDREN': {
      const kids = d.activities.filter(x => x.parent_id === act.id && x.active && x.required_for_parent);
      return kids.length > 0 && kids.every(k => byAct.get(k.id)?.status === 'Completed') && quizOk(act, a);
    }
    case 'SELF_CONFIRMED': return !!a.evidence_at;
    case 'MENTOR_PASSED': return !!a.evidence_at && a.practical_status === 'PASSED' && quizOk(act, a);
    case 'ACKNOWLEDGED': return !!a.evidence_at && a.theory_status === 'ACKNOWLEDGED' && quizOk(act, a);
    default: return false;
  }
}
// Siap dikerjakan bila aktivitas induk sebelumnya (urutan) dan prasyarat teori sudah selesai.
function statusOf(d, act, a, byAct) {
  if (ruleDone(d, act, a, byAct)) return 'Completed';
  const rootOf = x => x.parent_id ? rootOf(d.activities.find(y => y.id === x.parent_id) || { ...x, parent_id: null }) : x;
  const root = rootOf(act);
  const prev = activitiesOfStage(d, act.stage_id).filter(x => !x.parent_id && x.seq < root.seq).pop();
  const ok = id => byAct.get(id)?.status === 'Completed';
  return (!prev || ok(prev.id)) && (!act.prerequisite_id || ok(act.prerequisite_id)) ? 'Assigned' : 'Locked';
}

function openStage(d, enr, stage, stmts) {
  const now = new Date();
  const existing = new Set(assignmentsOf(d, enr.id).map(a => a.activity_id));
  let n = 0;
  activitiesOfStage(d, stage.id).filter(act => !existing.has(act.id)).forEach(act => {
    const a = {
      id: 'AA_' + enr.id + '_' + act.id, enrollment_id: enr.id, activity_id: act.id, status: 'Locked',
      assigned_at: now.toISOString(), due_at: new Date(now.getTime() + (act.due_days || DEFAULT_DUE_DAYS) * 864e5).toISOString(),
      evidence_at: null, theory_status: 'NOT_STARTED', practical_status: act.rule === 'MENTOR_PASSED' ? 'PENDING' : 'NOT_APPLICABLE',
      pre_score: null, pre_at: null, post_score: null, post_at: null, post_passed: 0, post_attempts: 0, completed_at: null,
    };
    d.assignments.push(a);
    stmts.push(insert('assignments', a));
    n++;
  });
  return n;
}

// Hitung ulang status semua tugas satu pendaftaran, buka stage berikutnya bila stage selesai,
// dan terbitkan sertifikat bila kurikulum selesai. Mengubah `d` di memori + mengisi `stmts`.
export function recompute(d, enr, stmts, actor = 'system') {
  const out = { advanced: [], finished: false };
  for (let round = 0; round < 20; round++) {
    let changed = false;
    for (let pass = 0; pass < 10; pass++) {
      const list = assignmentsOf(d, enr.id), byAct = new Map(list.map(a => [a.activity_id, a]));
      let any = false;
      list.forEach(a => {
        const act = d.activities.find(x => x.id === a.activity_id);
        if (!act) return;
        const st = act.active ? statusOf(d, act, a, byAct) : a.status;
        if (st !== a.status) {
          a.status = st;
          a.completed_at = st === 'Completed' ? (a.completed_at || nowIso()) : null;
          stmts.push(update('assignments', a.id, { status: a.status, completed_at: a.completed_at }));
          any = changed = true;
        }
      });
      if (!any) break;
    }
    // Stage berjalan = stage terakhir yang sudah punya tugas.
    const stages = stagesOf(d, enr.curriculum_id), byAct = new Map(assignmentsOf(d, enr.id).map(a => [a.activity_id, a]));
    const opened = stages.filter(s => activitiesOfStage(d, s.id).some(a => byAct.has(a.id)));
    const cur = opened[opened.length - 1];
    if (!cur) {
      // Belum ada stage terbuka (pendaftaran baru): buka stage pertama.
      if (!stages.length || enr.status !== 'Active' || !openStage(d, enr, stages[0], stmts)) break;
      continue;
    }
    const done = activitiesOfStage(d, cur.id).filter(a => a.required_for_stage).every(a => byAct.get(a.id)?.status === 'Completed');
    if (done) {
      const next = stages.find(s => s.seq > cur.seq && !opened.includes(s));
      if (next) {
        openStage(d, enr, next, stmts);
        out.advanced.push(next.name);
        stmts.push(audit(actor, 'STAGE_OPEN', enr.id, next.id));
        continue;
      }
      if (!enr.finished_at) {
        enr.finished_at = nowIso();
        stmts.push(update('enrollments', enr.id, { finished_at: enr.finished_at }));
        if (!d.certificates.some(c => c.enrollment_id === enr.id)) {
          const c = { id: 'CERT-' + crypto.randomBytes(4).toString('hex').toUpperCase(), enrollment_id: enr.id, issued_at: enr.finished_at };
          d.certificates.push(c);
          stmts.push(insert('certificates', c));
        }
        out.finished = true;
      }
    } else if (enr.finished_at) {
      enr.finished_at = null;
      stmts.push(update('enrollments', enr.id, { finished_at: null }));
    }
    if (!changed) break;
  }
  return out;
}

/* ---------- ringkasan & detail ---------- */
function summary(d, enr) {
  const u = d.users.find(x => x.id === enr.user_id) || { id: enr.user_id, name: enr.user_id, job: '', outlet: '' };
  const c = d.curricula.find(x => x.id === enr.curriculum_id) || { id: enr.curriculum_id, name: enr.curriculum_id };
  const stages = stagesOf(d, c.id), stageIds = new Set(stages.map(s => s.id));
  const total = d.activities.filter(a => a.active && stageIds.has(a.stage_id)).length;
  const list = assignmentsOf(d, enr.id), done = list.filter(a => a.status === 'Completed').length;
  const byAct = new Set(list.map(a => a.activity_id));
  const opened = stages.filter(s => activitiesOfStage(d, s.id).some(a => byAct.has(a.id)));
  return {
    enrollmentId: enr.id, status: enr.status, active: enr.status === 'Active', startDate: enr.start_date,
    trainee: { id: u.id, name: u.name, job: u.job, outlet: u.outlet },
    curriculum: { id: c.id, name: c.name },
    progress: { done, total, percent: pct(done, total) },
    finished: !!enr.finished_at, finishedAt: enr.finished_at, currentStage: opened.length ? opened[opened.length - 1].name : '',
    mentors: mentorIds(d, enr.id).map(id => d.users.find(u => u.id === id)?.name || id),
  };
}

function dueInfo(a) {
  if (!a.due_at || a.status === 'Completed') return { due: a.due_at || '', overdue: false, dueSoon: false };
  const t = new Date(a.due_at).getTime(), now = Date.now();
  return { due: a.due_at, overdue: t < now, dueSoon: t >= now && t - now < DUE_SOON_DAYS * 864e5 };
}

function actionsFor(d, me, enr, act, a) {
  if (a.status !== 'Assigned') return [];
  const isTrainee = enr.user_id === me.id, isMentor = mentorIds(d, enr.id).includes(me.id) || has(me, 'ADMIN');
  if (isTrainee && act.rule === 'SELF_CONFIRMED') return ['SELF_CONFIRM'];
  if (isTrainee && act.rule === 'ACKNOWLEDGED' && !a.evidence_at) return ['ACKNOWLEDGE'];
  if (isMentor && act.rule === 'MENTOR_PASSED' && quizOk(act, a) && a.practical_status !== 'PASSED') return ['MENTOR_PASS', 'MENTOR_REDO'];
  return [];
}

function hintFor(act, a, hasPreRes) {
  if (a.status === 'Locked') return 'Selesaikan aktivitas sebelumnya untuk membuka ini.';
  if (a.status === 'Completed') return '';
  if ((act.pre_required || hasPreRes) && a.pre_score === null) return 'Kerjakan pre-test terlebih dahulu.';
  if (act.post_required && !a.post_passed) return 'Lulus post-test dengan nilai minimal ' + act.passing_score + '.';
  if (act.rule === 'MENTOR_PASSED') return a.practical_status === 'REDO' ? 'Mentor meminta praktik diulang. Hubungi mentormu setelah siap.' : 'Menunggu penilaian praktik dari mentor.';
  if (act.rule === 'ALL_REQUIRED_CHILDREN') return 'Selesaikan semua sub-aktivitas.';
  return '';
}

function testState(act, a, r, hasPreRes) {
  if (a.status === 'Locked') return { available: false, done: false, reason: 'Terkunci' };
  if (r.kind === 'PRE_TEST') return { available: a.status === 'Assigned' && a.pre_score === null, done: a.pre_score !== null, score: a.pre_score };
  const preNeeded = (act.pre_required || hasPreRes) && a.pre_score === null;
  return { available: a.status === 'Assigned' && !a.post_passed && !preNeeded, done: !!a.post_passed, score: a.post_score, reason: preNeeded ? 'Kerjakan pre-test dulu' : '' };
}

function activityResources(d, act, a) {
  const list = d.resources.filter(r => r.active && r.activity_id === act.id).sort(bySeq);
  const hasPreRes = list.some(r => r.kind === 'PRE_TEST');
  return {
    hasPreRes,
    resources: list.map(r => {
      const locked = a.status === 'Locked';
      const base = { id: r.id, kind: r.kind, title: r.title, parent: r.parent_id || '', locked };
      if (isTest(r.kind)) return { ...base, test: testState(act, a, r, hasPreRes), questions: d.quiz_questions.filter(q => q.resource_id === r.id).length };
      return { ...base, url: locked ? '' : r.url };
    }),
  };
}

export function enrollmentDetail(d, me, id, attempts = []) {
  const enr = enrollmentOr404(d, me, id);
  const s = summary(d, enr);
  const byAct = new Map(assignmentsOf(d, enr.id).map(a => [a.activity_id, a]));
  let firstOpenSeen = false;
  const stages = stagesOf(d, enr.curriculum_id).map(st => {
    const acts = activitiesOfStage(d, st.id);
    const opened = acts.some(a => byAct.has(a.id));
    const req = acts.filter(a => a.required_for_stage);
    const doneN = acts.filter(a => byAct.get(a.id)?.status === 'Completed').length;
    const allDone = opened && req.every(a => byAct.get(a.id)?.status === 'Completed');
    const status = !opened ? 'NOT_OPEN' : allDone ? 'DONE' : 'IN_PROGRESS';
    if (status === 'IN_PROGRESS') firstOpenSeen = true;
    return {
      id: st.id, name: st.name, sequence: st.seq, status, done: doneN, total: acts.length,
      resources: d.resources.filter(r => r.active && r.stage_id === st.id && !r.activity_id && !isTest(r.kind)).sort(bySeq)
        .map(r => ({ id: r.id, kind: r.kind, title: r.title, locked: !opened, url: opened ? r.url : '' })),
      activities: opened ? acts.filter(act => byAct.has(act.id)).map(act => {
        const a = byAct.get(act.id), { resources, hasPreRes } = activityResources(d, act, a);
        return {
          id: act.id, assignmentId: a.id, name: act.name, parent: act.parent_id || '', status: a.status, rule: act.rule,
          theory: a.theory_status, practical: a.practical_status, pre: a.pre_score, post: a.post_score, passed: !!a.post_passed,
          attempts: a.post_attempts, completedAt: a.completed_at || '', passing: act.passing_score,
          preRequired: !!(act.pre_required || hasPreRes), postRequired: !!act.post_required,
          ...dueInfo(a), actions: actionsFor(d, me, enr, act, a), hint: hintFor(act, a, hasPreRes), resources,
          history: attempts.filter(x => x.assignment_id === a.id).sort((x, y) => x.created_at.localeCompare(y.created_at))
            .map(x => ({ type: x.kind, score: x.score, passed: !!x.passed, at: x.created_at })),
        };
      }) : [],
    };
  });
  const sops = d.resources.filter(r => r.active && r.kind === 'SOP' && r.curriculum_id === enr.curriculum_id && !r.stage_id && !r.activity_id).sort(bySeq)
    .map(r => ({ id: r.id, kind: r.kind, title: r.title, url: r.url, locked: false }));
  const cert = d.certificates.find(c => c.enrollment_id === enr.id);
  return { ...s, stages, resources: sops, certificate: cert ? { id: cert.id, issuedAt: cert.issued_at } : null, isTrainee: enr.user_id === me.id };
}

export function listFor(d, me, kind) {
  let list;
  if (kind === 'mine') list = d.enrollments.filter(e => e.user_id === me.id);
  else if (kind === 'mentees') { const ids = new Set(d.mentor_assignments.filter(m => m.mentor_id === me.id && m.active).map(m => m.enrollment_id)); list = d.enrollments.filter(e => ids.has(e.id)); }
  else { need(me, 'ADMIN'); list = d.enrollments.slice(); }
  return list.map(e => summary(d, e)).sort((a, b) => a.trainee.name.localeCompare(b.trainee.name) || a.curriculum.name.localeCompare(b.curriculum.name));
}

/* ---------- beranda ---------- */
export function home(d, me) {
  const out = { tasks: [], learning: [], queue: [], mentees: 0, admin: null };
  d.enrollments.filter(e => e.user_id === me.id && e.status === 'Active').forEach(enr => {
    const s = summary(d, enr);
    out.learning.push({ enrollmentId: enr.id, curriculum: s.curriculum.name, percent: s.progress.percent, done: s.progress.done, total: s.progress.total, currentStage: s.currentStage, finished: s.finished });
    assignmentsOf(d, enr.id).filter(a => a.status === 'Assigned').forEach(a => {
      const act = d.activities.find(x => x.id === a.activity_id);
      if (!act || (act.rule === 'ALL_REQUIRED_CHILDREN' && quizOk(act, a))) return;
      const st = d.stages.find(x => x.id === act.stage_id) || {};
      const { resources, hasPreRes } = activityResources(d, act, a);
      out.tasks.push({ enrollmentId: enr.id, curriculum: s.curriculum.name, stage: st.name, id: act.id, assignmentId: a.id, name: act.name, rule: act.rule,
        ...dueInfo(a), actions: actionsFor(d, me, enr, act, a), hint: hintFor(act, a, hasPreRes), resources: resources.slice(0, 3) });
    });
  });
  out.tasks.sort((x, y) => (y.overdue - x.overdue) || String(x.due).localeCompare(String(y.due)));
  const mine = d.mentor_assignments.filter(m => m.mentor_id === me.id && m.active).map(m => m.enrollment_id);
  const active = d.enrollments.filter(e => mine.includes(e.id) && e.status === 'Active');
  out.mentees = active.length;
  active.forEach(enr => {
    const u = d.users.find(x => x.id === enr.user_id) || {}, c = d.curricula.find(x => x.id === enr.curriculum_id) || {};
    assignmentsOf(d, enr.id).forEach(a => {
      const act = d.activities.find(x => x.id === a.activity_id);
      if (!act || a.status !== 'Assigned' || act.rule !== 'MENTOR_PASSED' || !quizOk(act, a) || a.practical_status === 'PASSED') return;
      out.queue.push({ enrollmentId: enr.id, trainee: u.name, outlet: u.outlet, curriculum: c.name, stage: (d.stages.find(x => x.id === act.stage_id) || {}).name,
        id: act.id, assignmentId: a.id, name: act.name, ...dueInfo(a) });
    });
  });
  if (has(me, 'ADMIN')) out.admin = dashboard(d, me, {}).kpi;
  return out;
}

/* ---------- aksi trainee / mentor ---------- */
export function activityAction(d, me, { assignmentId, action }) {
  const a = d.assignments.find(x => x.id === assignmentId) || fail('Tugas tidak ditemukan.');
  const enr = enrollmentOr404(d, me, a.enrollment_id);
  const act = d.activities.find(x => x.id === a.activity_id);
  if (enr.status !== 'Active') fail('Pendaftaran ini tidak aktif.');
  if (!actionsFor(d, me, enr, act, a).includes(action)) fail('Aksi ini tidak tersedia untuk tugas tersebut.');
  const stmts = [], now = nowIso();
  if (action === 'SELF_CONFIRM') Object.assign(a, { evidence_at: now });
  if (action === 'ACKNOWLEDGE') Object.assign(a, { evidence_at: now, theory_status: 'ACKNOWLEDGED' });
  if (action === 'MENTOR_PASS') Object.assign(a, { evidence_at: now, practical_status: 'PASSED' });
  if (action === 'MENTOR_REDO') Object.assign(a, { evidence_at: null, practical_status: 'REDO' });
  stmts.push(update('assignments', a.id, { evidence_at: a.evidence_at, theory_status: a.theory_status, practical_status: a.practical_status }));
  stmts.push(audit(me.email, action, a.id));
  const r = recompute(d, enr, stmts, me.email);
  return { stmts, result: { status: a.status, advanced: r.advanced, finished: r.finished } };
}

/* ---------- kuis bawaan (pengganti Google Form) ---------- */
function quizContext(d, me, { assignmentId, resourceId }) {
  const a = d.assignments.find(x => x.id === assignmentId) || fail('Tugas tidak ditemukan.');
  const enr = enrollmentOr404(d, me, a.enrollment_id);
  if (enr.user_id !== me.id) fail('Hanya trainee yang bisa mengerjakan test ini.');
  const act = d.activities.find(x => x.id === a.activity_id);
  const r = d.resources.find(x => x.id === resourceId && x.active && x.activity_id === act.id && isTest(x.kind)) || fail('Test tidak ditemukan.');
  const { hasPreRes } = activityResources(d, act, a);
  const st = testState(act, a, r, hasPreRes);
  const questions = d.quiz_questions.filter(q => q.resource_id === r.id).sort(bySeq);
  return { a, enr, act, r, st, questions };
}

export function quizGet(d, me, p) {
  const { act, r, st, questions, enr } = quizContext(d, me, p);
  const c = d.curricula.find(x => x.id === enr.curriculum_id) || {};
  return {
    title: r.title, kind: r.kind, activity: act.name, curriculum: c.name, enrollmentId: enr.id, passing: act.passing_score,
    available: st.available && questions.length > 0, done: st.done, score: st.score ?? null,
    reason: !questions.length ? 'Test ini belum punya soal. Hubungi admin.' : st.available ? '' : st.done ? 'Test ini sudah selesai.' : (st.reason || 'Test belum bisa dikerjakan.'),
    questions: questions.map(q => ({ id: q.id, question: q.question, options: JSON.parse(q.options) })),
  };
}

export function quizSubmit(d, me, p) {
  const { a, enr, act, r, st, questions } = quizContext(d, me, p);
  if (!st.available || !questions.length) fail('Test ini tidak bisa dikerjakan sekarang.');
  const answers = p.answers || {};
  if (questions.some(q => answers[q.id] === undefined)) fail('Jawab semua soal terlebih dahulu.');
  const correct = questions.filter(q => Number(answers[q.id]) === Number(q.answer)).length;
  const score = pct(correct, questions.length), now = nowIso(), stmts = [];
  let passed = true;
  if (r.kind === 'PRE_TEST') Object.assign(a, { pre_score: score, pre_at: now });
  else { passed = score >= act.passing_score; Object.assign(a, { post_score: score, post_at: now, post_attempts: a.post_attempts + 1, post_passed: passed ? 1 : 0 }); }
  stmts.push(update('assignments', a.id, { pre_score: a.pre_score, pre_at: a.pre_at, post_score: a.post_score, post_at: a.post_at, post_attempts: a.post_attempts, post_passed: a.post_passed }));
  stmts.push(insert('quiz_attempts', { id: uid('QA'), assignment_id: a.id, resource_id: r.id, kind: r.kind, score, passed: passed ? 1 : 0, answers: JSON.stringify(answers), created_at: now }));
  stmts.push(audit(me.email, 'QUIZ_' + r.kind, a.id, String(score)));
  const rc = recompute(d, enr, stmts, me.email);
  return { stmts, result: { score, correct, total: questions.length, passed, passing: act.passing_score, kind: r.kind, status: a.status, advanced: rc.advanced, finished: rc.finished, enrollmentId: enr.id, activityId: act.id } };
}

/* ---------- SOP ---------- */
export function sopLibrary(d, me) {
  const mine = d.enrollments.filter(e => e.user_id === me.id);
  const curIds = new Set(mine.map(e => e.curriculum_id));
  const unlocked = new Set(mine.flatMap(e => assignmentsOf(d, e.id).filter(a => a.status !== 'Locked').map(a => a.activity_id)));
  const openStages = new Set(mine.flatMap(e => assignmentsOf(d, e.id).map(a => d.activities.find(x => x.id === a.activity_id)?.stage_id)));
  const admin = has(me, 'ADMIN');
  return d.resources.filter(r => r.active && r.kind === 'SOP' && (admin
    || (!r.curriculum_id && !r.stage_id && !r.activity_id)
    || (r.activity_id ? unlocked.has(r.activity_id) : r.stage_id ? openStages.has(r.stage_id) : curIds.has(r.curriculum_id))))
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(r => {
      const act = r.activity_id && d.activities.find(x => x.id === r.activity_id);
      const stage = d.stages.find(x => x.id === (r.stage_id || act?.stage_id));
      const cur = d.curricula.find(x => x.id === (r.curriculum_id || stage?.curriculum_id));
      return { id: r.id, title: r.title, url: r.url, scope: cur ? cur.name + (stage ? ' · ' + stage.name : '') : 'Umum' };
    });
}

/* ---------- dashboard ---------- */
export function dashboard(d, me, f = {}) {
  need(me, 'ADMIN');
  const now = Date.now();
  const enrs = d.enrollments.filter(e => (!f.curriculumId || e.curriculum_id === f.curriculumId)
    && (!f.outlet || (d.users.find(u => u.id === e.user_id) || {}).outlet === f.outlet));
  const rows = [], overdue = [], pendingMentor = [];
  enrs.forEach(e => {
    const s = summary(d, e), list = assignmentsOf(d, e.id);
    let late = 0;
    list.forEach(a => {
      const act = d.activities.find(x => x.id === a.activity_id) || {};
      if (a.status !== 'Completed' && a.due_at && new Date(a.due_at).getTime() < now && e.status === 'Active') {
        late++;
        overdue.push({ enrollmentId: e.id, trainee: s.trainee.name, outlet: s.trainee.outlet, curriculum: s.curriculum.name, activity: act.name,
          due: a.due_at, daysLate: Math.max(1, Math.floor((now - new Date(a.due_at).getTime()) / 864e5)), mentors: s.mentors });
      }
      if (e.status === 'Active' && a.status === 'Assigned' && act.rule === 'MENTOR_PASSED' && quizOk(act, a) && a.practical_status !== 'PASSED')
        pendingMentor.push({ enrollmentId: e.id, trainee: s.trainee.name, outlet: s.trainee.outlet, activity: act.name, mentors: s.mentors, since: a.assigned_at });
    });
    rows.push({ enrollmentId: e.id, employeeId: s.trainee.id, trainee: s.trainee.name, job: s.trainee.job, outlet: s.trainee.outlet, curriculum: s.curriculum.name,
      curriculumId: s.curriculum.id, status: s.finished ? 'Selesai' : e.status === 'Active' ? 'Aktif' : 'Nonaktif', active: e.status === 'Active', finished: s.finished,
      percent: s.progress.percent, done: s.progress.done, total: s.progress.total, currentStage: s.currentStage, startDate: e.start_date, overdue: late });
  });
  const group = key => {
    const m = new Map();
    rows.forEach(r => {
      const k = r[key] || '(tanpa outlet)';
      const g = m.get(k) || { name: k, enrollments: 0, finished: 0, sum: 0, overdue: 0 };
      g.enrollments++; g.finished += r.finished ? 1 : 0; g.sum += r.percent; g.overdue += r.overdue ? 1 : 0;
      m.set(k, g);
    });
    return [...m.values()].map(g => ({ name: g.name, enrollments: g.enrollments, finished: g.finished, avg: Math.round(g.sum / g.enrollments), overdue: g.overdue }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };
  overdue.sort((a, b) => b.daysLate - a.daysLate);
  return {
    generatedAt: nowIso(),
    filters: { curricula: d.curricula.filter(c => c.active).map(c => ({ id: c.id, name: c.name })), outlets: [...new Set(d.users.map(u => u.outlet).filter(Boolean))].sort() },
    kpi: { enrollments: rows.length, active: rows.filter(r => r.active && !r.finished).length, finished: rows.filter(r => r.finished).length,
      avgProgress: rows.length ? Math.round(rows.reduce((s, r) => s + r.percent, 0) / rows.length) : 0, overdue: overdue.length, pendingMentor: pendingMentor.length },
    byCurriculum: group('curriculum'), byOutlet: group('outlet'), overdue, pendingMentor, rows,
  };
}

/* ---------- daftarkan peserta ---------- */
export function enrollmentOptions(d, me, { employeeId }) {
  need(me, 'ADMIN');
  const id = String(employeeId || '').trim();
  const u = d.users.find(x => x.id.toLowerCase() === id.toLowerCase() && x.active) || fail('Karyawan dengan ID ' + id + ' tidak ditemukan atau nonaktif.');
  const taken = new Set(d.enrollments.filter(e => e.user_id === u.id).map(e => e.curriculum_id));
  return {
    employee: { id: u.id, name: u.name, job: u.job, outlet: u.outlet },
    curricula: d.curricula.filter(c => c.active && !taken.has(c.id) && stagesOf(d, c.id).length).map(c => ({ id: c.id, name: c.name })),
    taken: d.curricula.filter(c => taken.has(c.id)).map(c => c.name),
    mentors: d.users.filter(x => x.active && x.id !== u.id).map(x => ({ id: x.id, name: x.name, job: x.job, outlet: x.outlet })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function enrollmentCreate(d, me, { employeeId, curriculumId, mentorId, preview }) {
  const opt = enrollmentOptions(d, me, { employeeId });
  const c = opt.curricula.find(x => x.id === curriculumId) || fail('Kurikulum tidak tersedia untuk karyawan ini.');
  const m = opt.mentors.find(x => x.id === mentorId) || fail('Pilih mentor yang valid.');
  const first = stagesOf(d, c.id)[0];
  const acts = activitiesOfStage(d, first.id);
  if (!acts.length) fail('Stage pertama kurikulum ini belum punya aktivitas.');
  const enrId = 'ENR_' + opt.employee.id + '_' + c.id;
  const summaryOut = { enrollmentId: enrId, employee: opt.employee, curriculum: c, mentor: m, stage: first.name, newAssignments: acts.length };
  if (preview) return { stmts: [], result: { preview: true, ...summaryOut } };
  const enr = { id: enrId, user_id: opt.employee.id, curriculum_id: c.id, status: 'Active', start_date: nowIso(), finished_at: null };
  d.enrollments.push(enr);
  const stmts = [insert('enrollments', enr)];
  const ma = { id: uid('MA'), enrollment_id: enr.id, mentor_id: m.id, active: 1, created_at: nowIso() };
  d.mentor_assignments.push(ma);
  stmts.push(insert('mentor_assignments', ma));
  openStage(d, enr, first, stmts);
  recompute(d, enr, stmts, me.email);
  stmts.push(audit(me.email, 'ENROLL', enr.id, { mentor: m.id }));
  return { stmts, result: { preview: false, ...summaryOut } };
}

/* ---------- kurikulum (pengganti tab CURRICULUM_*) ---------- */
export function curriculumTree(d, me) {
  need(me, 'SUPER_ADMIN');
  return {
    rules: RULES,
    curricula: d.curricula.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => ({
      ...c, enrollments: d.enrollments.filter(e => e.curriculum_id === c.id).length,
      stages: d.stages.filter(s => s.curriculum_id === c.id).sort(bySeq).map(s => ({ ...s, activities: d.activities.filter(a => a.stage_id === s.id).sort(bySeq) })),
    })),
  };
}

const slug = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'X';
const bool = v => v ? 1 : 0;

export function curriculumSave(d, me, p) {
  need(me, 'SUPER_ADMIN');
  const name = String(p.name || '').trim() || fail('Nama kurikulum wajib diisi.');
  const ex = p.id && d.curricula.find(c => c.id === p.id);
  const id = ex ? ex.id : (String(p.newId || '').trim().toUpperCase() || slug(name));
  if (!ex && d.curricula.some(c => c.id === id)) fail('ID kurikulum ' + id + ' sudah dipakai.');
  const row = { id, name, description: String(p.description || ''), active: bool(p.active ?? 1) };
  return { stmts: [ex ? update('curricula', id, row) : insert('curricula', row), audit(me.email, 'CURRICULUM_SAVE', id)], result: row };
}

export function stageSave(d, me, p) {
  need(me, 'SUPER_ADMIN');
  const name = String(p.name || '').trim() || fail('Nama stage wajib diisi.');
  const ex = p.id && d.stages.find(s => s.id === p.id);
  const curId = ex ? ex.curriculum_id : p.curriculum_id;
  if (!d.curricula.some(c => c.id === curId)) fail('Kurikulum tidak ditemukan.');
  const seq = Number(p.seq) || (Math.max(0, ...d.stages.filter(s => s.curriculum_id === curId).map(s => s.seq)) + 1);
  const id = ex ? ex.id : 'ST_' + curId + '_' + seq + '_' + crypto.randomBytes(2).toString('hex');
  const row = { id, curriculum_id: curId, name, seq, active: bool(p.active ?? 1) };
  return { stmts: [ex ? update('stages', id, row) : insert('stages', row), audit(me.email, 'STAGE_SAVE', id)], result: row };
}

export function activitySave(d, me, p) {
  need(me, 'SUPER_ADMIN');
  const name = String(p.name || '').trim() || fail('Nama aktivitas wajib diisi.');
  const ex = p.id && d.activities.find(a => a.id === p.id);
  const stageId = ex ? ex.stage_id : p.stage_id;
  const stage = d.stages.find(s => s.id === stageId) || fail('Stage tidak ditemukan.');
  if (!RULES.includes(p.rule)) fail('Aturan selesai tidak dikenal.');
  if (p.parent_id && !d.activities.some(a => a.id === p.parent_id && a.stage_id === stageId)) fail('Induk aktivitas harus di stage yang sama.');
  if (p.parent_id && p.parent_id === p.id) fail('Aktivitas tidak bisa menjadi induk dirinya sendiri.');
  const seq = Number(p.seq) || (Math.max(0, ...d.activities.filter(a => a.stage_id === stageId).map(a => a.seq)) + 1);
  const id = ex ? ex.id : 'ACT_' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const row = {
    id, stage_id: stageId, parent_id: p.parent_id || null, name, seq, rule: p.rule,
    required_for_stage: bool(p.required_for_stage ?? 1), required_for_parent: bool(p.required_for_parent ?? 1),
    pre_required: bool(p.pre_required), post_required: bool(p.post_required),
    passing_score: Math.min(100, Math.max(0, Number(p.passing_score ?? 70))), prerequisite_id: p.prerequisite_id || null,
    due_days: p.due_days ? Number(p.due_days) : null, active: bool(p.active ?? 1),
  };
  const stmts = [ex ? update('activities', id, row) : insert('activities', row), audit(me.email, 'ACTIVITY_SAVE', id)];
  if (ex) Object.assign(ex, row); else d.activities.push(row);
  // Peserta yang stage-nya sudah terbuka langsung mendapat tugas baru & status dihitung ulang.
  d.enrollments.filter(e => e.curriculum_id === stage.curriculum_id).forEach(enr => {
    const opened = assignmentsOf(d, enr.id).some(a => d.activities.find(x => x.id === a.activity_id)?.stage_id === stageId);
    if (opened) openStage(d, enr, stage, stmts);
    recompute(d, enr, stmts, me.email);
  });
  return { stmts, result: row };
}

/* ---------- materi & soal ---------- */
export function contentCatalog(d, me) {
  need(me, 'SUPER_ADMIN');
  return {
    curricula: d.curricula.map(c => ({ id: c.id, name: c.name })),
    stages: d.stages.map(s => ({ id: s.id, name: s.name, curriculum: s.curriculum_id, seq: s.seq })),
    activities: d.activities.map(a => ({ id: a.id, name: a.name, stage: a.stage_id, curriculum: (d.stages.find(s => s.id === a.stage_id) || {}).curriculum_id, seq: a.seq, passing: a.passing_score })),
    resources: d.resources.map(r => ({ ...r, active: !!r.active, questions: d.quiz_questions.filter(q => q.resource_id === r.id).length })),
  };
}

export function contentSave(d, me, p) {
  need(me, 'SUPER_ADMIN');
  const ex = p.id && d.resources.find(r => r.id === p.id);
  if (ex && p.onlyActive) {
    const stmts = [update('resources', ex.id, { active: bool(p.active) })];
    if (!p.active) d.resources.filter(r => r.parent_id === ex.id).forEach(k => stmts.push(update('resources', k.id, { active: 0 })));
    stmts.push(audit(me.email, p.active ? 'CONTENT_ON' : 'CONTENT_OFF', ex.id));
    return { stmts, result: { id: ex.id } };
  }
  const kind = KINDS.includes(p.kind) ? p.kind : fail('Jenis materi tidak dikenal.');
  const title = String(p.title || '').trim() || fail('Judul wajib diisi.');
  const url = String(p.url || '').trim();
  if (!isTest(kind) && !/^https?:\/\//i.test(url)) fail('Link materi harus diawali http:// atau https://');
  let loc = { activity_id: p.activity_id || null, stage_id: p.stage_id || null, curriculum_id: p.curriculum_id || null, parent_id: null };
  if (isTest(kind)) {
    const parent = d.resources.find(r => r.id === p.parent_id);
    if (parent) loc = { activity_id: parent.activity_id, stage_id: parent.stage_id, curriculum_id: parent.curriculum_id, parent_id: parent.id };
    else if (!loc.activity_id) fail('Test harus menempel ke modul/SOP atau ke aktivitas.');
  }
  if (isTest(kind) && !loc.activity_id) fail('Modul/SOP induk test ini harus ditempatkan di sebuah aktivitas supaya nilainya tercatat.');
  if (loc.activity_id) { const a = d.activities.find(x => x.id === loc.activity_id) || fail('Aktivitas tidak ditemukan.'); loc.stage_id = null; loc.curriculum_id = null; void a; }
  else if (loc.stage_id) loc.curriculum_id = null;
  const id = ex ? ex.id : 'RES_' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const row = { id, kind, title, url: isTest(kind) ? '' : url, ...loc, seq: Number(p.seq) || 1, active: bool(p.active ?? 1) };
  const stmts = [ex ? update('resources', id, row) : insert('resources', row), audit(me.email, 'CONTENT_SAVE', id)];
  // Test yang ditambahkan mewajibkan aktivitasnya (pre/post_required) — seperti "Daftarkan penilaian" dulu.
  if (isTest(kind) && row.active) {
    const act = d.activities.find(x => x.id === row.activity_id);
    const flag = kind === 'PRE_TEST' ? 'pre_required' : 'post_required';
    if (act && !act[flag]) { act[flag] = 1; stmts.push(update('activities', act.id, { [flag]: 1 })); }
  }
  return { stmts, result: row };
}

export function quizQuestions(d, me, { resourceId }) {
  need(me, 'SUPER_ADMIN');
  const r = d.resources.find(x => x.id === resourceId && isTest(x.kind)) || fail('Test tidak ditemukan.');
  return { resource: { id: r.id, title: r.title, kind: r.kind }, questions: d.quiz_questions.filter(q => q.resource_id === r.id).sort(bySeq).map(q => ({ id: q.id, question: q.question, options: JSON.parse(q.options), answer: q.answer })) };
}

export function quizQuestionsSave(d, me, { resourceId, questions }) {
  need(me, 'SUPER_ADMIN');
  const r = d.resources.find(x => x.id === resourceId && isTest(x.kind)) || fail('Test tidak ditemukan.');
  if (!Array.isArray(questions) || !questions.length) fail('Tambahkan minimal satu soal.');
  const clean = questions.map((q, i) => {
    const question = String(q.question || '').trim() || fail('Soal nomor ' + (i + 1) + ' masih kosong.');
    const options = (q.options || []).map(o => String(o || '').trim()).filter(Boolean);
    if (options.length < 2) fail('Soal nomor ' + (i + 1) + ' butuh minimal 2 pilihan jawaban.');
    const answer = Number(q.answer);
    if (!(answer >= 0 && answer < options.length)) fail('Pilih jawaban benar untuk soal nomor ' + (i + 1) + '.');
    return { id: 'Q_' + crypto.randomBytes(5).toString('hex'), resource_id: r.id, seq: i + 1, question, options: JSON.stringify(options), answer };
  });
  return { stmts: [{ sql: 'DELETE FROM quiz_questions WHERE resource_id = ?', args: [r.id] }, ...clean.map(q => insert('quiz_questions', q)), audit(me.email, 'QUIZ_SAVE', r.id, String(clean.length))], result: { count: clean.length } };
}

/* ---------- pengguna (pengganti USER_MASTER + WEBAPP_ACCESS) ---------- */
export function usersList(d, me) {
  need(me, 'SUPER_ADMIN');
  return d.users.map(u => ({ id: u.id, name: u.name, email: u.email, job: u.job, outlet: u.outlet, role: u.role, active: !!u.active, hasPassword: !!u.password_hash,
    enrollments: d.enrollments.filter(e => e.user_id === u.id).length, mentees: d.mentor_assignments.filter(m => m.mentor_id === u.id && m.active).length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function userSave(d, me, p) {
  need(me, 'SUPER_ADMIN');
  const ex = p.isNew ? null : d.users.find(u => u.id === p.id);
  const id = String(p.id || '').trim() || fail('ID karyawan wajib diisi.');
  if (p.isNew && d.users.some(u => u.id.toLowerCase() === id.toLowerCase())) fail('ID karyawan ' + id + ' sudah dipakai.');
  if (!p.isNew && !ex) fail('Pengguna tidak ditemukan.');
  const email = String(p.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('Email tidak valid.');
  if (d.users.some(u => u.id !== id && u.email.toLowerCase() === email)) fail('Email sudah dipakai pengguna lain.');
  const role = ['', 'ADMIN', 'SUPER_ADMIN'].includes(p.role) ? p.role : '';
  if (ex && ex.id === me.id && (role !== 'SUPER_ADMIN' || !p.active)) fail('Kamu tidak bisa menurunkan role atau menonaktifkan akunmu sendiri.');
  const row = { id, name: String(p.name || '').trim() || fail('Nama wajib diisi.'), email, job: String(p.job || '').trim(), outlet: String(p.outlet || '').trim(), role, active: bool(p.active ?? 1) };
  return { stmts: [ex ? update('users', id, row) : insert('users', row), audit(me.email, 'USER_SAVE', id, role)], result: row };
}

/* ---------- pemeriksaan sistem ---------- */
export function health(d, me) {
  need(me, 'SUPER_ADMIN');
  const checks = [], add = (level, area, title, detail = '') => checks.push({ level, area, title, detail });
  const sample = (list, n = 5) => list.slice(0, n).join(', ') + (list.length > n ? ' … +' + (list.length - n) : '');
  const activeEnr = d.enrollments.filter(e => e.status === 'Active');
  const noMentor = activeEnr.filter(e => !mentorIds(d, e.id).length).map(e => e.id);
  add(noMentor.length ? 'warn' : 'ok', 'Data', noMentor.length ? noMentor.length + ' pendaftaran aktif tanpa mentor' : 'Semua pendaftaran aktif punya mentor', sample(noMentor));
  const noTasks = activeEnr.filter(e => !assignmentsOf(d, e.id).length).map(e => e.id);
  if (noTasks.length) add('error', 'Data', noTasks.length + ' pendaftaran aktif tanpa tugas', sample(noTasks));
  const emails = new Map(); d.users.filter(u => u.active).forEach(u => emails.set(u.email.toLowerCase(), (emails.get(u.email.toLowerCase()) || 0) + 1));
  const noPw = d.users.filter(u => u.active && !u.password_hash).map(u => u.name);
  add(noPw.length ? 'warn' : 'ok', 'Data', noPw.length ? noPw.length + ' pengguna aktif belum punya password' : 'Semua pengguna aktif punya password', noPw.length ? 'Buat password sementara di menu Pengguna: ' + sample(noPw) : '');
  const badParent = d.activities.filter(a => a.active && a.rule === 'ALL_REQUIRED_CHILDREN' && !d.activities.some(k => k.parent_id === a.id && k.active && k.required_for_parent)).map(a => a.name);
  if (badParent.length) add('error', 'Kurikulum', badParent.length + ' aktivitas "semua sub-aktivitas" tanpa sub-aktivitas wajib', 'Tidak akan pernah selesai: ' + sample(badParent));
  const emptyStage = d.stages.filter(s => s.active && !activitiesOfStage(d, s.id).length).map(s => s.name);
  add(emptyStage.length ? 'warn' : 'ok', 'Kurikulum', emptyStage.length ? emptyStage.length + ' stage tanpa aktivitas' : 'Semua stage punya aktivitas', sample(emptyStage));
  const noQ = d.resources.filter(r => r.active && isTest(r.kind) && !d.quiz_questions.some(q => q.resource_id === r.id)).map(r => r.title);
  add(noQ.length ? 'error' : 'ok', 'Materi', noQ.length ? noQ.length + ' test aktif belum punya soal' : 'Semua test aktif punya soal', noQ.length ? 'Trainee tidak bisa lanjut: ' + sample(noQ) : '');
  const needTest = d.activities.filter(a => a.active && ((a.pre_required && !d.resources.some(r => r.active && r.kind === 'PRE_TEST' && r.activity_id === a.id))
    || (a.post_required && !d.resources.some(r => r.active && r.kind === 'POST_TEST' && r.activity_id === a.id)))).map(a => a.name);
  if (needTest.length) add('error', 'Materi', needTest.length + ' aktivitas mewajibkan test yang belum ada', sample(needTest));
  return {
    generatedAt: nowIso(), database: (process.env.TURSO_DATABASE_URL || '').replace(/^libsql:\/\//, '').split('.')[0],
    counts: { users: d.users.length, enrollments: d.enrollments.length, assignments: d.assignments.length, resources: d.resources.length, passwords: d.users.filter(u => u.password_hash).length },
    checks,
  };
}

export function certificate(d, me, { enrollmentId }) {
  const enr = enrollmentOr404(d, me, enrollmentId);
  const c = d.certificates.find(x => x.enrollment_id === enr.id) || fail('Sertifikat belum tersedia: kurikulum belum selesai.');
  const s = summary(d, enr);
  return { id: c.id, issuedAt: c.issued_at, trainee: s.trainee, curriculum: s.curriculum, mentors: s.mentors, startDate: s.startDate };
}
