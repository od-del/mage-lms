'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Head, Icon, Pill, Notice, Skeleton, Empty, fmt, fmtDate, fmtDateTime, download, useApi } from '@/components/ui';

function GroupTable({ title, rows }) {
  return (
    <div className="card"><h2>{title}</h2>
      {rows.length ? <table className="table" style={{ marginTop: 8 }}>
        <thead><tr>{['Nama', 'Peserta', 'Selesai', 'Rata-rata', 'Terlambat'].map(t => <th key={t}>{t}</th>)}</tr></thead>
        <tbody>{rows.map(g => (
          <tr key={g.name}><td data-label="Nama"><b>{g.name}</b></td><td data-label="Peserta">{g.enrollments}</td><td data-label="Selesai">{g.finished}</td>
            <td data-label="Rata-rata"><div className="avgcell"><b>{g.avg}%</b><div className="minibar"><span style={{ width: g.avg + '%' }} /></div></div></td>
            <td data-label="Terlambat">{g.overdue ? <Pill label={String(g.overdue)} cls="red" /> : '0'}</td></tr>))}</tbody>
      </table> : <Empty>Belum ada data.</Empty>}
    </div>);
}

export default function Dashboard() {
  const router = useRouter();
  const [f, setF] = useState({ curriculumId: '', outlet: '' });
  const { data: d, error, loading, reload } = useApi('dashboard', f);
  const open = id => router.push('/enrollment/' + encodeURIComponent(id));
  if (loading && !d) return <><Head title="Dashboard" sub="Ringkasan progress semua peserta." /><Skeleton n={3} /></>;
  if (error) return <><Head title="Dashboard" /><Notice err>{error}</Notice></>;
  const k = d.kpi;
  const exportCsv = () => {
    const cols = [['enrollmentId', 'ID pendaftaran'], ['employeeId', 'ID karyawan'], ['trainee', 'Nama'], ['job', 'Jabatan'], ['outlet', 'Outlet'], ['curriculum', 'Kurikulum'],
      ['status', 'Status'], ['percent', 'Progress %'], ['done', 'Selesai'], ['total', 'Total aktivitas'], ['currentStage', 'Stage saat ini'], ['startDate', 'Mulai'], ['overdue', 'Terlambat']];
    const q = v => '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
    const csv = '﻿' + [cols.map(c => q(c[1])).join(',')].concat(d.rows.map(r => cols.map(c => q(r[c[0]])).join(','))).join('\r\n');
    download(csv, 'mage-lms-dashboard-' + new Date().toISOString().slice(0, 10) + '.csv', 'text/csv;charset=utf-8');
  };
  return (<>
    <Head title="Dashboard" sub={'Data per ' + fmtDateTime(d.generatedAt) + '.'}>
      <button className="btn" onClick={reload}><Icon name="refresh" />Muat ulang</button>
      <button className="btn" onClick={exportCsv}><Icon name="download" />Export CSV</button>
    </Head>
    <div className="row filters" style={{ marginBottom: 14 }}>
      <select className="input" style={{ maxWidth: 260 }} aria-label="Filter kurikulum" value={f.curriculumId} onChange={e => setF({ ...f, curriculumId: e.target.value })}>
        <option value="">Semua kurikulum</option>{d.filters.curricula.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select className="input" style={{ maxWidth: 220 }} aria-label="Filter outlet" value={f.outlet} onChange={e => setF({ ...f, outlet: e.target.value })}>
        <option value="">Semua outlet</option>{d.filters.outlets.map(o => <option key={o} value={o}>{o}</option>)}</select>
    </div>
    <div className="stats">
      <div className="stat"><b>{k.enrollments}</b><span>Total pendaftaran</span></div>
      <div className="stat"><b>{k.active}</b><span>Sedang berjalan</span></div>
      <div className="stat"><b>{k.finished}</b><span>Kurikulum selesai</span></div>
      <div className="stat"><b>{k.avgProgress}%</b><span>Rata-rata progress</span></div>
      <div className="stat red"><b>{k.overdue}</b><span>Aktivitas terlambat</span></div>
      <div className="stat red"><b>{k.pendingMentor}</b><span>Menunggu penilaian mentor</span></div>
    </div>
    <div className="two even"><GroupTable title="Per kurikulum" rows={d.byCurriculum} /><GroupTable title="Per outlet" rows={d.byOutlet} /></div>
    <div className="card" style={{ marginTop: 16 }}><h2 style={{ color: 'var(--red-700)' }}>Aktivitas terlambat ({d.overdue.length})</h2>
      {d.overdue.length ? <table className="table" style={{ marginTop: 8 }}>
        <thead><tr>{['Trainee', 'Outlet', 'Aktivitas', 'Tenggat', 'Terlambat', 'Mentor'].map(t => <th key={t}>{t}</th>)}</tr></thead>
        <tbody>{d.overdue.slice(0, 100).map((o, i) => (
          <tr key={i} className="click" onClick={() => open(o.enrollmentId)}>
            <td data-label="Trainee"><b>{o.trainee}</b><div className="small muted">{o.curriculum}</div></td><td data-label="Outlet">{fmt(o.outlet)}</td>
            <td data-label="Aktivitas">{o.activity}</td><td data-label="Tenggat">{fmtDate(o.due)}</td>
            <td data-label="Terlambat"><Pill label={o.daysLate + ' hari'} cls="red" /></td><td data-label="Mentor">{o.mentors.join(', ') || '–'}</td></tr>))}</tbody>
      </table> : <Empty icon="check">Tidak ada aktivitas terlambat 👍</Empty>}
    </div>
    <div className="card" style={{ marginTop: 16 }}><h2>Menunggu penilaian mentor ({d.pendingMentor.length})</h2>
      {d.pendingMentor.length ? <table className="table" style={{ marginTop: 8 }}>
        <thead><tr>{['Trainee', 'Aktivitas', 'Mentor', 'Sejak'].map(t => <th key={t}>{t}</th>)}</tr></thead>
        <tbody>{d.pendingMentor.slice(0, 100).map((o, i) => (
          <tr key={i} className="click" onClick={() => open(o.enrollmentId)}>
            <td data-label="Trainee"><b>{o.trainee}</b><div className="small muted">{o.outlet}</div></td><td data-label="Aktivitas">{o.activity}</td>
            <td data-label="Mentor">{o.mentors.join(', ') || '–'}</td><td data-label="Sejak">{fmtDate(o.since)}</td></tr>))}</tbody>
      </table> : <Empty icon="check">Tidak ada praktik yang menunggu penilaian.</Empty>}
    </div>
  </>);
}
