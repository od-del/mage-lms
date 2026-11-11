'use client';
// Komponen & helper bersama (port dari helper h()/pill()/toast()/confirmBox() di WebApp.html).
import { useCallback, useEffect, useRef, useState } from 'react';

const ICONS = {
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .8 3.2 2.6 3.5 5.2"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6l1-7z"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3z"/><path d="m9 12 2 2 4-4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5.5 3.5-5.5 3.5z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
  alert: '<path d="M12 3.5 2.5 20h19L12 3.5z"/><path d="M12 10v4.5M12 17v.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6l2-8z"/>',
  file: '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8l-5-5z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h5"/>',
  doc: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5"/><path d="m9 14 2 2 4-4"/>',
  clip: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9zM9 11h6M9 15h4"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  dash: '<rect x="3" y="3" width="8" height="10" rx="1.5"/><rect x="13" y="3" width="8" height="6" rx="1.5"/><rect x="13" y="11" width="8" height="10" rx="1.5"/><rect x="3" y="15" width="8" height="6" rx="1.5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  db: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13"/><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  tool: '<path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5"/><path d="M14.5 6.5 17 4l3 3-2.5 2.5"/>',
  expand: '<path d="m7 9 5 5 5-5"/>',
  collapse: '<path d="m7 15 5-5 5 5"/>',
};

export function Icon({ name }) {
  return <span className="ico" aria-hidden="true" dangerouslySetInnerHTML={{ __html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>' }} />;
}

export const ROLE_LABEL = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin/HR', MENTOR: 'Mentor', TRAINEE: 'Trainee' };
const STATUS = {
  Completed: ['Selesai', 'done', 'check'], DONE: ['Selesai', 'done', 'check'],
  Assigned: ['Bisa dikerjakan', 'go', 'play'], IN_PROGRESS: ['Berjalan', 'go', 'play'],
  Locked: ['Terkunci', 'lock', 'lock'], NOT_OPEN: ['Belum dibuka', 'lock', 'lock'],
};
export const fmt = v => v === null || v === undefined || v === '' ? '–' : String(v);
export const pct = v => v === null || v === undefined || v === '' ? '–' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%';
export const initials = name => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
export const fmtDate = v => v ? new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
export const fmtDateTime = v => v ? new Date(v).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';

export function Pill({ status, label, cls, icon }) {
  const s = STATUS[status];
  return <span className={'pill ' + (cls || (s ? s[1] : 'role'))}>{icon ? <Icon name={icon} /> : s ? <Icon name={s[2]} /> : null}{label || (s ? s[0] : status)}</span>;
}
export const Notice = ({ children, err }) => <div className={'notice' + (err ? ' err' : '')}><Icon name={err ? 'alert' : 'info'} /><div>{children}</div></div>;
export const Empty = ({ children, icon = 'inbox' }) => <div className="card empty"><Icon name={icon} /><div>{children}</div></div>;
export const Skeleton = ({ n = 3 }) => (
  <div className="grid">{Array.from({ length: n }, (_, i) => (
    <div key={i} className="card"><div className="sk" style={{ height: 18, width: '60%' }} /><div className="sk" style={{ height: 12, width: '35%', marginTop: 10 }} /><div className="sk" style={{ height: 8, marginTop: 22 }} /></div>))}
  </div>);
export const Head = ({ title, sub, children }) => (
  <div className="page-head"><div style={{ flex: 1 }}><h1>{title}</h1>{sub ? <p>{sub}</p> : null}</div>{children}</div>);
export const Progress = ({ value }) => <div className="progress"><span style={{ width: (value || 0) + '%' }} /></div>;

/* ---------- API ---------- */
export async function api(action, params = {}) {
  let res;
  try {
    res = await fetch('/api/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, params }) });
  } catch {
    throw new Error('Tidak bisa terhubung ke server. Periksa koneksi internet.');
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && body.auth && typeof window !== 'undefined' && !location.pathname.startsWith('/login')) {
    location.href = '/login?next=' + encodeURIComponent(location.pathname);
  }
  if (!res.ok) throw new Error(body.error || 'Permintaan gagal (' + res.status + ').');
  return body.data;
}

// useApi('home') → { data, error, loading, reload }
export function useApi(action, params, deps = []) {
  const [state, set] = useState({ data: null, error: '', loading: true });
  const key = JSON.stringify(params || {});
  const load = useCallback(async () => {
    set(s => ({ ...s, loading: true, error: '' }));
    try { set({ data: await api(action, params || {}), error: '', loading: false }); }
    catch (e) { set({ data: null, error: e.message, loading: false }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, key, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/* ---------- toast & dialog global ---------- */
const listeners = new Set();
let toastsState = [], dialogState = null, seq = 0;
const emit = () => listeners.forEach(l => l());
export function toast(text, err) {
  const id = ++seq;
  toastsState = [...toastsState, { id, text, err }]; emit();
  setTimeout(() => { toastsState = toastsState.filter(t => t.id !== id); emit(); }, 4500);
}
export function confirmBox(title, body, okLabel = 'Lanjutkan', danger = false) {
  return new Promise(resolve => { dialogState = { title, body, okLabel, danger, resolve }; emit(); });
}
function closeDialog(v) { const d = dialogState; dialogState = null; emit(); if (d) d.resolve(v); }

export function Overlays() {
  const [, force] = useState(0);
  useEffect(() => { const l = () => force(n => n + 1); listeners.add(l); return () => listeners.delete(l); }, []);
  const okRef = useRef(null);
  useEffect(() => {
    if (!dialogState) return;
    okRef.current?.focus();
    const esc = e => { if (e.key === 'Escape') closeDialog(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  });
  return (<>
    <div className="toasts" aria-live="polite">{toastsState.map(t => <div key={t.id} className={'toast' + (t.err ? ' err' : '')} role="status"><Icon name={t.err ? 'alert' : 'check'} />{t.text}</div>)}</div>
    {dialogState ? (
      <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) closeDialog(false); }}>
        <div className="modal" role="dialog" aria-modal="true">
          <h2>{dialogState.title}</h2><p className="muted">{dialogState.body}</p>
          <div className="row"><button className="btn" onClick={() => closeDialog(false)}>Batal</button>
            <button ref={okRef} className={'btn ' + (dialogState.danger ? 'red' : 'primary')} onClick={() => closeDialog(true)}>{dialogState.okLabel}</button></div>
        </div>
      </div>) : null}
  </>);
}

// Dialog dengan isi bebas (form).
export function Modal({ title, children, onClose, wide }) {
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}><h2>{title}</h2>{children}</div>
    </div>);
}

// Tombol yang menampilkan spinner selama onClick (async) berjalan.
export function Busy({ onClick, children, busyText = 'Menyimpan…', className = 'btn', ...rest }) {
  const [busy, setBusy] = useState(false);
  return (
    <button {...rest} className={className} disabled={busy || rest.disabled} onClick={async e => {
      setBusy(true);
      try { await onClick(e); } finally { setBusy(false); }
    }}>{busy ? <><span className="spin" />{busyText}</> : children}</button>);
}

export function PwField({ value, onChange, placeholder, autoComplete = 'current-password', id }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw">
      <input id={id} className="input" type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} />
      <button type="button" className="eye" aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'} onClick={() => setShow(!show)}><Icon name="eye" /></button>
    </div>);
}
export function PwRules({ value }) {
  return (
    <ul className="rules">{[['Minimal 8 karakter', value.length >= 8], ['Mengandung huruf dan angka', /[A-Za-z]/.test(value) && /\d/.test(value)]]
      .map(([t, ok]) => <li key={t} className={ok ? 'ok' : ''}><Icon name={ok ? 'check' : 'info'} />{t}</li>)}</ul>);
}

export function download(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
