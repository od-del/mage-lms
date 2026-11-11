'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Head, Icon, Notice, Skeleton, Empty, Pill, fmtDate, pct, useApi } from '@/components/ui';
import { KIND_LABEL, RES_ICON } from '@/components/lms';

// Modul training dari aktivitas yang sudah selesai.
export default function Learned() {
  const { data: list, error, loading } = useApi('learnedModules');
  const [q, setQ] = useState(''), [cur, setCur] = useState('*');
  const sub = 'Modul training dan materi dari aktivitas yang sudah kamu selesaikan.';
  if (loading && !list) return <><Head title="Modul Dipelajari" sub={sub} /><Skeleton n={2} /></>;
  if (error) return <><Head title="Modul Dipelajari" /><Notice err>{error}</Notice></>;
  const curricula = [...new Set(list.map(x => x.curriculum))];
  const needle = q.trim().toLowerCase();
  const rows = list.filter(x => (cur === '*' || x.curriculum === cur) && (!needle || [x.title, x.activity, x.stage, x.curriculum].join(' ').toLowerCase().includes(needle)));
  const modules = new Set(list.map(x => x.id)).size;
  return (<>
    <Head title="Modul Dipelajari" sub={sub} />
    {list.length ? <div className="stats">
      <div className="stat"><b>{modules}</b><span>Materi dipelajari</span></div>
      <div className="stat"><b>{new Set(list.map(x => x.activityId + x.enrollmentId)).size}</b><span>Aktivitas selesai</span></div>
      <div className="stat"><b>{curricula.length}</b><span>Kurikulum</span></div>
    </div> : null}
    {list.length > 3 ? <div className="row filters" style={{ marginBottom: 14 }}>
      {curricula.length > 1 ? <select className="input" style={{ maxWidth: 260 }} aria-label="Filter kurikulum" value={cur} onChange={e => setCur(e.target.value)}>
        <option value="*">Semua kurikulum</option>{curricula.map(c => <option key={c} value={c}>{c}</option>)}</select> : null}
      <div className="search"><Icon name="search" /><input className="input" type="search" placeholder="Cari modul atau aktivitas…" aria-label="Cari modul" value={q} onChange={e => setQ(e.target.value)} /></div>
    </div> : null}
    {rows.length ? <div className="card">{rows.map(m => (
      <div className="doc-row" key={m.key}><div className="avatar"><Icon name={RES_ICON[m.kind] || 'file'} /></div>
        <div style={{ minWidth: 0 }}><b>{m.title}</b>
          <div className="small muted">{KIND_LABEL[m.kind] || m.kind} · {[m.curriculum, m.stage, m.activity].filter(Boolean).join(' › ')}</div>
          <div className="small row" style={{ gap: 8, marginTop: 4 }}>
            <Pill label={'Selesai ' + fmtDate(m.completedAt)} cls="done" icon="check" />
            {m.post !== null && m.post !== undefined ? <span className="muted">Post-test <b className="score">{pct(m.post)}</b></span> : null}
            <Link className="small" href={'/enrollment/' + encodeURIComponent(m.enrollmentId) + '?focus=' + encodeURIComponent(m.activityId)}>Lihat aktivitas →</Link>
          </div></div>
        {m.url ? <a className="btn" href={m.url} target="_blank" rel="noopener noreferrer">Buka</a> : null}</div>))}</div>
      : <Empty icon="award">{list.length ? 'Tidak ada modul yang cocok.' : 'Belum ada modul yang selesai dipelajari. Modul muncul di sini setelah aktivitasnya selesai.'}</Empty>}
  </>);
}
