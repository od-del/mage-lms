'use client';
import { useEffect, useState } from 'react';
import { Head, Icon, Pill, Notice, Skeleton, Empty, Modal, Busy, api, toast, confirmBox, useApi } from '@/components/ui';

const TABS = [['positions', 'Kelola Jabatan', 'shield'], ['outlets', 'Kelola Outlet', 'home'], ['mentors', 'Mentor & Trainer', 'users']];

function Err({ text }) { return text ? <div style={{ marginTop: 10 }}><Notice err>{text}</Notice></div> : null; }
function Footer({ onClose, onSave }) {
  return <div className="row"><button className="btn" onClick={onClose}>Batal</button><Busy className="btn primary" onClick={onSave}>Simpan</Busy></div>;
}

function PositionForm({ p, onClose, onSaved }) {
  const [v, setV] = useState({ id: p?.id || '', name: p?.name || '', active: p ? p.active : true });
  const [err, setErr] = useState('');
  const save = async () => { try { await api('positionSave', v); toast('Jabatan disimpan'); onSaved(); onClose(); } catch (e) { setErr(e.message); } };
  return (
    <Modal title={p ? 'Ubah jabatan' : 'Jabatan baru'} onClose={onClose}>
      <label className="f">Nama jabatan</label><input className="input" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} placeholder="Contoh: Barista" autoFocus />
      {p && p.users ? <div className="small muted" style={{ marginTop: 4 }}>Mengganti nama juga mengganti jabatan {p.users} pengguna.</div> : null}
      <div className="checks"><label><input type="checkbox" checked={!!v.active} onChange={e => setV({ ...v, active: e.target.checked })} />Aktif (bisa dipilih di form pengguna)</label></div>
      <Err text={err} /><Footer onClose={onClose} onSave={save} />
    </Modal>);
}

function OutletForm({ o, onClose, onSaved }) {
  const [v, setV] = useState({ id: o?.id || '', name: o?.name || '', location: o?.location || '', active: o ? o.active : true });
  const [err, setErr] = useState('');
  const save = async () => { try { await api('outletSave', v); toast('Outlet disimpan'); onSaved(); onClose(); } catch (e) { setErr(e.message); } };
  return (
    <Modal title={o ? 'Ubah outlet' : 'Outlet baru'} onClose={onClose}>
      <label className="f">Nama Outlet</label><input className="input" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} placeholder="Contoh: Kemang" autoFocus />
      <label className="f">Lokasi Outlet</label><input className="input" value={v.location} onChange={e => setV({ ...v, location: e.target.value })} placeholder="Contoh: Jl. Kemang Raya No. 10, Jakarta Selatan" />
      {o && o.users ? <div className="small muted" style={{ marginTop: 4 }}>Mengganti nama juga mengganti outlet {o.users} pengguna.</div> : null}
      <div className="checks"><label><input type="checkbox" checked={!!v.active} onChange={e => setV({ ...v, active: e.target.checked })} />Aktif (bisa dipilih di form pengguna)</label></div>
      <Err text={err} /><Footer onClose={onClose} onSave={save} />
    </Modal>);
}

function MentorForm({ m, data, onClose, onSaved }) {
  const [v, setV] = useState({ userId: m?.id || '', curricula: m?.curricula || [], active: m ? m.active : true, isNew: !m });
  const [err, setErr] = useState(''), [q, setQ] = useState('');
  const taken = new Set(data.mentors.map(x => x.id));
  const users = data.users.filter(u => !taken.has(u.id) && [u.name, u.id, u.job, u.outlet].join(' ').toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = id => setV(s => ({ ...s, curricula: s.curricula.includes(id) ? s.curricula.filter(x => x !== id) : [...s.curricula, id] }));
  const save = async () => { try { await api('mentorSave', v); toast('Mentor/trainer disimpan'); onSaved(); onClose(); } catch (e) { setErr(e.message); } };
  return (
    <Modal title={m ? 'Ubah mentor/trainer · ' + m.name : 'Mentor/trainer baru'} onClose={onClose}>
      {!m ? <>
        <label className="f">Pengguna</label>
        <input className="input" type="search" placeholder="Cari nama atau ID…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
        <select className="input" style={{ marginTop: 8 }} aria-label="Pilih pengguna" value={v.userId} onChange={e => setV({ ...v, userId: e.target.value })}>
          <option value="">— Pilih pengguna —</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.id}){[u.job, u.outlet].filter(Boolean).length ? ' — ' + [u.job, u.outlet].filter(Boolean).join(' · ') : ''}</option>)}</select>
      </> : null}
      <label className="f">Berwenang membimbing kurikulum</label>
      {data.curricula.length ? <div className="checks pos-grid">{data.curricula.map(c => <label key={c.id}><input type="checkbox" checked={v.curricula.includes(c.id)} onChange={() => toggle(c.id)} />{c.name}{c.active ? '' : ' (nonaktif)'}</label>)}</div>
        : <Notice err>Belum ada kurikulum.</Notice>}
      <div className="small muted" style={{ marginTop: 6 }}>Mentor/trainer muncul sebagai pilihan saat mendaftarkan peserta, di form aktivitas praktik, dan saat trainee memilih pendamping praktik.</div>
      <div className="checks"><label><input type="checkbox" checked={!!v.active} onChange={e => setV({ ...v, active: e.target.checked })} />Aktif (bisa dipilih)</label></div>
      <Err text={err} /><Footer onClose={onClose} onSave={save} />
    </Modal>);
}

const Status = ({ on }) => on ? <Pill label="Aktif" cls="go" icon="check" /> : <Pill label="Nonaktif" cls="lock" icon="lock" />;

export default function Master() {
  const { data: d, error, loading, reload } = useApi('masterData');
  const [tab, setTab] = useState('positions'), [form, setForm] = useState(null), [q, setQ] = useState('');
  useEffect(() => { const t = new URLSearchParams(location.search).get('tab'); if (TABS.some(x => x[0] === t)) setTab(t); }, []);
  const go = t => { setTab(t); setQ(''); history.replaceState(null, '', '/master?tab=' + t); };
  const sub = 'Data acuan untuk form pengguna, visibilitas Documents, dan pilihan mentor/trainer.';
  if (loading && !d) return <><Head title="Master Data" sub={sub} /><Skeleton n={2} /></>;
  if (error) return <><Head title="Master Data" /><Notice err>{error}</Notice></>;
  const remove = async (action, params, title, body) => {
    if (!(await confirmBox(title, body, 'Hapus', true))) return;
    try { await api(action, params); toast('Dihapus'); reload(); } catch (e) { toast(e.message, true); }
  };
  const curName = new Map(d.curricula.map(c => [c.id, c.name]));
  const needle = q.trim().toLowerCase();
  const hit = (...p) => !needle || p.join(' ').toLowerCase().includes(needle);
  const close = () => setForm(null);
  const addLabel = { positions: 'Jabatan baru', outlets: 'Outlet baru', mentors: 'Mentor/trainer baru' }[tab];
  return (<>
    <Head title="Master Data" sub={sub}><button className="btn primary" onClick={() => setForm({ type: tab })}><Icon name="plus" />{addLabel}</button></Head>
    <div className="row filters" style={{ marginBottom: 14 }}>
      <div className="seg" role="tablist" aria-label="Master data">{TABS.map(([k, label, icon]) =>
        <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => go(k)}><Icon name={icon} />{label} ({d[k].length})</button>)}</div>
      <div className="search"><Icon name="search" /><input className="input" type="search" placeholder="Cari…" aria-label="Cari" value={q} onChange={e => setQ(e.target.value)} /></div>
    </div>

    {tab === 'positions' ? (d.positions.filter(p => hit(p.name)).length ? <div className="card"><table className="table">
      <thead><tr>{['Jabatan', 'Pengguna', 'Dokumen terbatas', 'Status', ''].map(t => <th key={t}>{t}</th>)}</tr></thead>
      <tbody>{d.positions.filter(p => hit(p.name)).map(p => (
        <tr key={p.id}><td data-label="Jabatan"><b>{p.name}</b></td><td data-label="Pengguna">{p.users}</td><td data-label="Dokumen terbatas">{p.documents}</td>
          <td data-label="Status"><Status on={p.active} /></td>
          <td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><button className="btn" onClick={() => setForm({ type: 'positions', item: p })}>Ubah</button>
            <button className="btn ghost-red" aria-label={'Hapus ' + p.name} onClick={() => p.users ? toast(`Jabatan ${p.name} masih dipakai ${p.users} pengguna. Ganti jabatan mereka dulu, atau nonaktifkan jabatan ini.`, true)
              : remove('positionDelete', { id: p.id }, 'Hapus jabatan ' + p.name + '?', p.documents ? `Jabatan ini juga dihapus dari pengaturan visibilitas ${p.documents} dokumen.` : 'Tindakan ini tidak bisa dibatalkan.')}><Icon name="trash" /></button></div></td></tr>))}</tbody>
    </table></div> : <Empty icon="shield">{d.positions.length ? 'Tidak ada yang cocok.' : 'Belum ada jabatan.'}</Empty>) : null}

    {tab === 'outlets' ? (d.outlets.filter(o => hit(o.name, o.location)).length ? <div className="card"><table className="table">
      <thead><tr>{['Nama Outlet', 'Lokasi Outlet', 'Pengguna', 'Status', ''].map(t => <th key={t}>{t}</th>)}</tr></thead>
      <tbody>{d.outlets.filter(o => hit(o.name, o.location)).map(o => (
        <tr key={o.id}><td data-label="Nama Outlet"><b>{o.name}</b></td><td data-label="Lokasi Outlet">{o.location || <span className="muted">–</span>}</td><td data-label="Pengguna">{o.users}</td>
          <td data-label="Status"><Status on={o.active} /></td>
          <td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><button className="btn" onClick={() => setForm({ type: 'outlets', item: o })}>Ubah</button>
            <button className="btn ghost-red" aria-label={'Hapus ' + o.name} onClick={() => o.users ? toast(`Outlet ${o.name} masih dipakai ${o.users} pengguna. Pindahkan mereka dulu, atau nonaktifkan outlet ini.`, true)
              : remove('outletDelete', { id: o.id }, 'Hapus outlet ' + o.name + '?', 'Tindakan ini tidak bisa dibatalkan.')}><Icon name="trash" /></button></div></td></tr>))}</tbody>
    </table></div> : <Empty icon="home">{d.outlets.length ? 'Tidak ada yang cocok.' : 'Belum ada outlet.'}</Empty>) : null}

    {tab === 'mentors' ? (d.mentors.filter(m => hit(m.name, m.job, m.outlet, ...m.curricula.map(id => curName.get(id)))).length ? <div className="card"><table className="table">
      <thead><tr>{['Mentor/trainer', 'Berwenang di kurikulum', 'Bimbingan aktif', 'Status', ''].map(t => <th key={t}>{t}</th>)}</tr></thead>
      <tbody>{d.mentors.filter(m => hit(m.name, m.job, m.outlet, ...m.curricula.map(id => curName.get(id)))).map(m => (
        <tr key={m.id}><td data-label="Mentor/trainer"><b>{m.name}</b><div className="small muted">{[m.id, m.job, m.outlet].filter(Boolean).join(' · ')}{m.userActive ? '' : ' · akun nonaktif'}</div></td>
          <td data-label="Kurikulum"><div className="row" style={{ gap: 4 }}>{m.curricula.length ? m.curricula.map(id => <Pill key={id} label={curName.get(id) || id} cls="role" />) : <span className="muted small">–</span>}</div></td>
          <td data-label="Bimbingan aktif">{m.mentees}</td>
          <td data-label="Status"><Status on={m.active && m.userActive} /></td>
          <td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><button className="btn" onClick={() => setForm({ type: 'mentors', item: m })}>Ubah</button>
            <button className="btn ghost-red" aria-label={'Hapus ' + m.name} onClick={() => remove('mentorDelete', { userId: m.id }, 'Hapus ' + m.name + ' dari daftar mentor?',
              (m.mentees ? `Bimbingan yang sedang berjalan (${m.mentees}) tetap memakai mentor ini, tapi ` : '') + 'ia tidak bisa dipilih lagi untuk pendaftaran atau praktik baru.')}><Icon name="trash" /></button></div></td></tr>))}</tbody>
    </table></div> : <Empty icon="users">{d.mentors.length ? 'Tidak ada yang cocok.' : 'Belum ada mentor/trainer.'}</Empty>) : null}

    {form?.type === 'positions' ? <PositionForm p={form.item} onClose={close} onSaved={reload} /> : null}
    {form?.type === 'outlets' ? <OutletForm o={form.item} onClose={close} onSaved={reload} /> : null}
    {form?.type === 'mentors' ? <MentorForm m={form.item} data={d} onClose={close} onSaved={reload} /> : null}
  </>);
}
