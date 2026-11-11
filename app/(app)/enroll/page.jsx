'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Head, Icon, Notice, Busy, initials, api, toast, confirmBox } from '@/components/ui';

export default function Enroll() {
  const [emp, setEmp] = useState(''), [opt, setOpt] = useState(null), [loaded, setLoaded] = useState('');
  const [cur, setCur] = useState(''), [mentor, setMentor] = useState(''), [q, setQ] = useState('');
  const [msg, setMsg] = useState(null), [previewed, setPreviewed] = useState('');
  const key = [loaded, cur, mentor].join('|');
  const ok = !!loaded && emp.trim() === loaded && !!cur && !!mentor;
  const step = !loaded || emp.trim() !== loaded ? 1 : !ok ? 2 : 3;
  const c = opt && opt.curricula.find(x => x.id === cur);
  const pool = c ? c.mentors : [];
  const m = pool.find(x => x.id === mentor);

  const load = async () => {
    const id = emp.trim();
    if (!id) return setMsg({ err: true, text: 'Isi ID karyawan terlebih dahulu.' });
    setLoaded(''); setOpt(null); setPreviewed(''); setMsg(null); setCur(''); setMentor('');
    try {
      const d = await api('enrollmentOptions', { employeeId: id });
      setOpt(d); setLoaded(d.employee.id); setEmp(d.employee.id);
      if (d.curricula.length === 1) setCur(d.curricula[0].id);
      if (!d.curricula.length) setMsg({ err: true, text: 'Belum ada kurikulum aktif yang bisa didaftarkan untuk karyawan ini.' + (d.taken.length ? ' Sudah terdaftar di: ' + d.taken.join(', ') + '.' : '') });
    } catch (e) { setMsg({ err: true, text: e.message }); }
  };
  const run = async preview => {
    if (!preview && !(await confirmBox('Buat pendaftaran?', 'Pendaftaran, tugas stage pertama, dan mentor untuk ' + opt.employee.name + ' akan dibuat.', 'Ya, buat'))) return;
    try {
      const r = await api('enrollmentCreate', { employeeId: loaded, curriculumId: cur, mentorId: mentor, preview });
      setMsg({ result: r });
      if (preview) setPreviewed(key);
      else { setPreviewed(''); toast('Pendaftaran ' + r.enrollmentId + ' dibuat'); setOpt(null); setLoaded(''); setEmp(''); setCur(''); setMentor(''); }
    } catch (e) { setMsg({ err: true, text: e.message }); }
  };
  const mentors = pool.filter(x => [x.name, x.job, x.outlet].join(' ').toLowerCase().includes(q.trim().toLowerCase()));
  const r = msg && msg.result;
  return (<>
    <Head title="Kelola Peserta" sub="Daftarkan karyawan ke kurikulum; tugas stage pertama dan mentornya dibuat sekaligus." />
    <div className="two">
      <div className="card">
        <div className="steps">{['Karyawan', 'Kurikulum & mentor', 'Pratinjau & buat'].map((t, i) =>
          <div key={t} className={i + 1 === step ? 'on' : i + 1 < step ? 'ok' : ''}><i>{i + 1 < step ? '✓' : i + 1}</i>{t}</div>)}</div>
        <label className="f" htmlFor="emp">ID karyawan</label>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <div style={{ flex: 1 }}><input id="emp" className="input" placeholder="Contoh: SO20003" autoComplete="off" value={emp}
            onChange={e => { setEmp(e.target.value); setPreviewed(''); }} onKeyDown={e => { if (e.key === 'Enter') load(); }} /></div>
          <Busy className="btn" busyText="Mencari…" onClick={load}><Icon name="search" />Cari</Busy>
        </div>
        {opt && step > 1 ? <div className="person"><div className="avatar">{initials(opt.employee.name)}</div>
          <div><b>{opt.employee.name}</b><div className="small muted">{[opt.employee.id, opt.employee.job, opt.employee.outlet].filter(Boolean).join(' · ')}</div></div></div> : null}
        <label className="f" htmlFor="cur">Kurikulum</label>
        <select id="cur" className="input" disabled={step === 1} value={cur} onChange={e => { setCur(e.target.value); setMentor(''); setPreviewed(''); }}>
          <option value="">{step === 1 ? 'Cari karyawan terlebih dahulu' : 'Pilih kurikulum'}</option>
          {opt ? opt.curricula.map(x => <option key={x.id} value={x.id}>{x.name}</option>) : null}
        </select>
        <label className="f" htmlFor="mq">Mentor</label>
        <input id="mq" className="input" type="search" placeholder="Cari nama mentor…" disabled={step === 1 || !c} value={q} onChange={e => setQ(e.target.value)} />
        <div style={{ marginTop: 8 }}>
          <select className="input" aria-label="Pilih mentor" disabled={step === 1 || !c} value={mentor} onChange={e => { setMentor(e.target.value); setPreviewed(''); }}>
            <option value="">{!c ? 'Pilih kurikulum terlebih dahulu' : pool.length ? 'Pilih mentor' : 'Belum ada mentor berwenang'}</option>
            {mentors.map(x => <option key={x.id} value={x.id}>{x.name}{[x.job, x.outlet].filter(Boolean).length ? ' — ' + [x.job, x.outlet].filter(Boolean).join(' · ') : ''}</option>)}
          </select>
          {c && !pool.length ? <div style={{ marginTop: 8 }}><Notice err>Belum ada mentor/trainer yang berwenang membimbing {c.name}. Tambahkan di <Link href="/master?tab=mentors">Master Data → Mentor & Trainer</Link>.</Notice></div>
            : c ? <div className="small muted" style={{ marginTop: 4 }}>Hanya mentor/trainer yang berwenang untuk kurikulum ini (Master Data).</div> : null}
        </div>
        <div className="row" style={{ marginTop: 18 }}>
          <Busy className="btn" busyText="Memeriksa…" disabled={!ok} onClick={() => run(true)}>Pratinjau</Busy>
          <Busy className="btn primary" busyText="Membuat…" disabled={!ok || previewed !== key} onClick={() => run(false)}><Icon name="plus" />Buat pendaftaran</Busy>
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>Tombol Buat aktif setelah Pratinjau berhasil untuk pilihan yang sama.</p>
        <div style={{ marginTop: 14 }}>
          {msg && msg.err ? <Notice err>{msg.text}</Notice> : null}
          {r ? <div className="notice"><Icon name={r.preview ? 'info' : 'check'} /><div>
            <b>{r.preview ? 'Pratinjau — data belum ditulis' : 'Pendaftaran berhasil dibuat'}</b>
            <div className="small" style={{ marginTop: 4 }}>{r.employee.name} → {r.curriculum.name} · mentor {r.mentor.name}</div>
            <div className="small">Stage pertama: {r.stage} · {r.newAssignments} tugas baru</div>
            {!r.preview ? <div className="small" style={{ marginTop: 6 }}><Link href={'/enrollment/' + encodeURIComponent(r.enrollmentId)}>Buka progres peserta →</Link></div> : null}
          </div></div> : null}
        </div>
      </div>
      <div className="card summary stack">
        <h2>Ringkasan</h2>
        <dl><dt>Karyawan</dt><dd>{opt && step > 1 ? opt.employee.name + ' (' + opt.employee.id + ')' : '–'}</dd>
          <dt>Kurikulum</dt><dd>{c ? c.name : '–'}</dd><dt>Mentor</dt><dd>{m ? m.name : '–'}</dd></dl>
        <Notice>Hanya stage pertama yang dibuat sekarang. Stage berikutnya terbuka otomatis setelah stage sebelumnya selesai.</Notice>
      </div>
    </div>
  </>);
}
