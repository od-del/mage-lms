// Mesin LMS: aturan status aktivitas, kenaikan stage, kuis, dan data tiap halaman.
// Port dari JPT_LMS_V2_Master_Manual.gs + WebApp.gs. Status yang dulu dihitung formula
// "Current Status" di sheet sekarang dihitung di sini (recompute) dan disimpan ke kolom status.
import crypto from 'node:crypto';
import { insert, update, audit, slugId } from './db.js';

export const RULES = ['SELF_CONFIRMED', 'ACKNOWLEDGED', 'MENTOR_PASSED', 'PRE_SUBMITTED_AND_POST_PASSED', 'ALL_REQUIRED_CHILDREN'];
export const KINDS = ['MODULE', 'SOP', 'VIDEO', 'OTHER_DOC', 'IT_SUPPORT', 'PRE_TEST', 'POST_TEST'];
// Kelompok di Documents/Kelola Materi mengikuti format: IT Support Management → IT_TOOL, lainnya → DOCUMENT.
const categoryOf = kind => kind === 'IT_SUPPORT' ? 'IT_TOOL' : 'DOCUMENT';
const DEFAULT_DUE_DAYS = 14;
const DUE_SOON_DAYS = 3;

export class UserError extends Error {}
const fail = msg => { throw new UserError(msg); };
const nowIso = () => new Date().toISOString();
const uid = prefix => prefix + '_' + crypto.randomBytes(5).toString('hex');
const isTest = kind => kind === 'PRE_TEST' || kind === 'POST_TEST';
const bySeq = (a, b) => (a.seq - b.seq) || String(a.id).localeCompare(String(b.id));
const pct = (n, d) => d ? Math.round(n / d * 100) : 0;
const arr = v => { try { const x = JSON.parse(v || '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/* ---------- akses ---------- */
const practiceOf = (d, userId) => d.assignments.filter(a => a.practice_mentor_id === userId && a.status === 'Assigned');
export function meOf(d, userId) {
  const u = d.users.find(x => x.id === userId && x.active);
  if (!u) return null;
  const roles = [];
  if (u.role === 'SUPER_ADMIN') roles.push('SUPER_ADMIN', 'ADMIN');
  else if (u.role === 'ADMIN') roles.push('ADMIN');
  const activeEnr = new Set(d.enrollments.filter(e => e.status === 'Active').map(e => e.id));
  if (d.mentor_assignments.some(m => m.mentor_id === u.id && m.active && activeEnr.has(m.enrollment_id))
    || practiceOf(d, u.id).some(a => activeEnr.has(a.enrollment_id))) roles.push('MENTOR');
  if (d.enrollments.some(e => e.user_id === u.id)) roles.push('TRAINEE');
  return { id: u.id, employeeId: u.id, name: u.name, email: u.email, job: u.job, outlet: u.outlet, roles, hasPassword: !!u.password_hash };
}
export const has = (me, role) => me.roles.includes(role);
export function need(me, role) { if (!has(me, role)) fail('Halaman ini khusus ' + (role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin/HR') + '.'); }

const mentorIds = (d, enrId) => d.mentor_assignments.filter(m => m.enrollment_id === enrId && m.active).map(m => m.mentor_id);
const isPracticeMentor = (d, me, enrId) => d.assignments.some(a => a.enrollment_id === enrId && a.practice_mentor_id === me.id);
function canView(d, me, enr) {
  return enr.user_id === me.id || has(me, 'ADMIN') || mentorIds(d, enr.id).includes(me.id) || isPracticeMentor(d, me, enr.id);
}

/* ---------- perpustakaan materi ----------
   Materi berdiri sendiri; pemakaiannya lewat resource_links (aktivitas / stage / kurikulum).
   Pre/post-test yang menempel ke modul/SOP ikut ke mana pun induknya ditautkan. */
const linksOf = (d, key, id) => d.resource_links.filter(l => l[key] === id).sort(bySeq);
function linkedResources(d, key, id, { tests = true } = {}) {
  const seen = new Set(), out = [];
  linksOf(d, key, id).forEach(l => {
    const r = d.resources.find(x => x.id === l.resource_id && x.active);
    if (!r || seen.has(r.id)) return;
    seen.add(r.id); out.push(r);
    if (tests) d.resources.filter(k => k.parent_id === r.id && k.active && isTest(k.kind)).sort(bySeq)
      .forEach(k => { if (!seen.has(k.id)) { seen.add(k.id); out.push(k); } });
  });
  return tests ? out : out.filter(r => !isTest(r.kind));
}
const activityRes = (d, actId) => linkedResources(d, 'activity_id', actId);

/* ---------- master mentor & pendamping praktik ---------- */
function mentorCandidates(d, curriculumId) {
  return d.mentors.filter(m => m.active && arr(m.curricula).includes(curriculumId))
    .map(m => d.users.find(u => u.id === m.user_id && u.active)).filter(Boolean)
    .map(u => ({ id: u.id, name: u.name, job: u.job, outlet: u.outlet })).sort((a, b) => a.name.localeCompare(b.name));
}
// Pilihan pendamping praktik: mentor aktif yang berwenang di kurikulum ini; dipersempit ke daftar
// "boleh mendampingi" di aktivitas bila diisi.
function practiceOptions(d, enr, act) {
  const allowed = arr(act.mentor_ids);
  return mentorCandidates(d, enr.curriculum_id).filter(m => m.id !== enr.user_id && (!allowed.length || allowed.includes(m.id)));
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
      pre_score: null, pre_at: null, post_score: null, post_at: null, post_passed: 0, post_attempts: 0, completed_at: null, practice_mentor_id: null,
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
  const isTrainee = enr.user_id === me.id, isMentor = mentorIds(d, enr.id).includes(me.id) || has(me, 'ADMIN') || a.practice_mentor_id === me.id;
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
  const list = activityRes(d, act.id);
  const ids = new Set(list.map(r => r.id));
  const hasPreRes = list.some(r => r.kind === 'PRE_TEST');
  return {
    hasPreRes,
    resources: list.map(r => {
      const locked = a.status === 'Locked';
      const base = { id: r.id, kind: r.kind, category: r.category, title: r.title, parent: ids.has(r.parent_id) ? r.parent_id : '', locked };
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
      resources: linkedResources(d, 'stage_id', st.id, { tests: false })
        .map(r => ({ id: r.id, kind: r.kind, title: r.title, locked: !opened, url: opened ? r.url : '' })),
      activities: opened ? acts.filter(act => byAct.has(act.id)).map(act => {
        const a = byAct.get(act.id), { resources, hasPreRes } = activityResources(d, act, a);
        const practice = act.rule === 'MENTOR_PASSED';
        const pm = practice && a.practice_mentor_id ? d.users.find(u => u.id === a.practice_mentor_id) : null;
        const canChoose = practice && enr.user_id === me.id && enr.status === 'Active' && a.status === 'Assigned' && a.practical_status !== 'PASSED';
        return {
          practiceMentor: pm ? { id: pm.id, name: pm.name } : null,
          mentorOptions: canChoose ? practiceOptions(d, enr, act) : null,
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
  const sops = linkedResources(d, 'curriculum_id', enr.curriculum_id, { tests: false })
    .map(r => ({ id: r.id, kind: r.kind, title: r.title, url: r.url, locked: false }));
  const cert = d.certificates.find(c => c.enrollment_id === enr.id);
  return { ...s, stages, resources: sops, certificate: cert ? { id: cert.id, issuedAt: cert.issued_at } : null, isTrainee: enr.user_id === me.id };
}

export function listFor(d, me, kind) {
  let list;
  if (kind === 'mine') list = d.enrollments.filter(e => e.user_id === me.id);
  else if (kind === 'mentees') {
    const ids = new Set(d.mentor_assignments.filter(m => m.mentor_id === me.id && m.active).map(m => m.enrollment_id));
    d.assignments.filter(a => a.practice_mentor_id === me.id).forEach(a => ids.add(a.enrollment_id));
    list = d.enrollments.filter(e => ids.has(e.id));
  }
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
  const mine = new Set(d.mentor_assignments.filter(m => m.mentor_id === me.id && m.active).map(m => m.enrollment_id));
  const practice = new Set(d.assignments.filter(a => a.practice_mentor_id === me.id).map(a => a.enrollment_id));
  const active = d.enrollments.filter(e => (mine.has(e.id) || practice.has(e.id)) && e.status === 'Active');
  out.mentees = active.length;
  active.forEach(enr => {
    const u = d.users.find(x => x.id === enr.user_id) || {}, c = d.curricula.find(x => x.id === enr.curriculum_id) || {};
    assignmentsOf(d, enr.id).forEach(a => {
      const act = d.activities.find(x => x.id === a.activity_id);
      if (!act || a.status !== 'Assigned' || act.rule !== 'MENTOR_PASSED' || !quizOk(act, a) || a.practical_status === 'PASSED') return;
      if (!mine.has(enr.id) && a.practice_mentor_id !== me.id) return;
      out.queue.push({ enrollmentId: enr.id, trainee: u.name, outlet: u.outlet, curriculum: c.name, stage: (d.stages.find(x => x.id === act.stage_id) || {}).name,
        id: act.id, assignmentId: a.id, name: act.name, chosen: a.practice_mentor_id === me.id, ...dueInfo(a) });
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

// Trainee memilih mentor/trainer pendamping untuk aktivitas praktik (boleh diganti sampai lulus).
export function practiceMentorSet(d, me, { assignmentId, mentorId }) {
  const a = d.assignments.find(x => x.id === assignmentId) || fail('Tugas tidak ditemukan.');
  const enr = enrollmentOr404(d, me, a.enrollment_id);
  if (enr.user_id !== me.id) fail('Hanya trainee yang bisa memilih pendamping praktiknya.');
  const act = d.activities.find(x => x.id === a.activity_id);
  if (!act || act.rule !== 'MENTOR_PASSED') fail('Aktivitas ini bukan praktik yang dinilai mentor.');
  if (enr.status !== 'Active' || a.status !== 'Assigned' || a.practical_status === 'PASSED') fail('Pendamping tidak bisa diubah untuk aktivitas ini.');
  const m = mentorId ? (practiceOptions(d, enr, act).find(x => x.id === mentorId) || fail('Mentor/trainer ini tidak tersedia untuk kurikulum ini.')) : null;
  a.practice_mentor_id = m ? m.id : null;
  return { stmts: [update('assignments', a.id, { practice_mentor_id: a.practice_mentor_id }), audit(me.email, 'PRACTICE_MENTOR', a.id, m ? m.id : '')],
    result: { mentor: m } };
}

/* ---------- kuis bawaan (pengganti Google Form) ---------- */
function quizContext(d, me, { assignmentId, resourceId }) {
  const a = d.assignments.find(x => x.id === assignmentId) || fail('Tugas tidak ditemukan.');
  const enr = enrollmentOr404(d, me, a.enrollment_id);
  if (enr.user_id !== me.id) fail('Hanya trainee yang bisa mengerjakan test ini.');
  const act = d.activities.find(x => x.id === a.activity_id);
  const r = activityRes(d, act.id).find(x => x.id === resourceId && isTest(x.kind)) || fail('Test tidak ditemukan.');
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

/* ---------- Documents (dulu: SOP) ----------
   Semua materi aktif dari perpustakaan (SOP, modul training, dokumen, IT Support Tools), disaring
   per jabatan pengguna. Pengaturan jabatan hanya berlaku di sini; akses lewat pembelajaran
   tetap mengikuti pendaftaran & aturan buka aktivitas. */
const positionOf = (d, u) => d.positions.find(p => same(p.name, u.job));
function usageOf(d, r) {
  const ids = r.parent_id ? [r.parent_id, r.id] : [r.id];
  return d.resource_links.filter(l => ids.includes(l.resource_id)).map(l => {
    const act = l.activity_id && d.activities.find(x => x.id === l.activity_id);
    const stage = d.stages.find(x => x.id === (l.stage_id || act?.stage_id));
    const cur = d.curricula.find(x => x.id === (l.curriculum_id || stage?.curriculum_id));
    return { linkId: l.id, activityId: act?.id || '', label: [cur?.name, stage?.name, act?.name].filter(Boolean).join(' › ') };
  }).filter(x => x.label);
}

export function documents(d, me) {
  const admin = has(me, 'ADMIN');
  const u = d.users.find(x => x.id === me.id) || {};
  const pos = positionOf(d, u);
  const posName = id => d.positions.find(p => p.id === id)?.name;
  return {
    admin, position: pos?.name || u.job || '',
    items: d.resources.filter(r => r.active && !isTest(r.kind)).filter(r => {
      const allowed = arr(r.positions);
      return admin || !allowed.length || (pos && allowed.includes(pos.id));
    }).sort((a, b) => a.title.localeCompare(b.title)).map(r => {
      const used = usageOf(d, r);
      return { id: r.id, title: r.title, url: r.url, kind: r.kind, category: r.category || 'DOCUMENT',
        scope: used.length ? used[0].label.split(' › ')[0] + (used.length > 1 ? ' +' + (used.length - 1) : '') : 'Umum',
        visibleTo: arr(r.positions).map(posName).filter(Boolean) };
    }),
  };
}

/* ---------- modul yang sudah dipelajari (trainee) ---------- */
export function learnedModules(d, me) {
  const out = [];
  d.enrollments.filter(e => e.user_id === me.id).forEach(enr => {
    const c = d.curricula.find(x => x.id === enr.curriculum_id) || {};
    assignmentsOf(d, enr.id).filter(a => a.status === 'Completed').forEach(a => {
      const act = d.activities.find(x => x.id === a.activity_id);
      if (!act) return;
      const st = d.stages.find(x => x.id === act.stage_id) || {};
      activityRes(d, act.id).filter(r => !isTest(r.kind)).forEach(r => out.push({
        key: a.id + ':' + r.id, id: r.id, title: r.title, url: r.url, kind: r.kind, category: r.category || 'DOCUMENT',
        enrollmentId: enr.id, curriculum: c.name, stage: st.name, activity: act.name, activityId: act.id,
        completedAt: a.completed_at, pre: a.pre_score, post: a.post_score, passed: !!a.post_passed,
      }));
    });
  });
  return out.sort((x, y) => String(y.completedAt).localeCompare(String(x.completedAt)));
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
    // Mentor per kurikulum berasal dari Master Mentor (kewenangan membimbing).
    curricula: d.curricula.filter(c => c.active && !taken.has(c.id) && stagesOf(d, c.id).length)
      .map(c => ({ id: c.id, name: c.name, mentors: mentorCandidates(d, c.id).filter(m => m.id !== u.id) })),
    taken: d.curricula.filter(c => taken.has(c.id)).map(c => c.name),
  };
}

export function enrollmentCreate(d, me, { employeeId, curriculumId, mentorId, preview }) {
  const opt = enrollmentOptions(d, me, { employeeId });
  const c = opt.curricula.find(x => x.id === curriculumId) || fail('Kurikulum tidak tersedia untuk karyawan ini.');
  if (!c.mentors.length) fail('Belum ada mentor yang berwenang untuk kurikulum ' + c.name + '. Tambahkan di Master Data → Mentor & Trainer.');
  const m = c.mentors.find(x => x.id === mentorId) || fail('Pilih mentor yang berwenang untuk kurikulum ini.');
  const first = stagesOf(d, c.id)[0];
  const acts = activitiesOfStage(d, first.id);
  if (!acts.length) fail('Stage pertama kurikulum ini belum punya aktivitas.');
  const enrId = 'ENR_' + opt.employee.id + '_' + c.id;
  const summaryOut = { enrollmentId: enrId, employee: opt.employee, curriculum: { id: c.id, name: c.name }, mentor: m, stage: first.name, newAssignments: acts.length };
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
  const assigned = new Map();
  d.assignments.forEach(a => assigned.set(a.activity_id, (assigned.get(a.activity_id) || 0) + 1));
  const resTitle = id => d.resources.find(r => r.id === id);
  return {
    rules: RULES,
    curricula: d.curricula.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => ({
      ...c, enrollments: d.enrollments.filter(e => e.curriculum_id === c.id).length,
      stages: d.stages.filter(s => s.curriculum_id === c.id).sort(bySeq).map(s => {
        const acts = d.activities.filter(a => a.stage_id === s.id).sort(bySeq).map(a => ({
          ...a, mentor_ids: arr(a.mentor_ids), assigned: assigned.get(a.id) || 0,
          resources: linksOf(d, 'activity_id', a.id).map(l => resTitle(l.resource_id)).filter(Boolean)
            .map(r => ({ id: r.id, title: r.title, kind: r.kind, active: !!r.active })),
        }));
        return { ...s, activities: acts, assigned: acts.reduce((n, a) => n + a.assigned, 0) };
      }),
    })),
    // Perpustakaan materi untuk dipilih di form aktivitas (test yang menempel ikut induknya).
    library: d.resources.filter(r => r.active && !(r.parent_id && isTest(r.kind))).sort((a, b) => a.title.localeCompare(b.title))
      .map(r => ({ id: r.id, title: r.title, kind: r.kind, category: r.category || 'DOCUMENT',
        tests: d.resources.filter(k => k.parent_id === r.id && k.active && isTest(k.kind)).map(k => k.kind) })),
    mentors: d.mentors.filter(m => m.active).map(m => ({ m, u: d.users.find(u => u.id === m.user_id && u.active) })).filter(x => x.u)
      .map(({ m, u }) => ({ id: u.id, name: u.name, job: u.job, outlet: u.outlet, curricula: arr(m.curricula) })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/* ---------- hapus kurikulum / stage / aktivitas ----------
   Hanya bila belum ada peserta yang memakainya; kalau sudah dipakai, nonaktifkan saja supaya
   riwayat belajar & sertifikat tidak hilang. */
function dropActivities(d, acts, stmts) {
  const ids = new Set(acts.map(a => a.id));
  d.resource_links.filter(l => ids.has(l.activity_id)).forEach(l => stmts.push({ sql: 'DELETE FROM resource_links WHERE id = ?', args: [l.id] }));
  d.activities.filter(a => !ids.has(a.id) && ids.has(a.prerequisite_id)).forEach(a => stmts.push(update('activities', a.id, { prerequisite_id: null })));
  acts.forEach(a => stmts.push({ sql: 'DELETE FROM activities WHERE id = ?', args: [a.id] }));
}
const usedBy = (d, acts) => { const ids = new Set(acts.map(a => a.id)); return d.assignments.filter(a => ids.has(a.activity_id)).length; };

export function curriculumDelete(d, me, { id }) {
  need(me, 'SUPER_ADMIN');
  const c = d.curricula.find(x => x.id === id) || fail('Kurikulum tidak ditemukan.');
  const n = d.enrollments.filter(e => e.curriculum_id === c.id).length;
  if (n) fail(`Kurikulum ${c.name} sudah dipakai ${n} pendaftaran, jadi tidak bisa dihapus. Nonaktifkan saja (Ubah → hilangkan centang Aktif).`);
  const stages = d.stages.filter(s => s.curriculum_id === c.id), sIds = new Set(stages.map(s => s.id));
  const stmts = [];
  dropActivities(d, d.activities.filter(a => sIds.has(a.stage_id)), stmts);
  d.resource_links.filter(l => sIds.has(l.stage_id) || l.curriculum_id === c.id).forEach(l => stmts.push({ sql: 'DELETE FROM resource_links WHERE id = ?', args: [l.id] }));
  stages.forEach(s => stmts.push({ sql: 'DELETE FROM stages WHERE id = ?', args: [s.id] }));
  d.mentors.filter(m => arr(m.curricula).includes(c.id)).forEach(m => stmts.push({ sql: 'UPDATE mentors SET curricula = ? WHERE user_id = ?', args: [JSON.stringify(arr(m.curricula).filter(x => x !== c.id)), m.user_id] }));
  stmts.push({ sql: 'DELETE FROM curricula WHERE id = ?', args: [c.id] }, audit(me.email, 'CURRICULUM_DELETE', c.id, c.name));
  return { stmts, result: { ok: true } };
}

export function stageDelete(d, me, { id }) {
  need(me, 'SUPER_ADMIN');
  const s = d.stages.find(x => x.id === id) || fail('Stage tidak ditemukan.');
  const acts = d.activities.filter(a => a.stage_id === s.id);
  const n = usedBy(d, acts);
  if (n) fail(`Stage ${s.name} sudah berisi ${n} tugas peserta, jadi tidak bisa dihapus. Nonaktifkan saja.`);
  const stmts = [];
  dropActivities(d, acts, stmts);
  d.resource_links.filter(l => l.stage_id === s.id).forEach(l => stmts.push({ sql: 'DELETE FROM resource_links WHERE id = ?', args: [l.id] }));
  stmts.push({ sql: 'DELETE FROM stages WHERE id = ?', args: [s.id] }, audit(me.email, 'STAGE_DELETE', s.id, s.name));
  return { stmts, result: { ok: true } };
}

export function activityDelete(d, me, { id }) {
  need(me, 'SUPER_ADMIN');
  const a = d.activities.find(x => x.id === id) || fail('Aktivitas tidak ditemukan.');
  const acts = [a, ...d.activities.filter(x => x.parent_id === a.id)];
  const n = usedBy(d, acts);
  if (n) fail(`Aktivitas ${a.name} sudah dipakai ${n} peserta, jadi tidak bisa dihapus. Nonaktifkan saja.`);
  const stmts = [];
  dropActivities(d, acts, stmts);
  stmts.push(audit(me.email, 'ACTIVITY_DELETE', a.id, a.name + (acts.length > 1 ? ' (+' + (acts.length - 1) + ' sub)' : '')));
  return { stmts, result: { ok: true, removed: acts.length } };
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
  // Materi dari perpustakaan (urutan = urutan tampil). Test yang menempel ikut induknya.
  const resIds = Array.isArray(p.resources) ? [...new Set(p.resources.map(String))] : null;
  const picked = (resIds || []).map(rid => d.resources.find(r => r.id === rid) || fail('Materi ' + rid + ' tidak ditemukan.'));
  if (picked.some(r => r.parent_id && isTest(r.kind))) fail('Pre/post-test yang menempel ke modul ikut otomatis; pilih modul/SOP induknya.');
  const tests = resIds ? picked.flatMap(r => [r, ...d.resources.filter(k => k.parent_id === r.id && k.active)]).filter(r => r.active && isTest(r.kind)) : [];
  // Mentor/trainer yang boleh mendampingi praktik ini (dari Master Mentor).
  const mentorList = p.rule === 'MENTOR_PASSED' && Array.isArray(p.mentor_ids) ? [...new Set(p.mentor_ids.map(String))] : [];
  mentorList.forEach(mid => d.mentors.some(m => m.user_id === mid && m.active) || fail('Mentor ' + mid + ' tidak ada di Master Mentor.'));
  const row = {
    id, stage_id: stageId, parent_id: p.parent_id || null, name, seq, rule: p.rule,
    required_for_stage: bool(p.required_for_stage ?? 1), required_for_parent: bool(p.required_for_parent ?? 1),
    pre_required: bool(p.pre_required || tests.some(t => t.kind === 'PRE_TEST')), post_required: bool(p.post_required || tests.some(t => t.kind === 'POST_TEST')),
    passing_score: Math.min(100, Math.max(0, Number(p.passing_score ?? 70))), prerequisite_id: p.prerequisite_id || null,
    due_days: p.due_days ? Number(p.due_days) : null, mentor_ids: JSON.stringify(mentorList), active: bool(p.active ?? 1),
  };
  const stmts = [ex ? update('activities', id, row) : insert('activities', row), audit(me.email, 'ACTIVITY_SAVE', id)];
  if (resIds) {
    stmts.push({ sql: 'DELETE FROM resource_links WHERE activity_id = ?', args: [id] });
    picked.forEach((r, i) => stmts.push(insert('resource_links', { id: uid('RL'), resource_id: r.id, activity_id: id, stage_id: null, curriculum_id: null, seq: i + 1 })));
  }
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
    positions: d.positions.filter(p => p.active).map(p => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name)),
    resources: d.resources.map(r => {
      const used = usageOf(d, r);
      const curIds = [...new Set(used.map(u => d.stages.find(s => s.id === d.activities.find(a => a.id === u.activityId)?.stage_id)?.curriculum_id).filter(Boolean))];
      return { id: r.id, kind: r.kind, category: r.category || 'DOCUMENT', title: r.title, url: r.url, parent_id: r.parent_id || '', seq: r.seq,
        active: !!r.active, positions: arr(r.positions), usage: used.map(u => u.label), curricula: curIds,
        questions: d.quiz_questions.filter(q => q.resource_id === r.id).length };
    }),
  };
}

// Materi = item perpustakaan; tidak perlu dikaitkan ke kurikulum di sini (pengaitan lewat halaman Kurikulum).
export function contentSave(d, me, p) {
  need(me, 'SUPER_ADMIN');
  const ex = p.id && d.resources.find(r => r.id === p.id);
  if (ex && p.onlyActive) {
    const stmts = [update('resources', ex.id, { active: bool(p.active) })];
    if (!p.active) d.resources.filter(r => r.parent_id === ex.id).forEach(k => stmts.push(update('resources', k.id, { active: 0 })));
    stmts.push(audit(me.email, p.active ? 'CONTENT_ON' : 'CONTENT_OFF', ex.id));
    return { stmts, result: { id: ex.id } };
  }
  const kind = KINDS.includes(p.kind) ? p.kind : fail('Format materi tidak dikenal.');
  if (ex && isTest(ex.kind) !== isTest(kind)) fail('Materi tidak bisa diubah menjadi test (atau sebaliknya).');
  if (ex && isTest(kind) && ex.kind !== kind) fail('Jenis test tidak bisa diubah setelah dibuat.');
  const title = String(p.title || '').trim() || fail('Judul wajib diisi.');
  const url = String(p.url || '').trim();
  if (!isTest(kind) && !/^https?:\/\//i.test(url)) fail('Link materi harus diawali http:// atau https://');
  const category = categoryOf(kind);
  const positions = isTest(kind) ? [] : [...new Set((Array.isArray(p.positions) ? p.positions : []).map(String))];
  positions.forEach(pid => d.positions.some(x => x.id === pid) || fail('Jabatan ' + pid + ' tidak ada di Kelola Jabatan.'));
  let parent = null;
  if (isTest(kind) && p.parent_id) {
    parent = d.resources.find(r => r.id === p.parent_id && !isTest(r.kind)) || fail('Modul/SOP induk tidak ditemukan.');
    const twin = d.resources.find(r => r.parent_id === parent.id && r.kind === kind && r.active && r.id !== ex?.id);
    if (twin) fail(parent.title + ' sudah punya ' + (kind === 'PRE_TEST' ? 'pre-test' : 'post-test') + ': ' + twin.title + '.');
  }
  const id = ex ? ex.id : 'RES_' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const row = { id, kind, category, positions: JSON.stringify(positions), title, url: isTest(kind) ? '' : url,
    activity_id: null, stage_id: null, curriculum_id: null, parent_id: parent ? parent.id : (ex && isTest(kind) ? ex.parent_id : null),
    seq: Number(p.seq) || 1, active: bool(p.active ?? 1) };
  const stmts = [ex ? update('resources', id, row) : insert('resources', row), audit(me.email, 'CONTENT_SAVE', id)];
  // Test yang menempel ke modul mewajibkan aktivitas yang memakai modul itu (pre/post_required).
  if (isTest(kind) && row.active && row.parent_id) {
    const flag = kind === 'PRE_TEST' ? 'pre_required' : 'post_required';
    const actIds = new Set(d.resource_links.filter(l => l.resource_id === row.parent_id && l.activity_id).map(l => l.activity_id));
    d.activities.filter(a => actIds.has(a.id) && !a[flag]).forEach(a => { a[flag] = 1; stmts.push(update('activities', a.id, { [flag]: 1 })); });
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
  // Jabatan & outlet dipilih dari master; nilai lama yang belum ada di master tetap boleh dipertahankan.
  if (row.job && !d.positions.some(x => same(x.name, row.job)) && !(ex && same(ex.job, row.job))) fail('Jabatan ' + row.job + ' tidak ada di Kelola Jabatan.');
  if (row.outlet && !d.outlets.some(x => same(x.name, row.outlet)) && !(ex && same(ex.outlet, row.outlet))) fail('Outlet ' + row.outlet + ' tidak ada di Kelola Outlet.');
  return { stmts: [ex ? update('users', id, row) : insert('users', row), audit(me.email, 'USER_SAVE', id, role)], result: row };
}

/* ---------- master data: jabatan, outlet, mentor & trainer ---------- */
export function masterData(d, me) {
  need(me, 'SUPER_ADMIN');
  const count = (key, name) => d.users.filter(u => same(u[key], name)).length;
  return {
    positions: d.positions.map(p => ({ id: p.id, name: p.name, active: !!p.active, users: count('job', p.name),
      documents: d.resources.filter(r => arr(r.positions).includes(p.id)).length })).sort((a, b) => a.name.localeCompare(b.name)),
    outlets: d.outlets.map(o => ({ id: o.id, name: o.name, location: o.location, active: !!o.active, users: count('outlet', o.name) })).sort((a, b) => a.name.localeCompare(b.name)),
    mentors: d.mentors.map(m => {
      const u = d.users.find(x => x.id === m.user_id) || { id: m.user_id, name: m.user_id };
      return { id: u.id, name: u.name, job: u.job, outlet: u.outlet, userActive: !!u.active, active: !!m.active, curricula: arr(m.curricula),
        mentees: d.mentor_assignments.filter(x => x.mentor_id === u.id && x.active).length };
    }).sort((a, b) => a.name.localeCompare(b.name)),
    users: d.users.filter(u => u.active).map(u => ({ id: u.id, name: u.name, job: u.job, outlet: u.outlet })).sort((a, b) => a.name.localeCompare(b.name)),
    curricula: d.curricula.map(c => ({ id: c.id, name: c.name, active: !!c.active })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function positionSave(d, me, p) {
  need(me, 'SUPER_ADMIN');
  const name = String(p.name || '').trim() || fail('Nama jabatan wajib diisi.');
  const ex = p.id && d.positions.find(x => x.id === p.id);
  if (d.positions.some(x => same(x.name, name) && x.id !== ex?.id)) fail('Jabatan ' + name + ' sudah ada.');
  const row = { id: ex ? ex.id : slugId('POS', name + ':' + Date.now()), name, active: bool(p.active ?? 1) };
  const stmts = [ex ? update('positions', row.id, row) : insert('positions', row), audit(me.email, 'POSITION_SAVE', row.id, name)];
  // Ganti nama → jabatan di data pengguna ikut diganti.
  if (ex && ex.name !== name) stmts.push({ sql: 'UPDATE users SET job = ? WHERE job = ? COLLATE NOCASE', args: [name, ex.name] });
  return { stmts, result: row };
}

export function positionDelete(d, me, { id }) {
  need(me, 'SUPER_ADMIN');
  const x = d.positions.find(p => p.id === id) || fail('Jabatan tidak ditemukan.');
  const n = d.users.filter(u => same(u.job, x.name)).length;
  if (n) fail(`Jabatan ${x.name} masih dipakai ${n} pengguna. Ganti jabatan mereka dulu, atau nonaktifkan jabatan ini.`);
  const stmts = d.resources.filter(r => arr(r.positions).includes(x.id))
    .map(r => update('resources', r.id, { positions: JSON.stringify(arr(r.positions).filter(v => v !== x.id)) }));
  stmts.push({ sql: 'DELETE FROM positions WHERE id = ?', args: [x.id] }, audit(me.email, 'POSITION_DELETE', x.id, x.name));
  return { stmts, result: { ok: true } };
}

export function outletSave(d, me, p) {
  need(me, 'SUPER_ADMIN');
  const name = String(p.name || '').trim() || fail('Nama outlet wajib diisi.');
  const ex = p.id && d.outlets.find(x => x.id === p.id);
  if (d.outlets.some(x => same(x.name, name) && x.id !== ex?.id)) fail('Outlet ' + name + ' sudah ada.');
  const row = { id: ex ? ex.id : slugId('OUT', name + ':' + Date.now()), name, location: String(p.location || '').trim(), active: bool(p.active ?? 1) };
  const stmts = [ex ? update('outlets', row.id, row) : insert('outlets', row), audit(me.email, 'OUTLET_SAVE', row.id, name)];
  if (ex && ex.name !== name) stmts.push({ sql: 'UPDATE users SET outlet = ? WHERE outlet = ? COLLATE NOCASE', args: [name, ex.name] });
  return { stmts, result: row };
}

export function outletDelete(d, me, { id }) {
  need(me, 'SUPER_ADMIN');
  const x = d.outlets.find(o => o.id === id) || fail('Outlet tidak ditemukan.');
  const n = d.users.filter(u => same(u.outlet, x.name)).length;
  if (n) fail(`Outlet ${x.name} masih dipakai ${n} pengguna. Pindahkan mereka dulu, atau nonaktifkan outlet ini.`);
  return { stmts: [{ sql: 'DELETE FROM outlets WHERE id = ?', args: [x.id] }, audit(me.email, 'OUTLET_DELETE', x.id, x.name)], result: { ok: true } };
}

export function mentorSave(d, me, p) {
  need(me, 'SUPER_ADMIN');
  const u = d.users.find(x => x.id === p.userId) || fail('Pilih pengguna yang akan dijadikan mentor/trainer.');
  const curricula = [...new Set((Array.isArray(p.curricula) ? p.curricula : []).map(String))];
  curricula.forEach(cid => d.curricula.some(c => c.id === cid) || fail('Kurikulum ' + cid + ' tidak ditemukan.'));
  if (!curricula.length) fail('Pilih minimal satu kurikulum yang boleh dibimbing.');
  const ex = d.mentors.find(m => m.user_id === u.id);
  if (p.isNew && ex) fail(u.name + ' sudah ada di daftar mentor & trainer.');
  const row = { user_id: u.id, curricula: JSON.stringify(curricula), active: bool(p.active ?? 1) };
  return { stmts: [ex ? { sql: 'UPDATE mentors SET curricula = ?, active = ? WHERE user_id = ?', args: [row.curricula, row.active, u.id] } : insert('mentors', row),
    audit(me.email, 'MENTOR_SAVE', u.id, curricula.join(','))], result: { id: u.id } };
}

export function mentorDelete(d, me, { userId }) {
  need(me, 'SUPER_ADMIN');
  const m = d.mentors.find(x => x.user_id === userId) || fail('Mentor tidak ditemukan.');
  // Pendaftaran yang sudah berjalan tetap memakai mentornya; hanya tidak bisa dipilih lagi.
  const stmts = d.activities.filter(a => arr(a.mentor_ids).includes(userId))
    .map(a => update('activities', a.id, { mentor_ids: JSON.stringify(arr(a.mentor_ids).filter(v => v !== userId)) }));
  stmts.push({ sql: 'DELETE FROM mentors WHERE user_id = ?', args: [m.user_id] }, audit(me.email, 'MENTOR_DELETE', m.user_id));
  return { stmts, result: { ok: true } };
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
  const needTest = d.activities.filter(a => {
    if (!a.active) return false;
    const kinds = activityRes(d, a.id).map(r => r.kind);
    return (a.pre_required && !kinds.includes('PRE_TEST')) || (a.post_required && !kinds.includes('POST_TEST'));
  }).map(a => a.name);
  if (needTest.length) add('error', 'Materi', needTest.length + ' aktivitas mewajibkan test yang belum ada', sample(needTest));
  const curOfAct = a => d.stages.find(s => s.id === a.stage_id)?.curriculum_id;
  const noMentorPractice = d.activities.filter(a => a.active && a.rule === 'MENTOR_PASSED' && !mentorCandidates(d, curOfAct(a)).length).map(a => a.name);
  if (noMentorPractice.length) add('warn', 'Mentor', noMentorPractice.length + ' praktik tanpa mentor/trainer berwenang', 'Trainee tidak bisa memilih pendamping. Atur di Master Data → Mentor & Trainer: ' + sample(noMentorPractice));
  const noJob = d.users.filter(u => u.active && u.job && !d.positions.some(p => same(p.name, u.job))).map(u => u.name);
  if (noJob.length) add('warn', 'Data', noJob.length + ' pengguna dengan jabatan di luar Kelola Jabatan', sample(noJob));
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
