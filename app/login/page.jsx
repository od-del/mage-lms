'use client';
import { useState } from 'react';
import { Icon, Notice, PwField } from '@/components/ui';

export default function Login() {
  const [email, setEmail] = useState(''), [pw, setPw] = useState('');
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), [forgot, setForgot] = useState(false);
  const submit = async e => {
    e.preventDefault();
    if (!email.trim() || !pw) return setErr('Isi email dan password.');
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Gagal masuk.');
      const next = new URLSearchParams(location.search).get('next');
      location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };
  return (
    <div className="login">
      <div className="brandside">
        <div>
          <div className="logo"><span className="mark">M</span>Mage LMS</div>
          <h1>Belajar, praktik, dan naik level bersama tim.</h1>
          <p>Pantau kurikulum, stage, dan nilai pre/post-test di satu tempat.</p>
          <ul>
            <li><Icon name="book" />Progress belajar per stage</li>
            <li><Icon name="users" />Mentor memantau trainee bimbingan</li>
            <li><Icon name="shield" />Admin mendaftarkan peserta dengan aman</li>
          </ul>
        </div>
        <div className="small" style={{ opacity: .7, position: 'relative', zIndex: 1 }}>© Mage LMS · prototipe</div>
      </div>
      <div className="form"><div>
        <form onSubmit={submit}>
          <h2>Masuk</h2>
          <p className="muted" style={{ margin: 0 }}>Gunakan email dan password LMS kamu.</p>
          {err ? <div style={{ marginTop: 14 }}><Notice err>{err}</Notice></div> : null}
          <label className="f" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nama@contoh.com" autoComplete="email" autoFocus />
          <label className="f" htmlFor="pass">Password</label>
          <PwField id="pass" value={pw} onChange={setPw} placeholder="Password" />
          <button className="btn primary block" style={{ marginTop: 16 }} disabled={busy}>{busy ? <><span className="spin" />Masuk…</> : 'Masuk'}</button>
          <div className="row" style={{ marginTop: 14 }}><button type="button" className="btn link small" onClick={() => setForgot(!forgot)}>Lupa password / belum punya password?</button></div>
          {forgot ? <div className="notice" style={{ marginTop: 10 }}><Icon name="info" /><div className="small">Minta Super Admin membuat <b>password sementara</b> di menu Pengguna, lalu ganti password lewat ikon 🔑 setelah masuk.</div></div> : null}
        </form>
      </div></div>
    </div>);
}
