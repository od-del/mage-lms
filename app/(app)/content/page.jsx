'use client';
import { useMemo, useState } from 'react';
import { Head, Icon, Pill, Notice, Skeleton, Empty, Modal, Busy, api, toast, confirmBox, useApi } from '@/components/ui';
import { KIND_LABEL, RES_ICON, CATEGORY_LABEL, isTest } from '@/components/lms';

// Kelola Materi = perpustakaan master. Materi tidak perlu dikaitkan ke kurikulum di sini;
// pengaitan ke aktivitas dilakukan di halaman Kurikulum, jadi satu materi bisa dipakai berkali-kali.
function ContentEditor({ c, r, preset, onClose, onSaved }) {
  const [v, setV] = useState({
    kind: r?.kind || preset.kind || 'MODULE', title: r?.title || '', url: r?.url || '',
    seq: r?.seq || '', active: r ? r.active : true, parent_id: r?.parent_id || preset.parent || '',
    positions: r?.positions || [], restrict: !!(r?.positions || []).length,
  });
  const [err, setErr] = useState('');
  const set = k => e => setV(s => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const test = isTest(v.kind);
  const parents = c.resources.filter(x => !isTest(x.kind) && x.active && (!r || x.id !== r.id));
  const togglePos = id => setV(s => ({ ...s, positions: s.positions.includes(id) ? s.positions.filter(x => x !== id) : [...s.positions, id] }));
  const save = async () => {
    if (!test && v.restrict && !v.positions.length) return setErr('Pilih minimal satu jabatan, atau pilih "Semua jabatan".');
    try {
      const res = await api('contentSave', { id: r?.id, kind: v.kind, title: v.title, url: v.url, seq: v.seq, active: v.active,
        parent_id: test ? v.parent_id : '', positions: !test && v.restrict ? v.positions : [] });
      toast('Materi disimpan'); onSaved(test && !r ? res.id : null); onClose();
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={r ? 'Ubah materi' : test ? 'Tambah ' + KIND_LABEL[v.kind].toLowerCase() : 'Tambah materi'} onClose={onClose} wide>
      <label className="f">Format</label>
      <select className="input" value={v.kind} onChange={set('kind')} disabled={!!preset.parent || (!!r && test)}>
        {Object.entries(KIND_LABEL).filter(([k]) => (r || preset.kind) ? isTest(k) === test : true).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <label className="f">Judul</label><input className="input" value={v.title} onChange={set('title')} maxLength={200} autoFocus />
      {!test ? <><label className="f">Link (Google Drive/Docs/Slides/YouTube/website)</label><input className="input" type="url" value={v.url} onChange={set('url')} placeholder="https://…" /></> : null}
      {test ? <><label className="f">Menempel ke modul/SOP</label>
        <select className="input" value={v.parent_id} onChange={set('parent_id')} disabled={!!preset.parent}><option value="">— Berdiri sendiri (dipilih langsung di aktivitas) —</option>
          {parents.map(x => <option key={x.id} value={x.id}>{(KIND_LABEL[x.kind] || x.kind) + ': ' + x.title}</option>)}</select>
        <div className="small muted" style={{ marginTop: 4 }}>Test ikut ke setiap aktivitas yang memakai modul/SOP induknya, dan aktivitas itu otomatis mewajibkan test ini. Soal dibuat setelah disimpan.</div></> : null}
      {!test ? <div className="sub-box">
        <b>Visibilitas di Documents</b>
        <div className="checks" style={{ marginTop: 6 }}>
          <label><input type="radio" name="vis" checked={!v.restrict} onChange={() => setV(s => ({ ...s, restrict: false }))} />Semua jabatan</label>
          <label><input type="radio" name="vis" checked={v.restrict} onChange={() => setV(s => ({ ...s, restrict: true }))} />Hanya jabatan tertentu</label>
        </div>
        {v.restrict ? (c.positions.length ? <div className="checks pos-grid">{c.positions.map(p => <label key={p.id}><input type="checkbox" checked={v.positions.includes(p.id)} onChange={() => togglePos(p.id)} />{p.name}</label>)}</div>
          : <Notice err>Belum ada jabatan. Tambahkan di Master Data → Kelola Jabatan.</Notice>) : null}
        <div className="small muted" style={{ marginTop: 6 }}>Hanya mengatur akses lewat menu Documents. Akses lewat Pembelajaran tetap mengikuti pendaftaran & urutan aktivitas.</div>
      </div> : null}
      <div className="row" style={{ marginTop: 4, justifyContent: 'flex-start', gap: 24 }}>
        <div><label className="f">Urutan</label><input className="input" type="number" style={{ maxWidth: 120 }} value={v.seq} onChange={set('seq')} /></div>
        <label className="inline" style={{ marginTop: 28 }}><input type="checkbox" checked={!!v.active} onChange={set('active')} />Aktif</label>
      </div>
      {err ? <div style={{ marginTop: 10 }}><Notice err>{err}</Notice></div> : null}
      <div className="row"><button className="btn" onClick={onClose}>Batal</button><Busy className="btn primary" onClick={save}>Simpan</Busy></div>
    </Modal>);
}

// Editor soal pilihan ganda untuk pre/post-test bawaan.
function QuestionEditor({ resourceId, onClose, onSaved }) {
  const { data, error } = useApi('quizQuestions', { resourceId });
  const [qs, setQs] = useState(null), [err, setErr] = useState('');
  const list = qs || (data ? (data.questions.length ? data.questions : [{ question: '', options: ['', '', '', ''], answer: 0 }]) : null);
  const upd = (i, patch) => setQs(list.map((q, j) => j === i ? { ...q, ...patch } : q));
  const save = async () => {
    try { const r = await api('quizQuestionsSave', { resourceId, questions: list }); toast(r.count + ' soal disimpan'); onSaved(); onClose(); }
    catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={data ? 'Soal · ' + data.resource.title : 'Soal test'} onClose={onClose} wide>
      {error ? <Notice err>{error}</Notice> : !list ? <div className="sk" style={{ height: 160 }} /> : <>
        <p className="small muted" style={{ margin: 0 }}>Pilihan ganda. Tandai jawaban benar dengan tombol bulat. Nilai = persentase jawaban benar.</p>
        {list.map((q, i) => (
          <div className="qedit" key={i}>
            <div className="row" style={{ justifyContent: 'space-between' }}><b>Soal {i + 1}</b>
              {list.length > 1 ? <button className="btn link small" onClick={() => setQs(list.filter((_, j) => j !== i))}>Hapus soal</button> : null}</div>
            <textarea className="input" rows={2} value={q.question} onChange={e => upd(i, { question: e.target.value })} placeholder="Tulis pertanyaan…" style={{ marginTop: 6 }} />
            {q.options.map((o, j) => (
              <div className="opt-row" key={j}>
                <input type="radio" name={'ans' + i} checked={Number(q.answer) === j} onChange={() => upd(i, { answer: j })} aria-label={'Jawaban benar: pilihan ' + (j + 1)} />
                <input className="input" value={o} onChange={e => upd(i, { options: q.options.map((x, k) => k === j ? e.target.value : x) })} placeholder={'Pilihan ' + (j + 1)} />
                {q.options.length > 2 ? <button className="iconbtn" aria-label="Hapus pilihan" onClick={() => upd(i, { options: q.options.filter((_, k) => k !== j), answer: Number(q.answer) === j ? 0 : Number(q.answer) > j ? q.answer - 1 : q.answer })}><Icon name="x" /></button> : <span />}
              </div>))}
            {q.options.length < 6 ? <button className="btn link small" style={{ marginTop: 6 }} onClick={() => upd(i, { options: [...q.options, ''] })}>+ Pilihan</button> : null}
          </div>))}
        <button className="btn" style={{ marginTop: 12 }} onClick={() => setQs([...list, { question: '', options: ['', '', '', ''], answer: 0 }])}><Icon name="plus" />Tambah soal</button>
        {err ? <div style={{ marginTop: 10 }}><Notice err>{err}</Notice></div> : null}
        <div className="row"><button className="btn" onClick={onClose}>Batal</button><Busy className="btn primary" onClick={save}>Simpan soal</Busy></div>
      </>}
    </Modal>);
}

export default function Content() {
  const { data: c, error, loading, reload } = useApi('contentCatalog');
  const [cat, setCat] = useState('*'), [curF, setCurF] = useState('*'), [q, setQ] = useState(''), [showOff, setShowOff] = useState(false);
  const [editor, setEditor] = useState(null), [quiz, setQuiz] = useState(null);
  const byId = useMemo(() => c ? new Map(c.resources.map(x => [x.id, x])) : null, [c]);
  const posName = useMemo(() => c ? new Map(c.positions.map(p => [p.id, p.name])) : null, [c]);
  const sub = 'Perpustakaan materi: modul training, SOP, dokumen, IT Support Management, dan pre/post-test. Pengaitan ke aktivitas dilakukan di halaman Kurikulum.';
  if (loading && !c) return <><Head title="Kelola Materi" sub={sub} /><Skeleton n={2} /></>;
  if (error) return <><Head title="Kelola Materi" /><Notice err>{error}</Notice></>;
  const toggle = async r => {
    const kids = c.resources.filter(x => x.parent_id === r.id && x.active);
    if (!(await confirmBox((r.active ? 'Nonaktifkan ' : 'Aktifkan ') + r.title + '?', r.active && kids.length ? 'Test yang menempel pada materi ini ikut nonaktif.' : 'Perubahan langsung terlihat oleh trainee.', r.active ? 'Nonaktifkan' : 'Aktifkan', r.active))) return;
    try { await api('contentSave', { id: r.id, onlyActive: true, active: !r.active }); toast('Tersimpan'); reload(); } catch (e) { toast(e.message, true); }
  };
  const item = (r, child) => {
    const kids = c.resources.filter(x => x.parent_id === r.id && (showOff || x.active)).sort((a, b) => (a.kind === 'PRE_TEST' ? -1 : 1) - (b.kind === 'PRE_TEST' ? -1 : 1) || a.seq - b.seq);
    const vis = r.positions.map(id => posName.get(id)).filter(Boolean);
    const rows = [(
      <div key={r.id} className={'cm-item' + (child ? ' child' : '') + (r.active ? '' : ' off')}>
        <Pill label={KIND_LABEL[r.kind] || r.kind} cls={isTest(r.kind) ? 'role' : r.kind === 'SOP' ? 'red' : 'go'} icon={RES_ICON[r.kind] || 'file'} />
        <div className="t">{isTest(r.kind) ? <b>{r.title}</b> : <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title || '(tanpa judul)'}</a>}
          {!isTest(r.kind) ? <div className="small muted">{vis.length ? 'Jabatan: ' + vis.join(', ') : 'Semua jabatan'}</div> : null}
          {!child ? <div className="small muted" title={r.usage.join('\n')}>{r.usage.length ? 'Dipakai di ' + r.usage.length + ' tempat: ' + r.usage.slice(0, 2).join('; ') + (r.usage.length > 2 ? ' …' : '') : 'Belum dipakai di kurikulum'}</div> : null}</div>
        <div className="cm-acts">
          {isTest(r.kind) ? (r.questions ? <Pill label={r.questions + ' soal'} cls="go" icon="check" /> : <Pill label="Belum ada soal" cls="red" icon="alert" />) : null}
          {isTest(r.kind) ? <button className={'btn' + (r.questions ? '' : ' primary')} onClick={() => setQuiz(r.id)}>{r.questions ? 'Ubah soal' : 'Buat soal'}</button> : null}
          {!child && !isTest(r.kind) ? <>
            {!kids.some(k => k.kind === 'PRE_TEST') ? <button className="btn" onClick={() => setEditor({ preset: { kind: 'PRE_TEST', parent: r.id } })}>+ Pre-test</button> : null}
            {!kids.some(k => k.kind === 'POST_TEST') ? <button className="btn" onClick={() => setEditor({ preset: { kind: 'POST_TEST', parent: r.id } })}>+ Post-test</button> : null}
          </> : null}
          <button className="btn" onClick={() => setEditor({ r, preset: {} })}>Ubah</button>
          <button className={'btn ' + (r.active ? 'ghost-red' : '')} onClick={() => toggle(r)}>{r.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
        </div>
      </div>)];
    return child ? rows : rows.concat(kids.flatMap(k => item(k, true)));
  };
  const needle = q.trim().toLowerCase();
  const tops = c.resources.filter(r => !(r.parent_id && byId.has(r.parent_id)) && (showOff || r.active));
  const count = k => tops.filter(r => k === '*' || (!isTest(r.kind) && r.category === k)).length;
  const rows = tops.filter(r => {
    if (cat !== '*' && (isTest(r.kind) || r.category !== cat)) return false;
    if (curF === '-' ? r.usage.length : curF !== '*' && !r.curricula.includes(curF)) return false;
    const kids = c.resources.filter(x => x.parent_id === r.id);
    return !needle || [r.title, r.url, ...r.usage, ...kids.map(k => k.title)].join(' ').toLowerCase().includes(needle);
  }).sort((a, b) => a.title.localeCompare(b.title));
  return (<>
    <Head title="Kelola Materi" sub={sub}>
      <button className="btn" onClick={() => setEditor({ preset: { kind: 'POST_TEST' } })}><Icon name="clip" />Test berdiri sendiri</button>
      <button className="btn primary" onClick={() => setEditor({ preset: {} })}><Icon name="plus" />Tambah materi</button>
    </Head>
    <div className="row filters" style={{ marginBottom: 14 }}>
      <div className="chips">{[['*', 'Semua'], ['DOCUMENT', CATEGORY_LABEL.DOCUMENT], ['IT_TOOL', CATEGORY_LABEL.IT_TOOL]].map(([k, label]) =>
        <button key={k} className={'chip' + (cat === k ? ' on' : '')} onClick={() => setCat(k)}>{label} ({count(k)})</button>)}</div>
      <select className="input" style={{ maxWidth: 240 }} aria-label="Filter pemakaian" value={curF} onChange={e => setCurF(e.target.value)}>
        <option value="*">Semua kurikulum</option><option value="-">Belum dipakai</option>{c.curricula.map(x => <option key={x.id} value={x.id}>Dipakai di {x.name}</option>)}</select>
      <div className="search"><Icon name="search" /><input className="input" type="search" placeholder="Cari judul, link, atau pemakaian…" value={q} onChange={e => setQ(e.target.value)} /></div>
      <label className="inline" style={{ margin: 0, whiteSpace: 'nowrap' }}><input type="checkbox" checked={showOff} onChange={e => setShowOff(e.target.checked)} />Tampilkan nonaktif</label>
    </div>
    {rows.length ? <div className="card">{rows.flatMap(r => item(r, false))}</div>
      : <Empty icon="file">{c.resources.length ? 'Tidak ada materi yang cocok.' : 'Belum ada materi. Klik "Tambah materi".'}</Empty>}
    {editor ? <ContentEditor c={c} r={editor.r} preset={editor.preset} onClose={() => setEditor(null)} onSaved={newTestId => { reload(); if (newTestId) setQuiz(newTestId); }} /> : null}
    {quiz ? <QuestionEditor resourceId={quiz} onClose={() => setQuiz(null)} onSaved={reload} /> : null}
  </>);
}
