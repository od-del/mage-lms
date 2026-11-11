'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Head, Icon, Pill, Notice, Skeleton, Empty, Modal, Busy, ROLE_LABEL, api, toast, confirmBox, useApi } from '@/components/ui';
import { PasswordResult } from '@/components/lms';
import { useShell } from '@/components/Shell';

// Dropdown dari master data; nilai lama yang belum ada di master tetap tampil supaya tidak hilang.
function MasterSelect({ value, onChange, list, empty, label }) {
  const known = list.some(x => x.name.toLowerCase() === String(value || '').toLowerCase());
  return (
    <select className="input" aria-label={label} value={value} onChange={onChange}>
      <option value="">{empty}</option>
      {value && !known ? <option value={value}>{value} (belum ada di master)</option> : null}
      {list.map(x => <option key={x.id} value={x.name}>{x.name}{x.location ? ' — ' + x.location : ''}</option>)}
    </select>);
}

function UserForm({ u, onClose, onSaved }) {
  const [v, setV] = useState(u ? { ...u, isNew: false } : { id: '', name: '', email: '', job: '', outlet: '', role: '', active: true, isNew: true });
  const [err, setErr] = useState('');
  const { data: m } = useApi('masterData');
  const positions = m ? m.positions.filter(x => x.active || x.name === v.job) : [];
  const outlets = m ? m.outlets.filter(x => x.active || x.name === v.outlet) : [];
  const set = k => e => setV(s => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => { try { await api('userSave', v); toast('Pengguna disimpan'); onSaved(); onClose(); } catch (e) { setErr(e.message); } };
  return (
    <Modal title={u ? 'Ubah pengguna' : 'Pengguna baru'} onClose={onClose}>
      <div className="grid2">
        <div><label className="f">ID karyawan</label><input className="input" value={v.id} onChange={set('id')} disabled={!v.isNew} placeholder="Contoh: SO20003" autoFocus={v.isNew} /></div>
        <div><label className="f">Nama</label><input className="input" value={v.name} onChange={set('name')} /></div>
      </div>
      <label className="f">Email (untuk login)</label><input className="input" type="email" value={v.email} onChange={set('email')} placeholder="nama@perusahaan.com" />
      <div className="grid2">
        <div><label className="f">Jabatan</label>{m ? <MasterSelect label="Jabatan" value={v.job} onChange={set('job')} list={positions} empty="— Pilih jabatan —" /> : <div className="input sk" style={{ height: 40 }} />}</div>
        <div><label className="f">Outlet</label>{m ? <MasterSelect label="Outlet" value={v.outlet} onChange={set('outlet')} list={outlets} empty="— Pilih outlet —" /> : <div className="input sk" style={{ height: 40 }} />}</div>
      </div>
      <div className="small muted" style={{ marginTop: 4 }}>Daftar jabatan & outlet diatur di <Link href="/master">Master Data</Link>.</div>
      <label className="f">Akses admin</label>
      <select className="input" value={v.role} onChange={set('role')}><option value="">Tidak ada (trainee / mentor)</option><option value="ADMIN">Admin/HR</option><option value="SUPER_ADMIN">Super Admin</option></select>
      <div className="small muted" style={{ marginTop: 4 }}>Peran Mentor dan Trainee otomatis dari data pendaftaran.</div>
      <div className="checks"><label><input type="checkbox" checked={!!v.active} onChange={set('active')} />Aktif (bisa masuk)</label></div>
      {err ? <div style={{ marginTop: 10 }}><Notice err>{err}</Notice></div> : null}
      <div className="row"><button className="btn" onClick={onClose}>Batal</button><Busy className="btn primary" onClick={save}>Simpan</Busy></div>
    </Modal>);
}

export default function Users() {
  const { me } = useShell();
  const { data: list, error, loading, reload } = useApi('usersList');
  const [form, setForm] = useState(null), [pw, setPw] = useState(null), [q, setQ] = useState('');
  if (loading && !list) return <><Head title="Pengguna" sub="Karyawan, akses admin, dan password." /><Skeleton n={2} /></>;
  if (error) return <><Head title="Pengguna" /><Notice err>{error}</Notice></>;
  const reset = async u => {
    if (!(await confirmBox('Buat password sementara?', 'Password lama ' + u.name + ' tidak berlaku lagi. Password sementara ditampilkan sekali.', 'Buat password'))) return;
    try { setPw(await api('passwordReset', { userId: u.id })); reload(); } catch (e) { toast(e.message, true); }
  };
  const needle = q.trim().toLowerCase();
  const rows = list.filter(u => !needle || [u.id, u.name, u.email, u.job, u.outlet].join(' ').toLowerCase().includes(needle));
  return (<>
    <Head title="Pengguna" sub={list.length + ' pengguna · ' + list.filter(u => u.role).length + ' admin'}>
      <button className="btn primary" onClick={() => setForm({})}><Icon name="plus" />Pengguna baru</button>
    </Head>
    <div className="search" style={{ marginBottom: 14 }}><Icon name="search" /><input className="input" type="search" placeholder="Cari nama, ID, email, outlet…" value={q} onChange={e => setQ(e.target.value)} /></div>
    {rows.length ? <div className="card">
      <table className="table">
        <thead><tr>{['Pengguna', 'Outlet', 'Akses', 'Status', 'Password', ''].map(t => <th key={t}>{t}</th>)}</tr></thead>
        <tbody>{rows.map(u => (
          <tr key={u.id}>
            <td data-label="Pengguna"><b>{u.name}</b><div className="small muted">{u.id} · {u.email}</div></td>
            <td data-label="Outlet">{u.outlet || '–'}<div className="small muted">{u.job}</div></td>
            <td data-label="Akses">{u.role ? <Pill label={ROLE_LABEL[u.role]} cls={u.role === 'SUPER_ADMIN' ? 'red' : 'go'} /> : <span className="muted small">{[u.enrollments ? 'Trainee' : '', u.mentees ? 'Mentor' : ''].filter(Boolean).join(' · ') || '–'}</span>}</td>
            <td data-label="Status">{u.active ? <Pill label="Aktif" cls="go" icon="check" /> : <Pill label="Nonaktif" cls="lock" icon="lock" />}</td>
            <td data-label="Password">{u.hasPassword ? <span className="small muted">Sudah dibuat</span> : <Pill label="Belum ada" cls="red" />}</td>
            <td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              <button className="btn" onClick={() => setForm({ u })}>Ubah</button>
              {u.id !== me.id ? <button className="btn" title="Buat password sementara" onClick={() => reset(u)}><Icon name="key" />Password</button> : null}
            </div></td>
          </tr>))}</tbody>
      </table>
    </div> : <Empty icon="users">Tidak ada pengguna yang cocok.</Empty>}
    {form ? <UserForm u={form.u} onClose={() => setForm(null)} onSaved={reload} /> : null}
    {pw ? <PasswordResult result={pw} onClose={() => setPw(null)} /> : null}
  </>);
}
