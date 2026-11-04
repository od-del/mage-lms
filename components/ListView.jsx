'use client';
import { useState } from 'react';
import { Head, Icon, Notice, Skeleton, useApi } from './ui';
import { EnrollmentCard, statusOf } from './lms';

export default function ListView({ action, title, sub, emptyText, showTrainee }) {
  const { data: list, error, loading, reload } = useApi(action);
  const [filter, setFilter] = useState('all'), [q, setQ] = useState('');
  const refresh = <button className="btn" onClick={reload}><Icon name="refresh" />Muat ulang</button>;
  if (loading && !list) return <><Head title={title} sub={sub} /><Skeleton n={3} /></>;
  if (error) return <><Head title={title} sub={sub}>{refresh}</Head><Notice err>{error}</Notice></>;
  const counts = { all: list.length, active: list.filter(e => statusOf(e) === 'active').length, done: list.filter(e => statusOf(e) === 'done').length };
  const avg = list.length ? Math.round(list.reduce((s, e) => s + e.progress.percent, 0) / list.length) : 0;
  const needle = q.trim().toLowerCase();
  const rows = list.filter(e => (filter === 'all' || statusOf(e) === filter) &&
    (!needle || [e.trainee.name, e.trainee.id, e.curriculum.name, e.enrollmentId, e.trainee.outlet, e.currentStage].join(' ').toLowerCase().includes(needle)));
  return (<>
    <Head title={title} sub={sub}>{refresh}</Head>
    {list.length > 1 ? <div className="stats">
      <div className="stat"><b>{counts.all}</b><span>Total pendaftaran</span></div>
      <div className="stat"><b>{counts.active}</b><span>Sedang berjalan</span></div>
      <div className="stat"><b>{counts.done}</b><span>Selesai</span></div>
      <div className="stat red"><b>{avg}%</b><span>Rata-rata progress</span></div>
    </div> : null}
    {list.length > 3 ? <div className="row" style={{ marginBottom: 14 }}>
      <div className="search"><Icon name="search" /><input className="input" type="search" placeholder="Cari nama, ID, kurikulum, outlet…" aria-label="Cari" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="chips">{[['all', 'Semua'], ['active', 'Aktif'], ['done', 'Selesai']].map(([k, label]) =>
        <button key={k} className={'chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{label} ({counts[k]})</button>)}</div>
    </div> : null}
    <div className="grid">{rows.length ? rows.map(e => <EnrollmentCard key={e.enrollmentId} e={e} showTrainee={showTrainee} />)
      : <div style={{ gridColumn: '1/-1' }}><div className="card empty"><Icon name="inbox" /><div>{list.length ? 'Tidak ada yang cocok dengan pencarian.' : emptyText}</div></div></div>}</div>
  </>);
}
