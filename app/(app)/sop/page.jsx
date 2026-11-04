'use client';
import { useState } from 'react';
import { Head, Icon, Notice, Skeleton, Empty, useApi } from '@/components/ui';

export default function Sop() {
  const { data: list, error, loading } = useApi('sopLibrary');
  const [q, setQ] = useState('');
  if (loading && !list) return <><Head title="SOP" sub="Standar operasional yang berlaku untuk kurikulum kamu." /><Skeleton n={2} /></>;
  if (error) return <><Head title="SOP" /><Notice err>{error}</Notice></>;
  const needle = q.trim().toLowerCase();
  const rows = list.filter(s => !needle || [s.title, s.scope].join(' ').toLowerCase().includes(needle));
  return (<>
    <Head title="SOP" sub={list.length + ' dokumen SOP tersedia.'} />
    {list.length > 5 ? <div className="search" style={{ marginBottom: 14 }}><Icon name="search" /><input className="input" type="search" placeholder="Cari judul SOP…" aria-label="Cari SOP" value={q} onChange={e => setQ(e.target.value)} /></div> : null}
    {rows.length ? <div className="card">{rows.map(s => (
      <div className="doc-row" key={s.id}><div className="avatar"><Icon name="doc" /></div>
        <div><b>{s.title}</b><div className="small muted">{s.scope}</div></div>
        <a className="btn" href={s.url} target="_blank" rel="noopener noreferrer">Buka</a></div>))}</div>
      : <Empty icon="doc">{list.length ? 'Tidak ada SOP yang cocok.' : 'Belum ada SOP untuk kamu.'}</Empty>}
  </>);
}
