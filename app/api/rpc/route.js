import { NextResponse } from 'next/server';
import { loadAll, write, update, audit } from '@/lib/db';
import { sessionUserId, hashPassword, verifyPassword, passwordProblem, tempPassword } from '@/lib/auth';
import * as L from '@/lib/lms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Aksi baca: (d, me, params) => data.
const READS = {
  me: (d, me) => me,
  home: L.home,
  myLearning: (d, me) => L.listFor(d, me, 'mine'),
  mentees: (d, me) => L.listFor(d, me, 'mentees'),
  allEnrollments: (d, me) => L.listFor(d, me, 'all'),
  enrollmentDetail: (d, me, p) => L.enrollmentDetail(d, me, p.id, d.extra[0] || []),
  documents: L.documents,
  learnedModules: L.learnedModules,
  masterData: L.masterData,
  dashboard: L.dashboard,
  enrollmentOptions: L.enrollmentOptions,
  quizGet: L.quizGet,
  certificate: L.certificate,
  curriculumTree: L.curriculumTree,
  contentCatalog: L.contentCatalog,
  quizQuestions: L.quizQuestions,
  usersList: L.usersList,
  health: L.health,
};
// Aksi tulis: (d, me, params) => { stmts, result }.
const WRITES = {
  activityAction: L.activityAction,
  quizSubmit: L.quizSubmit,
  enrollmentCreate: L.enrollmentCreate,
  curriculumSave: L.curriculumSave,
  stageSave: L.stageSave,
  activitySave: L.activitySave,
  curriculumDelete: L.curriculumDelete,
  stageDelete: L.stageDelete,
  activityDelete: L.activityDelete,
  practiceMentorSet: L.practiceMentorSet,
  positionSave: L.positionSave,
  positionDelete: L.positionDelete,
  outletSave: L.outletSave,
  outletDelete: L.outletDelete,
  mentorSave: L.mentorSave,
  mentorDelete: L.mentorDelete,
  contentSave: L.contentSave,
  quizQuestionsSave: L.quizQuestionsSave,
  userSave: L.userSave,
  changePassword: (d, me, p) => {
    const u = d.users.find(x => x.id === me.id);
    if (u.password_hash && !verifyPassword(String(p.current || ''), u.password_hash)) throw new L.UserError('Password lama salah.');
    const problem = passwordProblem(p.next);
    if (problem) throw new L.UserError(problem);
    return { stmts: [update('users', u.id, { password_hash: hashPassword(p.next) }), audit(me.email, 'PASSWORD_CHANGE', u.id)], result: { ok: true } };
  },
  passwordReset: (d, me, p) => {
    L.need(me, 'SUPER_ADMIN');
    const u = d.users.find(x => x.id === p.userId) || (() => { throw new L.UserError('Pengguna tidak ditemukan.'); })();
    const temp = tempPassword();
    return { stmts: [update('users', u.id, { password_hash: hashPassword(temp) }), audit(me.email, 'PASSWORD_RESET', u.id)], result: { email: u.email, temp } };
  },
};

export async function POST(req) {
  try {
    const { action, params = {} } = await req.json();
    const fn = READS[action] || WRITES[action];
    if (!fn) return NextResponse.json({ error: 'Aksi tidak dikenal: ' + action }, { status: 400 });
    const userId = await sessionUserId();
    if (!userId) return NextResponse.json({ error: 'Sesi berakhir. Silakan masuk lagi.', auth: true }, { status: 401 });
    const extra = action === 'enrollmentDetail'
      ? [{ sql: 'SELECT * FROM quiz_attempts WHERE assignment_id IN (SELECT id FROM assignments WHERE enrollment_id = ?)', args: [String(params.id || '')] }] : [];
    const d = await loadAll(extra);
    const me = L.meOf(d, userId);
    if (!me) return NextResponse.json({ error: 'Akun tidak aktif.', auth: true }, { status: 401 });
    if (READS[action]) return NextResponse.json({ data: await fn(d, me, params) });
    const { stmts, result } = fn(d, me, params);
    await write(stmts);
    return NextResponse.json({ data: result });
  } catch (e) {
    if (e instanceof L.UserError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: 'Terjadi kesalahan di server. Coba lagi sebentar lagi.' }, { status: 500 });
  }
}
