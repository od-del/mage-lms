'use client';
// Potongan UI LMS yang dipakai beberapa halaman: kartu pendaftaran, materi, tombol aksi, kartu tugas.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon, Pill, Progress, initials, fmtDate, api, toast, confirmBox, Modal, Busy } from './ui';
import { useShell } from './Shell';

export const RES_ICON = { MODULE: 'file', VIDEO: 'video', SOP: 'doc', PRE_TEST: 'clip', POST_TEST: 'clip' };
export const KIND_LABEL = { MODULE: 'Modul training', SOP: 'SOP', VIDEO: 'Video', PRE_TEST: 'Pre-test', POST_TEST: 'Post-test' };
export const isTest = k => k === 'PRE_TEST' || k === 'POST_TEST';

export function statusOf(e) {
  if (!e.active) return 'inactive';
  return e.finished ? 'done' : 'active';
}

export function EnrollmentCard({ e, showTrainee }) {
  const router = useRouter();
  const st = statusOf(e), open = () => router.push('/enrollment/' + encodeURIComponent(e.enrollmentId));
  return (
    <div className="card ecard" role="button" tabIndex={0} onClick={open} onKeyDown={ev => { if (ev.key === 'Enter') open(); }}>
      <div className="head">
        <div className="avatar">{showTrainee ? initials(e.trainee.name) : <Icon name="book" />}</div>
        <div><h3>{showTrainee ? e.trainee.name : e.curriculum.name}</h3>
          <div className="sub">{showTrainee ? e.curriculum.name + (e.trainee.outlet ? ' · ' + e.trainee.outlet : '') : e.enrollmentId}</div></div>
        {st === 'inactive' ? <Pill label={e.status || 'Nonaktif'} cls="lock" icon="lock" /> : st === 'done' ? <Pill status="DONE" /> : <Pill label="Aktif" cls="go" icon="play" />}
      </div>
      <div>
        <div className="row small" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="muted">{e.currentStage ? 'Stage: ' + e.currentStage : 'Belum ada stage terbuka'}</span><b>{e.progress.percent}%</b></div>
        <Progress value={e.progress.percent} />
      </div>
      <div className="foot"><span><b>{e.progress.done}/{e.progress.total}</b> aktivitas selesai</span><span style={{ color: 'var(--blue-700)', fontWeight: 600 }}>Lihat detail →</span></div>
    </div>);
}

// Satu materi: link biasa (tab baru) atau test bawaan (halaman kuis).
export function ResButton({ r, assignmentId }) {
  const cls = 'res' + (isTest(r.kind) ? ' test' : r.kind === 'SOP' ? ' sop' : '');
  if (r.locked) return <button className={cls} disabled title="Terkunci — selesaikan aktivitas sebelumnya"><Icon name="lock" /><span>{r.title}</span></button>;
  if (isTest(r.kind)) {
    const t = r.test || {};
    if (t.done) return <button className={cls} disabled title="Sudah dikerjakan"><Icon name="check" /><span>{r.title} · {t.score}%</span></button>;
    if (!t.available || !assignmentId) return <button className={cls} disabled title={t.reason || 'Belum bisa dikerjakan'}><Icon name="clip" /><span>{r.title}{t.reason ? ' — ' + t.reason : ''}</span></button>;
    return <Link className={cls} href={`/quiz/${encodeURIComponent(assignmentId)}/${encodeURIComponent(r.id)}`}><Icon name="clip" /><span>Mulai {r.title}</span></Link>;
  }
  return <a className={cls} href={r.url} target="_blank" rel="noopener noreferrer" title={r.title}><Icon name={RES_ICON[r.kind] || 'file'} /><span>{r.title}</span></a>;
}

// Pre/post-test ditampilkan menempel pada modul/SOP induknya.
export function ResList({ list, assignmentId }) {
  if (!list || !list.length) return null;
  const ids = new Set(list.map(r => r.id));
  const tops = list.filter(r => !r.parent || !ids.has(r.parent));
  return (
    <div className="res-list">{tops.map(r => {
      const kids = list.filter(c => c.parent === r.id);
      const order = kids.filter(k => k.kind === 'PRE_TEST').concat([r], kids.filter(k => k.kind !== 'PRE_TEST'));
      const btns = order.map(x => <ResButton key={x.id} r={x} assignmentId={assignmentId} />);
      return kids.length ? <span className="res-group" key={r.id}>{btns}</span> : btns[0];
    })}</div>);
}

const ACTIONS = {
  SELF_CONFIRM: { label: 'Tandai selesai', cls: 'primary', ask: 'Tandai aktivitas ini selesai?', body: 'Pastikan kamu sudah menyelesaikan aktivitas ini.' },
  ACKNOWLEDGE: { label: 'Saya sudah paham', cls: 'primary', ask: 'Konfirmasi sudah membaca & paham?', body: 'Konfirmasi ini tercatat atas nama kamu.' },
  MENTOR_PASS: { label: 'Praktik lulus', cls: 'primary', ask: 'Nyatakan praktik lulus?', body: 'Trainee dinyatakan lulus praktik aktivitas ini.' },
  MENTOR_REDO: { label: 'Perlu ulang', cls: 'ghost-red', ask: 'Minta praktik diulang?', body: 'Trainee akan melihat bahwa praktiknya perlu diulang.', danger: true },
};

export function ActionButtons({ a, onDone }) {
  const { refreshBadges } = useShell();
  if (!a.actions || !a.actions.length) return null;
  return (
    <div className="act-actions">{a.actions.map(key => {
      const cfg = ACTIONS[key];
      return (
        <Busy key={key} className={'btn ' + cfg.cls} onClick={async () => {
          if (!(await confirmBox(cfg.ask, cfg.body, cfg.label, cfg.danger))) return;
          try {
            const r = await api('activityAction', { assignmentId: a.assignmentId, action: key });
            toast(r.finished ? 'Kurikulum selesai! Sertifikat sudah terbit 🎉' : r.advanced.length ? 'Tersimpan. Stage ' + r.advanced.join(', ') + ' sudah dibuka 🎉' : 'Tersimpan');
            refreshBadges(); onDone && onDone();
          } catch (e) { toast(e.message, true); }
        }}><Icon name={key === 'MENTOR_REDO' ? 'refresh' : 'check'} />{cfg.label}</Busy>);
    })}</div>);
}

export function DueChip({ a }) {
  if (a.overdue) return <Pill label={'Terlambat · ' + fmtDate(a.due)} cls="red" icon="clock" />;
  if (a.dueSoon) return <Pill label={'Tenggat ' + fmtDate(a.due)} cls="go" icon="clock" />;
  return a.due ? <span className="muted">Tenggat {fmtDate(a.due)}</span> : null;
}

export function TaskCard({ t, onDone }) {
  const test = (t.resources || []).find(r => isTest(r.kind) && r.test && r.test.available) || (t.resources || []).find(r => isTest(r.kind));
  const doc = (t.resources || []).find(r => !isTest(r.kind));
  const href = '/enrollment/' + encodeURIComponent(t.enrollmentId) + '?focus=' + encodeURIComponent(t.id);
  return (
    <div className={'card task' + (t.overdue ? ' late' : '')}>
      <div className="ti"><Icon name={test ? 'clip' : t.actions && t.actions.length ? 'check' : doc ? 'file' : 'play'} /></div>
      <div style={{ minWidth: 0 }}>
        <h3>{t.name}</h3>
        <div className="meta"><span>{t.curriculum}{t.stage ? ' · ' + t.stage : ''}</span><DueChip a={t} /></div>
        {t.trainee ? <div className="meta"><b>{t.trainee}</b>{t.outlet ? <span>{t.outlet}</span> : null}</div> : null}
        {t.hint && !(t.actions || []).length ? <div className="meta">{t.hint}</div> : null}
      </div>
      <div className="go">
        {test ? <ResButton r={test} assignmentId={t.assignmentId} /> : doc ? <ResButton r={doc} assignmentId={t.assignmentId} /> : null}
        <ActionButtons a={t} onDone={onDone} />
        <Link className="iconbtn" href={href} title="Buka detail aktivitas" aria-label={'Buka detail ' + t.name}><Icon name="chev" /></Link>
      </div>
    </div>);
}

export function BackLink() {
  const { lastList } = useShell();
  const item = lastList || { href: '/', label: 'Beranda' };
  return <Link className="crumb" href={item.href}><Icon name="back" />{item.label}</Link>;
}

export function PasswordResult({ result, onClose }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title="Password sementara dibuat" onClose={onClose}>
      <p className="muted">Berikan password ini ke <b>{result.email}</b> lewat jalur pribadi. Password hanya ditampilkan sekali; minta pengguna menggantinya setelah masuk (ikon 🔑).</p>
      <div className="code" style={{ fontSize: 16, padding: 12 }}><b>{result.temp}</b></div>
      <div className="row"><button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(result.temp); setCopied(true); } catch { /* clipboard opsional */ } }}>{copied ? 'Tersalin ✓' : 'Salin'}</button>
        <button className="btn primary" onClick={onClose}>Selesai</button></div>
    </Modal>);
}
