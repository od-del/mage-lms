'use client';
import { useState } from 'react';
import { Head, Icon, Notice, Skeleton, Empty, Pill, useApi } from '@/components/ui';
import { KIND_LABEL, CATEGORY_LABEL, RES_ICON } from '@/components/lms';

// Pusat akses dokumen & link pendukung kerja. Isi disaring per jabatan (diatur di Kelola Materi).
export default function Documents() {
  const { data: d, error, loading } = useApi('documents');
  const [q, setQ] = useState(''), [cat, setCat] = useState('*'), [kind, setKind] = useState('*');
  const sub = 'SOP, modul training, dokumen, dan IT Support Management untuk pekerjaanmu.';
  if (loading && !d) return <><Head title="Documents" sub={sub} /><Skeleton n={2} /></>;
  if (error) return <><Head title="Documents" /><Notice err>{error}</Notice></>;
  const list = d.items, needle = q.trim().toLowerCase();
  const count = c => list.filter(x => c === '*' || x.category === c).length;
  const kinds = [...new Set(list.map(x => x.kind))];
  const rows = list.filter(x => (cat === '*' || x.category === cat) && (kind === '*' || x.kind === kind)
    && (!needle || [x.title, x.scope, KIND_LABEL[x.kind], CATEGORY_LABEL[x.category]].join(' ').toLowerCase().includes(needle)));
  return (<>
    <Head title="Documents" sub={sub} />
    {d.admin ? <Notice>Sebagai admin kamu melihat semua dokumen. Pengguna lain hanya melihat dokumen untuk jabatannya — atur di Kelola Materi → Visibilitas.</Notice>
      : d.position ? <p className="small muted" style={{ marginTop: -6 }}>Ditampilkan untuk jabatan <b>{d.position}</b>.</p> : null}
    <div className="row filters" style={{ margin: '14px 0' }}>
      <div className="chips">{[['*', 'Semua'], ['DOCUMENT', CATEGORY_LABEL.DOCUMENT], ['IT_TOOL', CATEGORY_LABEL.IT_TOOL]].map(([k, label]) =>
        <button key={k} className={'chip' + (cat === k ? ' on' : '')} onClick={() => setCat(k)}>{label} ({count(k)})</button>)}</div>
      {kinds.length > 1 ? <select className="input" style={{ maxWidth: 200 }} aria-label="Filter format" value={kind} onChange={e => setKind(e.target.value)}>
        <option value="*">Semua format</option>{kinds.map(k => <option key={k} value={k}>{KIND_LABEL[k] || k}</option>)}</select> : null}
      <div className="search"><Icon name="search" /><input className="input" type="search" placeholder="Cari judul dokumen…" aria-label="Cari dokumen" value={q} onChange={e => setQ(e.target.value)} /></div>
    </div>
    {rows.length ? <div className="card">{rows.map(s => (
      <div className="doc-row" key={s.id}><div className="avatar"><Icon name={RES_ICON[s.kind] || 'doc'} /></div>
        <div style={{ minWidth: 0 }}><b>{s.title}</b>
          <div className="small muted">{[KIND_LABEL[s.kind] || s.kind, s.scope].filter(Boolean).join(' · ')}</div>
          {d.admin ? <div className="small" style={{ marginTop: 2 }}>{s.visibleTo.length ? <Pill label={'Jabatan: ' + s.visibleTo.join(', ')} cls="role" icon="eye" /> : <span className="muted">Semua jabatan</span>}</div> : null}</div>
        <a className="btn" href={s.url} target="_blank" rel="noopener noreferrer">Buka</a></div>))}</div>
      : <Empty icon="doc">{list.length ? 'Tidak ada dokumen yang cocok.' : 'Belum ada dokumen untuk jabatanmu.'}</Empty>}
  </>);
}
