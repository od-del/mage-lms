'use client';
import { useState } from 'react';
import { Head, Icon, Notice, Skeleton, useApi } from './ui';
import { EnrollmentCard, statusOf } from './lms';

// `filters`: selalu tampilkan pencarian nama + filter kurikulum & stage (dipakai di Trainee Bimbingan).
export default function ListView({ action, title, sub, emptyText, showTrainee, filters }) {
  const { data: list, error, loading, reload } = useApi(action);
  const [filter, setFilter] = useState('all'), [q, setQ] = useState(''), [cur, setCur] = useState('*'), [stage, setStage] = useState('*');
  const refresh = <button className="btn" onClick={reload}><Icon name="refresh" />Muat ulang</button>;
  if (loading && !list) return <><Head title={title} sub={sub} /><Skeleton n={3} /></>;
  if (error) return <><Head title={title} sub={sub}>{refresh}</Head><Notice err>{error}</Notice></>;
  const counts = { all: list.length, active: list.filter(e => statusOf(e) === 'active').length, done: list.filter(e => statusOf(e) === 'done').length };
  const avg = list.length ? Math.round(list.reduce((s, e) => s + e.progress.percent, 0) / list.length) : 0;
  const curricula = [...new Map(list.map(e => [e.curriculum.id, e.curriculum.name]))].sort((a, b) => a[1].localeCompare(b[1]));
  const stages = [...new Set(list.filter(e => cur === '*' || e.curriculum.id === cur).map(e => e.currentStage).filter(Boolean))].sort();
  const stageOk = stage === '*' || stages.includes(stage);
  const needle = q.trim().toLowerCase();
  const rows = list.filter(e => (filter === 'all' || statusOf(e) === filter)
    && (cur === '*' || e.curriculum.id === cur) && (!stageOk || stage === '*' || e.currentStage === stage)
    && (!needle || [e.trainee.name, e.trainee.id, e.curriculum.name, e.enrollmentId, e.trainee.outlet, e.currentStage].join(' ').toLowerCase().includes(needle)));
  const active = needle || cur !== '*' || (stageOk && stage !== '*');
  return (<>
    <Head title={title} sub={sub}>{refresh}</Head>
    {list.length > 1 ? <div className="stats">
      <div className="stat"><b>{counts.all}</b><span>Total pendaftaran</span></div>
      <div className="stat"><b>{counts.active}</b><span>Sedang berjalan</span></div>
      <div className="stat"><b>{counts.done}</b><span>Selesai</span></div>
      <div className="stat red"><b>{avg}%</b><span>Rata-rata progress</span></div>
    </div> : null}
    {list.length > 3 || (filters && list.length) ? <div className="row filters" style={{ marginBottom: 14 }}>
      <div className="search"><Icon name="search" /><input className="input" type="search" placeholder={filters ? 'Cari nama trainee…' : 'Cari nama, ID, kurikulum, outlet…'} aria-label="Cari" value={q} onChange={e => setQ(e.target.value)} /></div>
      {filters ? <>
        <select className="input" style={{ maxWidth: 220 }} aria-label="Filter kurikulum" value={cur} onChange={e => { setCur(e.target.value); setStage('*'); }}>
          <option value="*">Semua kurikulum</option>{curricula.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        <select className="input" style={{ maxWidth: 200 }} aria-label="Filter stage" value={stageOk ? stage : '*'} onChange={e => setStage(e.target.value)}>
          <option value="*">Semua stage</option>{stages.map(s => <option key={s} value={s}>{s}</option>)}</select>
      </> : null}
      <div className="chips">{[['all', 'Semua'], ['active', 'Aktif'], ['done', 'Selesai']].map(([k, label]) =>
        <button key={k} className={'chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{label} ({counts[k]})</button>)}</div>
      {filters && active ? <button className="btn link" onClick={() => { setQ(''); setCur('*'); setStage('*'); }}>Reset</button> : null}
    </div> : null}
    <div className="grid">{rows.length ? rows.map(e => <EnrollmentCard key={e.enrollmentId} e={e} showTrainee={showTrainee} />)
      : <div style={{ gridColumn: '1/-1' }}><div className="card empty"><Icon name="inbox" /><div>{list.length ? 'Tidak ada yang cocok dengan pencarian.' : emptyText}</div></div></div>}</div>
  </>);
}
