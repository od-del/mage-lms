'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Head, Icon, Pill, Notice, Skeleton, Empty, Modal, Busy, api, toast, confirmBox, useApi } from '@/components/ui';
import { KIND_LABEL, RES_ICON } from '@/components/lms';

const RULE_LABEL = {
  SELF_CONFIRMED: 'Trainee menandai selesai',
  ACKNOWLEDGED: 'Trainee konfirmasi sudah paham',
  MENTOR_PASSED: 'Dinilai mentor (praktik)',
  PRE_SUBMITTED_AND_POST_PASSED: 'Pre-test dikerjakan & lulus post-test',
  ALL_REQUIRED_CHILDREN: 'Semua sub-aktivitas wajib selesai',
};
const TEST_LABEL = { PRE_TEST: 'pre-test', POST_TEST: 'post-test' };

function Field({ label, children }) { return <><label className="f">{label}</label>{children}</>; }
function Check({ label, value, onChange }) { return <label><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked ? 1 : 0)} />{label}</label>; }

function useForm(init) {
  const [v, setV] = useState(init);
  return [v, k => e => setV(s => ({ ...s, [k]: e && e.target ? e.target.value : e })), setV];
}

function Footer({ onClose, onSave }) {
  return <div className="row"><button className="btn" onClick={onClose}>Batal</button><Busy className="btn primary" onClick={onSave}>Simpan</Busy></div>;
}

// Penyimpanan pilihan tampilan per browser (opsional; aman bila diblokir).
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* opsional */ } },
};

function CurriculumForm({ c, onClose, onSaved }) {
  const [v, set] = useForm({ id: c?.id || '', newId: '', name: c?.name || '', description: c?.description || '', active: c ? c.active : 1 });
  const [err, setErr] = useState('');
  const save = async () => { try { await api('curriculumSave', v); toast('Kurikulum disimpan'); onSaved(); onClose(); } catch (e) { setErr(e.message); } };
  return (
    <Modal title={c ? 'Ubah kurikulum' : 'Kurikulum baru'} onClose={onClose}>
      <Field label="Nama kurikulum"><input className="input" value={v.name} onChange={set('name')} placeholder="Contoh: Barista Dasar" autoFocus /></Field>
      {!c ? <Field label="ID (opsional)"><input className="input" value={v.newId} onChange={set('newId')} placeholder="Otomatis dari nama, contoh: BARISTA_DASAR" /></Field> : null}
      <Field label="Deskripsi"><textarea className="input" rows={3} value={v.description} onChange={set('description')} /></Field>
      <div className="checks"><Check label="Aktif (bisa dipakai untuk pendaftaran baru)" value={v.active} onChange={set('active')} /></div>
      {err ? <div style={{ marginTop: 10 }}><Notice err>{err}</Notice></div> : null}
      <Footer onClose={onClose} onSave={save} />
    </Modal>);
}

function StageForm({ s, curriculumId, onClose, onSaved }) {
  const [v, set] = useForm({ id: s?.id || '', curriculum_id: curriculumId, name: s?.name || '', seq: s?.seq || '', active: s ? s.active : 1 });
  const [err, setErr] = useState('');
  const save = async () => { try { await api('stageSave', v); toast('Stage disimpan'); onSaved(); onClose(); } catch (e) { setErr(e.message); } };
  return (
    <Modal title={s ? 'Ubah stage' : 'Stage baru'} onClose={onClose}>
      <Field label="Nama stage"><input className="input" value={v.name} onChange={set('name')} placeholder="Contoh: Espresso Basic" autoFocus /></Field>
      <Field label="Urutan"><input className="input" type="number" min="1" value={v.seq} onChange={set('seq')} placeholder="Otomatis di akhir" /></Field>
      <div className="checks"><Check label="Aktif" value={v.active} onChange={set('active')} /></div>
      {err ? <div style={{ marginTop: 10 }}><Notice err>{err}</Notice></div> : null}
      <Footer onClose={onClose} onSave={save} />
    </Modal>);
}

// Daftar pilihan: dropdown "tambah" + baris yang bisa dihapus (dan diurutkan bila `ordered`).
function PickList({ items, options, onChange, placeholder, render, ordered }) {
  const byId = new Map(options.map(o => [o.id, o]));
  const free = options.filter(o => !items.includes(o.id));
  const move = (i, dir) => { const x = items.slice(); [x[i], x[i + dir]] = [x[i + dir], x[i]]; onChange(x); };
  return (<>
    {items.length ? <div className="pick-list">{items.map((id, i) => (
      <div className="pick-row" key={id}>
        <div style={{ minWidth: 0, flex: 1 }}>{byId.has(id) ? render(byId.get(id)) : <span className="muted">{id} (tidak tersedia)</span>}</div>
        {ordered ? <>
          <button type="button" className="iconbtn" aria-label="Naikkan" disabled={!i} onClick={() => move(i, -1)}><Icon name="collapse" /></button>
          <button type="button" className="iconbtn" aria-label="Turunkan" disabled={i === items.length - 1} onClick={() => move(i, 1)}><Icon name="expand" /></button>
        </> : null}
        <button type="button" className="iconbtn" aria-label="Hapus dari daftar" onClick={() => onChange(items.filter(x => x !== id))}><Icon name="x" /></button>
      </div>))}</div> : null}
    {free.length ? <select className="input" style={{ marginTop: 8 }} value="" aria-label={placeholder} onChange={e => e.target.value && onChange([...items, e.target.value])}>
      <option value="">{placeholder}</option>{free.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select> : null}
  </>);
}

function ActivityForm({ a, stage, tree, onClose, onSaved }) {
  const [v, set, setV] = useForm(a ? { ...a, resources: a.resources.map(r => r.id), mentor_ids: a.mentor_ids || [] }
    : { stage_id: stage.id, name: '', rule: 'SELF_CONFIRMED', parent_id: '', seq: '', required_for_stage: 1, required_for_parent: 1, pre_required: 0, post_required: 0, passing_score: 70, due_days: '', prerequisite_id: '', active: 1, resources: [], mentor_ids: [] });
  const [err, setErr] = useState('');
  const roots = stage.activities.filter(x => !x.parent_id && x.id !== v.id);
  const lib = tree.library.map(r => ({ ...r, label: (KIND_LABEL[r.kind] || r.kind) + ': ' + r.title + (r.tests.length ? ' (+ ' + r.tests.map(t => TEST_LABEL[t]).join(', ') + ')' : '') }));
  const mentors = tree.mentors.filter(m => m.curricula.includes(stage.curriculum_id))
    .map(m => ({ ...m, label: m.name + ([m.job, m.outlet].filter(Boolean).length ? ' — ' + [m.job, m.outlet].filter(Boolean).join(' · ') : '') }));
  const pickedTests = lib.filter(r => v.resources.includes(r.id)).flatMap(r => r.kind === 'PRE_TEST' || r.kind === 'POST_TEST' ? [r.kind] : r.tests);
  const save = async () => { try { await api('activitySave', v); toast('Aktivitas disimpan'); onSaved(); onClose(); } catch (e) { setErr(e.message); } };
  return (
    <Modal title={a ? 'Ubah aktivitas' : 'Aktivitas baru · ' + stage.name} onClose={onClose} wide>
      <Field label="Nama aktivitas"><input className="input" value={v.name} onChange={set('name')} placeholder="Contoh: Kalibrasi grinder" autoFocus /></Field>
      <Field label="Cara aktivitas dinyatakan selesai">
        <select className="input" value={v.rule} onChange={set('rule')}>{Object.entries(RULE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      {v.rule === 'MENTOR_PASSED' ? <div className="sub-box">
        <b>Bimbingan mentor</b>
        <div className="small muted">Mentor/trainer yang boleh mendampingi praktik ini. Trainee memilih salah satunya saat praktik. Kosong = semua mentor yang berwenang di kurikulum ini.</div>
        {mentors.length ? <PickList items={v.mentor_ids} options={mentors} onChange={x => setV(s => ({ ...s, mentor_ids: x }))} placeholder="+ Tambah mentor/trainer…"
          render={m => <span><b>{m.name}</b> <span className="small muted">{[m.job, m.outlet].filter(Boolean).join(' · ')}</span></span>} />
          : <div style={{ marginTop: 8 }}><Notice err>Belum ada mentor/trainer yang berwenang untuk kurikulum ini. Tambahkan di <Link href="/master?tab=mentors">Master Data</Link>.</Notice></div>}
      </div> : null}
      <div className="sub-box">
        <b>Materi</b>
        <div className="small muted">Pilih dari perpustakaan Kelola Materi. Satu materi bisa dipakai di banyak aktivitas; pre/post-test modul ikut otomatis.</div>
        <PickList ordered items={v.resources} options={lib} onChange={x => setV(s => ({ ...s, resources: x }))} placeholder="+ Tambah materi dari perpustakaan…"
          render={r => <span className="pick-item"><Icon name={RES_ICON[r.kind] || 'file'} /><span className="pick-title">{r.title}</span>
            <span className="small muted">{KIND_LABEL[r.kind]}{r.tests.length ? ' + ' + r.tests.map(t => TEST_LABEL[t]).join(', ') : ''}</span></span>} />
        {!lib.length ? <p className="small muted">Perpustakaan masih kosong. <Link href="/content">Tambah materi di Kelola Materi</Link>.</p> : null}
      </div>
      <div className="grid2">
        <div><Field label="Induk (opsional)"><select className="input" value={v.parent_id || ''} onChange={set('parent_id')}>
          <option value="">— Aktivitas utama —</option>{roots.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field></div>
        <div><Field label="Urutan"><input className="input" type="number" min="1" value={v.seq} onChange={set('seq')} placeholder="Otomatis di akhir" /></Field></div>
        <div><Field label="Prasyarat (opsional)"><select className="input" value={v.prerequisite_id || ''} onChange={set('prerequisite_id')}>
          <option value="">Tidak ada</option>{stage.activities.filter(x => x.id !== v.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field></div>
        <div><Field label="Tenggat (hari setelah dibuka)"><input className="input" type="number" min="1" value={v.due_days || ''} onChange={set('due_days')} placeholder="Default 14" /></Field></div>
        <div><Field label="Nilai lulus post-test"><input className="input" type="number" min="0" max="100" value={v.passing_score} onChange={set('passing_score')} /></Field></div>
      </div>
      <div className="checks">
        <Check label="Wajib untuk menyelesaikan stage" value={v.required_for_stage} onChange={set('required_for_stage')} />
        {v.parent_id ? <Check label="Wajib untuk menyelesaikan induknya" value={v.required_for_parent} onChange={set('required_for_parent')} /> : null}
        <Check label="Wajib pre-test" value={v.pre_required || pickedTests.includes('PRE_TEST')} onChange={set('pre_required')} />
        <Check label="Wajib lulus post-test" value={v.post_required || pickedTests.includes('POST_TEST')} onChange={set('post_required')} />
        <Check label="Aktif" value={v.active} onChange={set('active')} />
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>Test dari materi yang dipilih otomatis diwajibkan. Soal pre/post-test diatur di Kelola Materi. Perubahan langsung berlaku untuk peserta yang stage-nya sudah terbuka.</p>
      {err ? <div style={{ marginTop: 10 }}><Notice err>{err}</Notice></div> : null}
      <Footer onClose={onClose} onSave={save} />
    </Modal>);
}

const matches = (needle, ...parts) => parts.join(' ').toLowerCase().includes(needle);

export default function Curricula() {
  const { data: d, error, loading, reload } = useApi('curriculumTree');
  const [form, setForm] = useState(null), [q, setQ] = useState('');
  const [view, setView] = useState('list'), [open, setOpen] = useState(() => new Set()), [sel, setSel] = useState(null);
  useEffect(() => { setView(store.get('mlms.curricula.view', 'list')); }, []);
  const changeView = v => { setView(v); store.set('mlms.curricula.view', v); };
  const close = () => setForm(null);
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => !d ? [] : d.curricula.map(c => {
    if (!needle) return { c, hit: false };
    const self = matches(needle, c.name, c.id, c.description);
    const inside = c.stages.some(s => matches(needle, s.name) || s.activities.some(a => matches(needle, a.name)));
    return self || inside ? { c, hit: inside } : null;
  }).filter(Boolean), [d, needle]);
  const mentorName = useMemo(() => new Map((d?.mentors || []).map(m => [m.id, m.name])), [d]);

  if (loading && !d) return <><Head title="Kurikulum" sub="Struktur kurikulum, stage, dan aktivitas." /><Skeleton n={2} /></>;
  if (error) return <><Head title="Kurikulum" /><Notice err>{error}</Notice></>;

  const isOpen = c => open.has(c.id) || (needle && shown.find(x => x.c.id === c.id)?.hit);
  const toggle = id => setOpen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const remove = async (kind, item, used, usedMsg) => {
    if (used) return toast(usedMsg, true);
    const label = { c: 'kurikulum', s: 'stage', a: 'aktivitas' }[kind];
    const extra = kind === 'c' ? ' Semua stage dan aktivitasnya ikut terhapus.' : kind === 's' ? ' Semua aktivitasnya ikut terhapus.' : item.kids ? ' Sub-aktivitasnya ikut terhapus.' : '';
    if (!(await confirmBox('Hapus ' + label + ' ' + item.name + '?', 'Tindakan ini tidak bisa dibatalkan.' + extra + ' Materi di perpustakaan tidak ikut terhapus.', 'Hapus', true))) return;
    try {
      await api({ c: 'curriculumDelete', s: 'stageDelete', a: 'activityDelete' }[kind], { id: item.id });
      toast(label[0].toUpperCase() + label.slice(1) + ' dihapus'); reload();
    } catch (e) { toast(e.message, true); }
  };
  const del = (label, onClick) => <button key={'del-' + label} className="btn ghost-red" title={'Hapus ' + label} aria-label={'Hapus ' + label} onClick={onClick}><Icon name="trash" /></button>;

  const tree = c => (c.stages.length ? c.stages.map(s => (
    <div key={s.id} className="tree-stage">
      <div className="row">
        <div><div className="small muted" style={{ fontWeight: 700 }}>STAGE {s.seq}</div><b>{s.name}</b> {s.active ? null : <Pill label="Nonaktif" cls="lock" />}</div>
        <div className="row"><button className="btn" onClick={() => setForm({ type: 's', s, curriculumId: c.id })}>Ubah</button>
          <button className="btn" onClick={() => setForm({ type: 'a', stage: { ...s, curriculum_id: c.id } })}><Icon name="plus" />Aktivitas</button>
          {del('stage ' + s.name, () => remove('s', s, s.assigned, 'Stage ' + s.name + ' sudah berisi ' + s.assigned + ' tugas peserta, jadi tidak bisa dihapus. Nonaktifkan saja.'))}</div>
      </div>
      {s.activities.length ? s.activities.filter(a => !a.parent_id).flatMap(a => [a, ...s.activities.filter(k => k.parent_id === a.id)]).map(a => {
        const kids = s.activities.filter(k => k.parent_id === a.id);
        const used = a.assigned + kids.reduce((n, k) => n + k.assigned, 0);
        return (
          <div key={a.id} className={'tree-act' + (a.parent_id ? ' child' : '') + (a.active ? '' : ' off') + (needle && matches(needle, a.name) ? ' hit' : '')}>
            <div style={{ minWidth: 0 }}><b>{a.seq}. {a.name}</b>
              <div className="small muted">{RULE_LABEL[a.rule] || a.rule}{a.pre_required ? ' · pre-test' : ''}{a.post_required ? ' · post-test ≥ ' + a.passing_score : ''}{a.required_for_stage ? '' : ' · opsional'}{a.due_days ? ' · tenggat ' + a.due_days + ' hari' : ''}</div>
              {a.resources.length ? <div className="small tree-meta"><Icon name="file" />{a.resources.map(r => r.title + (r.active ? '' : ' (nonaktif)')).join(', ')}</div> : null}
              {a.rule === 'MENTOR_PASSED' ? <div className="small muted tree-meta"><Icon name="users" />{a.mentor_ids.length ? a.mentor_ids.map(id => mentorName.get(id) || id).join(', ') : 'Semua mentor berwenang'}</div> : null}
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              <button className="btn" onClick={() => setForm({ type: 'a', a, stage: { ...s, curriculum_id: c.id } })}>Ubah</button>
              {del('aktivitas ' + a.name, () => remove('a', { ...a, kids: kids.length }, used, 'Aktivitas ' + a.name + ' sudah dipakai ' + used + ' peserta, jadi tidak bisa dihapus. Nonaktifkan saja.'))}
            </div>
          </div>);
      }) : <p className="small muted" style={{ margin: '6px 0 0' }}>Belum ada aktivitas. Peserta tidak bisa lanjut melewati stage kosong.</p>}
    </div>)) : <p className="small muted">Belum ada stage.</p>);

  const actCount = c => c.stages.reduce((n, s) => n + s.activities.length, 0);
  return (<>
    <Head title="Kurikulum" sub="Struktur kurikulum → stage → aktivitas. Stage terbuka berurutan; aktivitas utama terbuka berurutan di dalam stage.">
      <button className="btn primary" onClick={() => setForm({ type: 'c' })}><Icon name="plus" />Kurikulum baru</button>
    </Head>
    {d.curricula.length ? <div className="row filters" style={{ marginBottom: 14 }}>
      <div className="search"><Icon name="search" /><input className="input" type="search" placeholder="Cari kurikulum, stage, atau aktivitas…" aria-label="Cari kurikulum" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="seg" role="group" aria-label="Tampilan">
        <button className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} onClick={() => changeView('list')}><Icon name="list" />List</button>
        <button className={view === 'grid' ? 'on' : ''} aria-pressed={view === 'grid'} onClick={() => changeView('grid')}><Icon name="grid" />Grid</button>
      </div>
    </div> : null}
    {needle ? <p className="small muted" style={{ marginTop: -6 }}>{shown.length} dari {d.curricula.length} kurikulum cocok dengan “{q.trim()}”.</p> : null}
    {d.curricula.length && shown.length && view === 'grid' ? <>
      <div className="cgrid">{shown.map(({ c, hit }) => {
        const on = sel === c.id;
        const pick = () => { setSel(on ? null : c.id); if (!on) setTimeout(() => document.getElementById('cpanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };
        return (
          <div key={c.id} className={'card ctile' + (c.active ? '' : ' off') + (on ? ' sel' : '') + (hit ? ' hit' : '')}
            role="button" tabIndex={0} aria-pressed={on} aria-label={'Lihat struktur ' + c.name} onClick={pick} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}>
            <div className="ctile-top">
              <div className="avatar"><Icon name="layers" /></div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h3 title={c.name}>{c.name}</h3>
                <div className="cid" title={c.id}>{c.id}</div>
              </div>
              {c.active ? null : <Pill label="Nonaktif" cls="lock" />}
            </div>
            <p className={'cdesc2' + (c.description ? '' : ' none')} title={c.description || ''}>{c.description || 'Belum ada deskripsi.'}</p>
            <div className="ctile-stats">
              <div><b>{c.stages.length}</b><span>Stage</span></div>
              <div><b>{actCount(c)}</b><span>Aktivitas</span></div>
              <div><b>{c.enrollments}</b><span>Peserta</span></div>
            </div>
            <div className="ctile-foot" onClick={e => e.stopPropagation()}>
              <button className="btn link small" onClick={pick}>{on ? 'Tutup struktur' : 'Lihat struktur'} <Icon name={on ? 'collapse' : 'chev'} /></button>
              <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                <button className="iconbtn" title="Ubah kurikulum" aria-label={'Ubah kurikulum ' + c.name} onClick={() => setForm({ type: 'c', c })}><Icon name="edit" /></button>
                <button className="iconbtn" title="Tambah stage" aria-label={'Tambah stage ke ' + c.name} onClick={() => setForm({ type: 's', curriculumId: c.id })}><Icon name="plus" /></button>
                <button className="iconbtn danger" title="Hapus kurikulum" aria-label={'Hapus kurikulum ' + c.name}
                  onClick={() => remove('c', c, c.enrollments, 'Kurikulum ' + c.name + ' sudah dipakai ' + c.enrollments + ' pendaftaran, jadi tidak bisa dihapus. Nonaktifkan saja (Ubah → hilangkan centang Aktif).')}><Icon name="trash" /></button>
              </div>
            </div>
          </div>);
      })}</div>
      {(() => {
        const c = shown.find(x => x.c.id === sel)?.c;
        return c ? (
          <div id="cpanel" className="card cpanel">
            <div className="ccard-head">
              <div style={{ minWidth: 220, flex: 1 }}><div className="small muted" style={{ fontWeight: 700 }}>STRUKTUR KURIKULUM</div>
                <h2 style={{ margin: 0 }}>{c.name} {c.active ? null : <Pill label="Nonaktif" cls="lock" />}</h2>
                {c.description ? <div className="small muted">{c.description}</div> : null}</div>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn" onClick={() => setForm({ type: 's', curriculumId: c.id })}><Icon name="plus" />Stage</button>
                <button className="iconbtn" aria-label="Tutup struktur" onClick={() => setSel(null)}><Icon name="x" /></button></div>
            </div>
            {tree(c)}
          </div>) : null;
      })()}
    </> : d.curricula.length ? (shown.length ? <div className="stack">{shown.map(({ c }) => {
      const on = isOpen(c);
      return (
        <div key={c.id} className={'card ccard' + (c.active ? '' : ' off') + (on ? ' open' : '')}>
          <div className="ccard-head">
            <button className="ctoggle" aria-expanded={!!on} onClick={() => toggle(c.id)}>
              <span className={'chev' + (on ? ' down' : '')}><Icon name="chev" /></span>
              <span style={{ minWidth: 0 }}><h2 style={{ margin: 0 }}>{c.name} {c.active ? null : <Pill label="Nonaktif" cls="lock" />}</h2>
                <span className="small muted">{c.id} · {c.stages.length} stage · {actCount(c)} aktivitas · {c.enrollments} pendaftaran</span>
                {c.description && on ? <span className="small muted cdesc">{c.description}</span> : null}</span>
            </button>
            <div className="row" style={{ gap: 6 }}><button className="btn" onClick={() => setForm({ type: 'c', c })}><Icon name="edit" />Ubah</button>
              <button className="btn" onClick={() => setForm({ type: 's', curriculumId: c.id })}><Icon name="plus" />Stage</button>
              {del('kurikulum ' + c.name, () => remove('c', c, c.enrollments, 'Kurikulum ' + c.name + ' sudah dipakai ' + c.enrollments + ' pendaftaran, jadi tidak bisa dihapus. Nonaktifkan saja (Ubah → hilangkan centang Aktif).'))}</div>
          </div>
          {on ? tree(c) : null}
        </div>);
    })}</div> : <Empty icon="search">Tidak ada kurikulum yang cocok.</Empty>)
      : <Empty icon="layers">Belum ada kurikulum. Klik “Kurikulum baru”.</Empty>}
    {form?.type === 'c' ? <CurriculumForm c={form.c} onClose={close} onSaved={reload} /> : null}
    {form?.type === 's' ? <StageForm s={form.s} curriculumId={form.curriculumId} onClose={close} onSaved={reload} /> : null}
    {form?.type === 'a' ? <ActivityForm a={form.a} stage={form.stage} tree={d} onClose={close} onSaved={reload} /> : null}
  </>);
}
