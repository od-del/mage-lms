'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon, ROLE_LABEL, initials, api, toast, Modal, Busy, PwField, PwRules, Notice, Overlays } from './ui';

// Menu dikelompokkan per peran; hanya item yang boleh diakses yang tampil.
export const NAV = [
  { group: 'Belajar', items: [
    { id: 'home', href: '/', label: 'Beranda', icon: 'home', any: true, bottom: true },
    { id: 'learning', href: '/learning', label: 'Pembelajaran Saya', short: 'Belajar', icon: 'book', role: 'TRAINEE', bottom: true },
    { id: 'sop', href: '/sop', label: 'SOP', icon: 'doc', any: true, bottom: true }] },
  { group: 'Mentor', items: [
    { id: 'mentees', href: '/mentees', label: 'Trainee Bimbingan', short: 'Bimbingan', icon: 'users', role: 'MENTOR', bottom: true }] },
  { group: 'Admin', items: [
    { id: 'dash', href: '/dashboard', label: 'Dashboard', icon: 'dash', role: 'ADMIN', bottom: true },
    { id: 'all', href: '/participants', label: 'Semua Peserta', icon: 'grid', role: 'ADMIN' },
    { id: 'enroll', href: '/enroll', label: 'Daftarkan Peserta', icon: 'plus', role: 'ADMIN' }] },
  { group: 'Super Admin', items: [
    { id: 'curricula', href: '/curricula', label: 'Kurikulum', icon: 'layers', role: 'SUPER_ADMIN' },
    { id: 'content', href: '/content', label: 'Kelola Materi', icon: 'file', role: 'SUPER_ADMIN' },
    { id: 'users', href: '/users', label: 'Pengguna', icon: 'shield', role: 'SUPER_ADMIN' },
    { id: 'system', href: '/system', label: 'Sistem', icon: 'cog', role: 'SUPER_ADMIN' }] },
];

const Ctx = createContext(null);
export const useShell = () => useContext(Ctx);

// Halaman memanggil useCrumbs([['Label', '/href'], ['Judul']]) untuk mengisi breadcrumb & judul tab.
export function useCrumbs(list) {
  const { setCrumbs } = useShell();
  const key = JSON.stringify(list);
  useEffect(() => { if (list) setCrumbs(list); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key]);
}

function ChangePassword({ me, onClose, onDone }) {
  const [cur, setCur] = useState(''), [np, setNp] = useState(''), [cp, setCp] = useState(''), [err, setErr] = useState('');
  const save = async () => {
    if (np !== cp) return setErr('Kedua password baru tidak sama.');
    try { await api('changePassword', { current: cur, next: np }); toast('Password disimpan'); onDone(); onClose(); }
    catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={me.hasPassword ? 'Ganti password' : 'Buat password'} onClose={onClose}>
      {me.hasPassword ? <><label className="f">Password lama</label><PwField value={cur} onChange={setCur} /></> : null}
      <label className="f">Password baru</label><PwField value={np} onChange={setNp} autoComplete="new-password" /><PwRules value={np} />
      <label className="f">Ulangi password baru</label><PwField value={cp} onChange={setCp} autoComplete="new-password" />
      {err ? <div style={{ marginTop: 10 }}><Notice err>{err}</Notice></div> : null}
      <div className="row"><button className="btn" onClick={onClose}>Batal</button><Busy className="btn primary" onClick={save}>Simpan</Busy></div>
    </Modal>);
}

export default function Shell({ children }) {
  const router = useRouter(), path = usePathname();
  const [me, setMe] = useState(null), [error, setError] = useState('');
  const [badges, setBadges] = useState({}), [crumbs, setCrumbs] = useState([]);
  const [drawer, setDrawer] = useState(false), [pw, setPw] = useState(false), [scrolled, setScrolled] = useState(false);
  const [lastList, setLastList] = useState('home');

  const loadMe = useCallback(() => api('me').then(setMe).catch(e => setError(e.message)), []);
  const refreshBadges = useCallback(async home => {
    try {
      const d = home || await api('home');
      const late = d.tasks.filter(t => t.overdue).length;
      setBadges({ home: late || d.tasks.length || 0, homeRed: late > 0, mentees: d.queue.length, menteesRed: d.queue.some(q => q.overdue) });
    } catch { /* badge opsional */ }
  }, []);
  useEffect(() => { loadMe(); }, [loadMe]);
  useEffect(() => { if (me) refreshBadges(); }, [me, refreshBadges]);
  useEffect(() => { const f = () => setScrolled(window.scrollY > 4); window.addEventListener('scroll', f); return () => window.removeEventListener('scroll', f); }, []);

  const items = useMemo(() => me ? NAV.flatMap(g => g.items.map(i => ({ ...i, group: g.group }))).filter(i => i.any || me.roles.includes(i.role)) : [], [me]);
  const current = items.find(i => i.href === path) || items.filter(i => i.href !== '/' && path.startsWith(i.href))[0];
  useEffect(() => {
    setDrawer(false);
    if (current) { setLastList(current.id); setCrumbs([[current.group], [current.label]]); }
  }, [path, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (crumbs.length) document.title = crumbs[crumbs.length - 1][0] + ' · Mage LMS'; }, [crumbs]);

  const ctx = useMemo(() => ({ me, items, refreshBadges, setCrumbs, lastList: items.find(i => i.id === lastList) || items[0], reloadMe: loadMe }), [me, items, refreshBadges, lastList, loadMe]);

  if (error) return <div className="boot"><div style={{ maxWidth: 420 }}><Notice err>{error}</Notice><button className="btn" style={{ marginTop: 12 }} onClick={() => location.reload()}>Coba lagi</button></div></div>;
  if (!me) return <div className="boot"><div className="row"><span className="spin" style={{ borderColor: 'var(--line)', borderTopColor: 'var(--blue-700)' }} /> Memuat Mage LMS…</div></div>;

  const active = current ? current.id : lastList;
  const badge = id => badges[id] ? <span className={'badge' + (badges[id + 'Red'] ? ' red' : '')} aria-label={badges[id] + ' perlu perhatian'}>{badges[id]}</span> : null;
  const quick = items.filter(i => i.bottom).slice(0, 4);
  const logout = async () => { await fetch('/api/auth', { method: 'DELETE' }); location.href = '/login'; };

  return (
    <Ctx.Provider value={ctx}>
      <div className={'shell' + (drawer ? ' drawer' : '')}>
        <aside className="side" aria-label="Navigasi utama">
          <div className="side-head"><div className="logo"><span className="mark">M</span>Mage LMS</div>
            <button className="iconbtn only-m" aria-label="Tutup menu" onClick={() => setDrawer(false)}><Icon name="x" /></button></div>
          <nav>{NAV.map(g => {
            const list = items.filter(i => i.group === g.group);
            return list.length ? <div className="nav-group" key={g.group}><span>{g.group}</span>
              {list.map(i => <Link key={i.id} href={i.href} className={'nav-item' + (i.id === active ? ' on' : '')} aria-current={i.id === active ? 'page' : undefined}><Icon name={i.icon} />{i.label}{badge(i.id)}</Link>)}
            </div> : null;
          })}</nav>
          <div className="side-foot">
            <div className="avatar" title={me.email}>{initials(me.name)}</div>
            <div className="who"><b>{me.name}</b><span>{me.roles.map(r => ROLE_LABEL[r]).join(' · ') || 'Tanpa peran'}</span></div>
            <div className="tools" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              <button className="iconbtn" title={me.hasPassword ? 'Ganti password' : 'Buat password'} aria-label="Ganti password" onClick={() => setPw(true)}><Icon name="key" /></button>
              <button className="iconbtn" title="Keluar" aria-label="Keluar" onClick={logout}><Icon name="logout" /></button>
            </div>
          </div>
        </aside>
        <div className="scrim" onClick={() => setDrawer(false)} />
        <div className="content">
          <header className={'topbar' + (scrolled ? ' scrolled' : '')}>
            <button className="iconbtn only-m" aria-label="Buka menu" onClick={() => setDrawer(true)}><Icon name="menu" /></button>
            <div className="crumbs">{crumbs.flatMap((c, i) => [
              i ? <span key={'s' + i} aria-hidden="true">›</span> : null,
              c[1] && i < crumbs.length - 1 ? <Link key={i} href={c[1]}>{c[0]}</Link> : i === crumbs.length - 1 ? <b key={i}>{c[0]}</b> : <span key={i}>{c[0]}</span>])}</div>
          </header>
          <main><div className="wrap">{items.length ? children : <div className="card empty"><Icon name="lock" /><div>Akun kamu belum punya akses ke menu mana pun. Hubungi admin.</div></div>}</div></main>
        </div>
        <nav className="bottom" aria-label="Navigasi cepat">
          {quick.map(i => <button key={i.id} className={i.id === active ? 'on' : ''} aria-current={i.id === active ? 'page' : undefined} onClick={() => router.push(i.href)}><Icon name={i.icon} />{i.short || i.label}{badge(i.id)}</button>)}
          {items.length > quick.length ? <button onClick={() => setDrawer(true)}><Icon name="menu" />Menu</button> : null}
        </nav>
      </div>
      {pw ? <ChangePassword me={me} onClose={() => setPw(false)} onDone={loadMe} /> : null}
      <Overlays />
    </Ctx.Provider>);
}
