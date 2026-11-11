'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Icon, Pill, Notice, Progress, initials, fmtDate, fmtDateTime, pct, useApi, api, toast } from '@/components/ui';
import { ResList, ActionButtons, DueChip, BackLink } from '@/components/lms';
import { useShell, useCrumbs } from '@/components/Shell';

const THEORY = { NOT_STARTED: 'Belum dikonfirmasi', ACKNOWLEDGED: 'Sudah dipahami' };
const PRACTICAL = { PENDING: 'Menunggu penilaian mentor', PASSED: 'Lulus praktik', REDO: 'Perlu ulang praktik' };
const RULE_HINT = {
  SELF_CONFIRMED: 'Kerjakan aktivitas ini, lalu tekan "Tandai selesai".',
  ACKNOWLEDGED: 'Baca materinya, lalu konfirmasi bahwa kamu sudah paham.',
  MENTOR_PASSED: 'Lakukan praktik; mentor akan menilai langsung.',
  PRE_SUBMITTED_AND_POST_PASSED: 'Kerjakan pre-test, pelajari materi, lalu lulus post-test.',
  ALL_REQUIRED_CHILDREN: 'Selesaikan semua sub-aktivitas di bawahnya.',
};
const has = v => v !== '' && v !== null && v !== undefined;

function Ring({ percent }) {
  const r = 38, c = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg width="92" height="92" viewBox="0 0 92 92"><circle cx="46" cy="46" r={r} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="8" />
        <circle cx="46" cy="46" r={r} fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} /></svg>
      <b>{percent}%</b>
    </div>);
}

function History({ items }) {
  if (!items || !items.length) return null;
  let n = 0;
  return (
    <details className="hist"><summary>Riwayat test ({items.length})</summary>
      <ul>{items.map((x, i) => (
        <li key={i}><b>{x.type === 'PRE_TEST' ? 'Pre-test' : 'Post-test #' + (++n)}</b><span className="score">{pct(x.score)}</span>
          {x.type === 'POST_TEST' ? <Pill label={x.passed ? 'Lulus' : 'Remedial'} cls={x.passed ? 'go' : 'red'} /> : null}
          <span className="muted">{fmtDateTime(x.at)}</span></li>))}</ul>
    </details>);
}

// Pendamping praktik: trainee memilih mentor/trainer yang bertugas pada hari praktik.
function PracticeMentor({ a, onDone }) {
  const [busy, setBusy] = useState(false);
  const choose = async mentorId => {
    setBusy(true);
    try {
      const r = await api('practiceMentorSet', { assignmentId: a.assignmentId, mentorId });
      toast(r.mentor ? 'Pendamping praktik: ' + r.mentor.name : 'Pendamping praktik dihapus'); onDone && onDone();
    } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  };
  if (!a.mentorOptions) return a.practiceMentor ? <div className="act-meta"><span><span className="k">Pendamping praktik: </span><b>{a.practiceMentor.name}</b></span></div> : null;
  return (
    <div className="practice-pick">
      <label className="f" htmlFor={'pm-' + a.id} style={{ marginTop: 0 }}>Mentor/trainer pendamping praktik</label>
      {a.mentorOptions.length ? <>
        <select id={'pm-' + a.id} className="input" disabled={busy} value={a.practiceMentor?.id || ''} onChange={e => choose(e.target.value)}>
          <option value="">— Pilih pendamping —</option>
          {a.mentorOptions.map(m => <option key={m.id} value={m.id}>{m.name}{[m.job, m.outlet].filter(Boolean).length ? ' — ' + [m.job, m.outlet].filter(Boolean).join(' · ') : ''}</option>)}
        </select>
        <div className="small muted" style={{ marginTop: 4 }}>{a.practiceMentor ? <>Pendamping: <b>{a.practiceMentor.name}</b>. Bisa diganti sampai praktik dinyatakan lulus.</> : 'Pilih mentor/trainer yang bertugas pada hari kamu praktik. Ia bisa menilai praktik ini.'}</div>
      </> : <div className="small muted">Belum ada mentor/trainer yang tersedia untuk praktik ini. Hubungi admin.</div>}
    </div>);
}

function ActCard({ a, onDone }) {
  const st = a.status === 'Completed' ? 'done' : a.status === 'Assigned' ? 'open' : 'locked';
  const hasTest = a.preRequired || a.postRequired || has(a.pre) || has(a.post);
  const hint = st === 'locked' ? 'Terbuka setelah aktivitas sebelumnya selesai.'
    : st === 'done' ? 'Selesai' + (a.completedAt ? ' · ' + fmtDate(a.completedAt) : '')
    : a.hint || RULE_HINT[a.rule] || '';
  const meta = [
    st === 'open' ? <DueChip key="due" a={a} /> : null,
    hasTest && has(a.pre) ? <span key="pre"><span className="k">Pre-test </span><b className="score">{pct(a.pre)}</b></span> : null,
    hasTest && has(a.post) ? <span key="post"><span className="k">Post-test </span><b className="score">{pct(a.post)}</b> <Pill label={a.passed ? 'Lulus' : 'Remedial'} cls={a.passed ? 'go' : 'red'} /></span> : null,
    a.postRequired && st === 'open' && !a.passed ? <span key="pass"><span className="k">Nilai lulus </span><b>{a.passing}</b></span> : null,
    a.rule === 'MENTOR_PASSED' && PRACTICAL[a.practical] && st !== 'locked' ? <span key="pr"><span className="k">Praktik: </span><b>{PRACTICAL[a.practical]}</b></span> : null,
    a.rule === 'ACKNOWLEDGED' && THEORY[a.theory] && st !== 'locked' ? <span key="th"><span className="k">Teori: </span><b>{THEORY[a.theory]}</b></span> : null,
  ].filter(Boolean);
  return (
    <div className={'act ' + st + (a.parent ? ' child' : '')} id={'act-' + a.id}>
      <div className="ai" aria-hidden="true"><Icon name={st === 'done' ? 'check' : st === 'open' ? 'play' : 'lock'} /></div>
      <div style={{ minWidth: 0 }}>
        <div className="act-title"><span>{a.name}</span><Pill status={a.status} /></div>
        {hint ? <div className="act-hint">{hint}</div> : null}
        {meta.length ? <div className="act-meta">{meta}</div> : null}
        <ResList list={a.resources} assignmentId={a.assignmentId} />
        {a.rule === 'MENTOR_PASSED' && st !== 'locked' ? <PracticeMentor a={a} onDone={onDone} /> : null}
        <ActionButtons a={a} onDone={onDone} />
        <History items={a.history} />
      </div>
    </div>);
}

function focusAct(id) {
  const el = document.getElementById('act-' + id);
  if (!el) return;
  const st = el.closest('details'); if (st) st.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

export default function EnrollmentPage() {
  const { id } = useParams();
  const { me, lastList } = useShell();
  const enrollmentId = decodeURIComponent(id);
  const { data: d, error, reload } = useApi('enrollmentDetail', { id: enrollmentId });
  const [focus] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(location.search).get('focus') || '');
  const own = d && me.employeeId === d.trainee.id;
  useCrumbs([[lastList?.label || 'Beranda', lastList?.href || '/'], [d ? (own ? d.curriculum.name : d.trainee.name + ' · ' + d.curriculum.name) : 'Memuat…']]);
  useEffect(() => { if (d && focus) setTimeout(() => focusAct(focus), 50); }, [d, focus]);

  if (error) return <><BackLink /><Notice err>{error}</Notice></>;
  if (!d) return <><BackLink /><div className="card sk" style={{ height: 150 }} /><div className="card sk" style={{ height: 220, marginTop: 14 }} /></>;
  const acts = d.stages.flatMap(s => s.activities.map(a => ({ ...a, stage: s.name })));
  const next = acts.filter(a => a.status === 'Assigned').sort((x, y) => (y.overdue - x.overdue))[0];
  return (<>
    <BackLink />
    <div className="card hero">
      <div className="avatar lg">{initials(d.trainee.name)}</div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <h1>{d.trainee.name}</h1>
        <div className="sub">{d.curriculum.name}{[d.trainee.job, d.trainee.outlet].filter(Boolean).length ? ' · ' + [d.trainee.job, d.trainee.outlet].filter(Boolean).join(' · ') : ''}</div>
        <div className="facts">
          <div><b>{d.progress.done}/{d.progress.total}</b>Aktivitas selesai</div>
          <div><b>{d.currentStage || '–'}</b>Stage saat ini</div>
          <div><b>{fmtDate(d.startDate)}</b>Mulai</div>
        </div>
      </div>
      <Ring percent={d.progress.percent} />
    </div>
    {d.certificate ? (
      <div className="card cert" style={{ marginTop: 14 }}><div className="avatar"><Icon name="award" /></div>
        <div style={{ flex: 1 }}><h2>Selamat! Kurikulum selesai 🎉</h2><div className="small muted">{d.curriculum.name} · No. {d.certificate.id} · {fmtDate(d.certificate.issuedAt)}</div></div>
        <Link className="btn primary" href={'/certificate/' + encodeURIComponent(d.enrollmentId)} target="_blank"><Icon name="download" />Lihat & unduh sertifikat</Link>
      </div>) : null}
    {next && !d.finished ? (
      <div className={'card task' + (next.overdue ? ' late' : '')} style={{ marginTop: 14 }}>
        <div className="ti"><Icon name="play" /></div>
        <div style={{ minWidth: 0 }}><div className="small muted" style={{ fontWeight: 700 }}>{own ? 'LANGKAH BERIKUTNYA' : 'AKTIVITAS BERJALAN'}</div>
          <h3>{next.name}</h3><div className="meta"><span>{next.stage}</span><DueChip a={next} /></div></div>
        <div className="go"><button className="btn primary" onClick={() => focusAct(next.id)}>{own ? 'Kerjakan' : 'Lihat'}</button></div>
      </div>) : null}
    {d.resources.length ? <div className="card" style={{ marginTop: 14 }}><h2>Materi & SOP kurikulum</h2><ResList list={d.resources} /></div> : null}
    <div style={{ marginTop: 14 }}>
      {d.stages.length ? d.stages.map((s, i) => {
        const openIt = s.status === 'IN_PROGRESS' || (focus && s.activities.some(a => a.id === focus)) || (d.finished && i === d.stages.length - 1);
        return (
          <details key={s.id} className={'stage' + (s.status === 'NOT_OPEN' ? ' locked' : '')} open={openIt || undefined}>
            <summary>
              <div className={'dot ' + s.status}>{s.status === 'DONE' ? <Icon name="check" /> : s.status === 'NOT_OPEN' ? <Icon name="lock" /> : s.sequence}</div>
              <div style={{ minWidth: 0 }}><div className="small muted" style={{ fontWeight: 700 }}>STAGE {s.sequence}</div><h2>{s.name}</h2>
                <div className="small muted">{s.status === 'NOT_OPEN' ? 'Terbuka setelah stage sebelumnya selesai' : s.done + ' dari ' + s.total + ' aktivitas selesai'}{d.mentors.length ? ' · Mentor: ' + d.mentors.join(', ') : ''}</div></div>
              <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><Pill status={s.status} /><span className="chev"><Icon name="chev" /></span></div>
            </summary>
            <div className="stage-body">
              {s.total && s.status !== 'NOT_OPEN' ? <div style={{ marginBottom: 6 }}><Progress value={Math.round(s.done / s.total * 100)} /></div> : null}
              <ResList list={s.resources} />
              {s.activities.length ? s.activities.map(a => <ActCard key={a.id} a={a} onDone={reload} />)
                : <p className="muted small">Aktivitas stage ini dibuat otomatis setelah stage sebelumnya selesai.</p>}
            </div>
          </details>);
      }) : <Notice err>Kurikulum ini belum punya stage aktif.</Notice>}
    </div>
  </>);
}
