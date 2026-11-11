'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon, Pill, Progress, Notice, Skeleton, initials, useApi } from '@/components/ui';
import { TaskCard } from '@/components/lms';
import { useShell } from '@/components/Shell';

const greet = () => { const hr = new Date().getHours(); return hr < 11 ? 'Selamat pagi' : hr < 15 ? 'Selamat siang' : hr < 18 ? 'Selamat sore' : 'Selamat malam'; };

function Hello({ me, sub }) {
  return <div className="hello"><div className="avatar lg">{initials(me.name)}</div><div><h1>{greet()}, {(me.name || '').split(' ')[0]}</h1><p>{sub}</p></div></div>;
}
function AllClear({ title, text }) {
  return <div className="card allclear"><div className="avatar"><Icon name="check" /></div><div><b>{title}</b><div className="small muted">{text}</div></div></div>;
}
function Tile({ href, icon, title, sub }) {
  const router = useRouter();
  return (
    <div className="card" role="button" tabIndex={0} onClick={() => router.push(href)} onKeyDown={e => { if (e.key === 'Enter') router.push(href); }}>
      <div className="row" style={{ flexWrap: 'nowrap' }}><div className="avatar"><Icon name={icon} /></div><div><b>{title}</b><div className="small muted">{sub}</div></div></div>
    </div>);
}

export default function Home() {
  const { me, refreshBadges } = useShell();
  const router = useRouter();
  const { data: d, error, loading, reload } = useApi('home');
  useEffect(() => { if (d) refreshBadges(d); }, [d, refreshBadges]);
  if (loading && !d) return <><Hello me={me} sub="Menyiapkan ringkasan kamu…" /><Skeleton n={2} /></>;
  if (error) return <><Hello me={me} sub="" /><Notice err>{error}</Notice></>;
  const isT = me.roles.includes('TRAINEE'), isM = me.roles.includes('MENTOR'), k = d.admin;
  const late = d.tasks.filter(t => t.overdue).length;
  const summary = [isT ? (d.tasks.length ? d.tasks.length + ' aktivitas bisa dikerjakan' + (late ? ', ' + late + ' terlambat' : '') : 'Tidak ada aktivitas yang menunggu') : null,
    isM ? d.queue.length + ' praktik menunggu penilaianmu' : null].filter(Boolean).join(' · ') || 'Ringkasan LMS hari ini.';
  return (<>
    <Hello me={me} sub={summary} />
    {isT ? <>
      <div className="section-title" style={{ marginTop: 4 }}><h2>Lanjutkan belajar</h2><span className="spacer" />
        {d.tasks.length > 5 ? <Link className="btn link" href="/learning">Lihat semua ({d.tasks.length})</Link> : null}</div>
      {d.tasks.length ? <div>{d.tasks.slice(0, 5).map(t => <TaskCard key={t.assignmentId} t={t} onDone={reload} />)}</div>
        : <AllClear title="Semua beres!" text="Tidak ada aktivitas yang perlu dikerjakan sekarang. Aktivitas baru muncul di sini saat stage berikutnya terbuka." />}
    </> : null}
    {isM ? <>
      <div className="section-title"><h2>Perlu dinilai</h2><span className="spacer" /><Link className="btn link" href="/mentees">Semua trainee bimbingan ({d.mentees})</Link></div>
      {d.queue.length ? <div>{d.queue.slice(0, 6).map(q => <TaskCard key={q.assignmentId} t={{ ...q, actions: ['MENTOR_PASS', 'MENTOR_REDO'], resources: [] }} onDone={reload} />)}</div>
        : <AllClear title="Tidak ada antrean penilaian" text="Praktik trainee yang siap dinilai akan muncul di sini." />}
    </> : null}
    {isT && d.learning.length ? <>
      <div className="section-title"><h2>Kurikulum saya</h2></div>
      <div className="mini">{d.learning.map(l => {
        const open = () => router.push('/enrollment/' + encodeURIComponent(l.enrollmentId));
        return (
          <div key={l.enrollmentId} className="card" role="button" tabIndex={0} onClick={open} onKeyDown={e => { if (e.key === 'Enter') open(); }}>
            <div className="row" style={{ justifyContent: 'space-between' }}><b>{l.curriculum}</b>{l.finished ? <Pill status="DONE" /> : null}</div>
            <div className="small muted" style={{ margin: '4px 0 8px' }}>{l.finished ? 'Kurikulum selesai — sertifikat tersedia' : l.currentStage ? 'Stage: ' + l.currentStage : 'Belum ada stage terbuka'}</div>
            <Progress value={l.percent} />
            <div className="small muted" style={{ marginTop: 6 }}>{l.done} dari {l.total} aktivitas · {l.percent}%</div>
          </div>);
      })}</div>
    </> : null}
    {k ? <>
      <div className="section-title"><h2>Ringkasan LMS</h2></div>
      <div className="stats">{[['Total peserta', k.enrollments, ''], ['Sedang berjalan', k.active, ''], ['Rata-rata progress', k.avgProgress + '%', ''], ['Aktivitas terlambat', k.overdue, 'red'], ['Menunggu mentor', k.pendingMentor, 'red']]
        .map(([l, v, c]) => <div key={l} className={'stat clickable' + (c && v ? ' red' : '')} role="button" tabIndex={0} title="Buka dashboard" onClick={() => router.push('/dashboard')} onKeyDown={e => { if (e.key === 'Enter') router.push('/dashboard'); }}><b>{v}</b><span>{l}</span></div>)}</div>
    </> : null}
    {!isT && !isM && me.roles.includes('ADMIN') ? <>
      <div className="section-title"><h2>Pintasan</h2></div>
      <div className="mini">
        <Tile href="/enroll" icon="plus" title="Kelola peserta" sub="Buat pendaftaran kurikulum baru" />
        <Tile href="/dashboard" icon="dash" title="Lihat dashboard" sub="Progres, keterlambatan, penilaian mentor" />
        <Tile href="/participants" icon="grid" title="Semua peserta" sub="Cari dan buka progres peserta" />
        {me.roles.includes('SUPER_ADMIN') ? <>
          <Tile href="/curricula" icon="layers" title="Kurikulum" sub="Stage, aktivitas, aturan selesai" />
          <Tile href="/content" icon="file" title="Kelola materi" sub="Perpustakaan modul, SOP, dokumen & tools" />
          <Tile href="/users" icon="shield" title="Pengguna" sub="Karyawan, role, password" />
          <Tile href="/master" icon="db" title="Master data" sub="Jabatan, outlet, mentor & trainer" />
        </> : null}
      </div>
    </> : null}
  </>);
}
