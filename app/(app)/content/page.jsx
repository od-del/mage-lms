'use client';
import { useMemo, useState } from 'react';
import { Head, Icon, Pill, Notice, Skeleton, Empty, Modal, Busy, api, toast, confirmBox, useApi } from '@/components/ui';
import { KIND_LABEL, RES_ICON, isTest } from '@/components/lms';

const pad = n => String(n || 0).padStart(4, '0');

function ContentEditor({ c, r, preset, onClose, onSaved }) {
  const a0 = c.activities.find(x => x.id === (r?.activity_id || preset.activity_id));
  const s0 = c.stages.find(x => x.id === (a0 ? a0.stage : r?.stage_id));
  const [v, setV] = useState({
    kind: r?.kind || preset.kind || 'MODULE', title: r?.title || '', url: r?.url || '', seq: r?.seq || '', active: r ? r.active : true,
    parent_id: r?.parent_id || preset.parent || '',
    level: r ? (r.activity_id ? 'ACTIVITY' : r.stage_id ? 'STAGE' : r.curriculum_id ? 'CURRICULUM' : 'GLOBAL') : 'ACTIVITY',
    curriculum_id: r?.curriculum_id || s0?.curriculum || a0?.curriculum || c.curricula[0]?.id || '',
    stage_id: s0?.id || '', activity_id: a0?.id || '',
  });
  const [err, setErr] = useState('');
  const set = k => e => setV(s => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const test = isTest(v.kind);
  const stages = c.stages.filter(s => s.curriculum === v.curriculum_id).sort((a, b) => a.seq - b.seq);
  const stageId = stages.some(s => s.id === v.stage_id) ? v.stage_id : stages[0]?.id || '';
  const acts = c.activities.filter(a => a.stage === stageId).sort((a, b) => a.seq - b.seq);
  const actId = acts.some(a => a.id === v.activity_id) ? v.activity_id : acts[0]?.id || '';
  const parents = c.resources.filter(x => !isTest(x.kind) && x.active && x.activity_id && (!r || x.id !== r.id));
  const save = async () => {
    const loc = v.level === 'ACTIVITY' ? { activity_id: actId } : v.level === 'STAGE' ? { stage_id: stageId } : v.level === 'CURRICULUM' ? { curriculum_id: v.curriculum_id } : {};
    try {
      const res = await api('contentSave', { id: r?.id, kind: v.kind, title: v.title, url: v.url, seq: v.seq, active: v.active, parent_id: test ? v.parent_id : '', ...(test && v.parent_id ? {} : loc) });
      toast('Materi disimpan'); onSaved(test && !r ? res.id : null); onClose();
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={r ? 'Ubah materi' : 'Tambah materi'} onClose={onClose}>
      <label className="f">Jenis</label>
      <select className="input" value={v.kind} onChange={set('kind')} disabled={!!r}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <label className="f">Judul</label><input className="input" value={v.title} onChange={set('title')} maxLength={200} autoFocus />
      {!test ? <><label className="f">Link (Google Drive/Docs/Slides/YouTube/website)</label><input className="input" type="url" value={v.url} onChange={set('url')} placeholder="https://…" /></> : null}
      {test ? <><label className="f">Menempel ke modul/SOP</label>
        <select className="input" value={v.parent_id} onChange={set('parent_id')}><option value="">— Langsung di aktivitas —</option>
          {parents.map(x => <option key={x.id} value={x.id}>{(KIND_LABEL[x.kind] || x.kind) + ': ' + x.title}</option>)}</select>
        <div className="small muted" style={{ marginTop: 4 }}>Soal dibuat setelah disimpan. Aktivitasnya otomatis mewajibkan test ini.</div></> : null}
      {!(test && v.parent_id) ? <>
        <label className="f">Lokasi</label>
        <select className="input" value={test ? 'ACTIVITY' : v.level} onChange={set('level')} disabled={test}>
          {[['ACTIVITY', 'Aktivitas'], ['STAGE', 'Stage'], ['CURRICULUM', 'Kurikulum'], ['GLOBAL', 'Umum (semua user)']].map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        {(test ? 'ACTIVITY' : v.level) !== 'GLOBAL' ? <div style={{ marginTop: 8 }}><select className="input" aria-label="Kurikulum" value={v.curriculum_id} onChange={set('curriculum_id')}>
          {c.curricula.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div> : null}
        {['STAGE', 'ACTIVITY'].includes(test ? 'ACTIVITY' : v.level) ? <div style={{ marginTop: 8 }}><select className="input" aria-label="Stage" value={stageId} onChange={set('stage_id')}>
          {stages.map(s => <option key={s.id} value={s.id}>{s.seq}. {s.name}</option>)}</select></div> : null}
        {(test ? 'ACTIVITY' : v.level) === 'ACTIVITY' ? <div style={{ marginTop: 8 }}><select className="input" aria-label="Aktivitas" value={actId} onChange={set('activity_id')}>
          {acts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div> : null}
      </> : null}
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
  const [curF, setCurF] = useState('*'), [q, setQ] = useState(''), [showOff, setShowOff] = useState(false);
  const [editor, setEditor] = useState(null), [quiz, setQuiz] = useState(null);
  const maps = useMemo(() => c ? { cur: new Map(c.curricula.map(x => [x.id, x])), stg: new Map(c.stages.map(x => [x.id, x])), act: new Map(c.activities.map(x => [x.id, x])), res: new Map(c.resources.map(x => [x.id, x])) } : null, [c]);
  if (loading && !c) return <><Head title="Kelola Materi" sub="Modul training, SOP, video, dan pre/post-test." /><Skeleton n={2} /></>;
  if (error) return <><Head title="Kelola Materi" /><Notice err>{error}</Notice></>;
  const curName = id => maps.cur.get(id)?.name || id;
  const where = r => {
    if (r.activity_id && maps.act.has(r.activity_id)) { const a = maps.act.get(r.activity_id), s = maps.stg.get(a.stage) || {}; return { cur: a.curriculum, key: curName(a.curriculum) + pad(s.seq) + pad(a.seq), label: [curName(a.curriculum), s.name, a.name].filter(Boolean).join(' › ') }; }
    if (r.stage_id && maps.stg.has(r.stage_id)) { const s = maps.stg.get(r.stage_id); return { cur: s.curriculum, key: curName(s.curriculum) + pad(s.seq), label: [curName(s.curriculum), s.name].join(' › ') }; }
    if (r.curriculum_id) return { cur: r.curriculum_id, key: curName(r.curriculum_id), label: curName(r.curriculum_id) };
    return { cur: '', key: '￿', label: 'Umum (semua user)' };
  };
  const toggle = async r => {
    const kids = c.resources.filter(x => x.parent_id === r.id && x.active);
    if (!(await confirmBox((r.active ? 'Nonaktifkan ' : 'Aktifkan ') + r.title + '?', r.active && kids.length ? 'Test yang menempel pada materi ini ikut nonaktif.' : 'Perubahan langsung terlihat oleh trainee.', r.active ? 'Nonaktifkan' : 'Aktifkan', r.active))) return;
    try { await api('contentSave', { id: r.id, onlyActive: true, active: !r.active }); toast('Tersimpan'); reload(); } catch (e) { toast(e.message, true); }
  };
  const item = (r, child) => {
    const kids = c.resources.filter(x => x.parent_id === r.id && (showOff || x.active)).sort((a, b) => (a.kind === 'PRE_TEST' ? -1 : 1) - (b.kind === 'PRE_TEST' ? -1 : 1) || a.seq - b.seq);
    const rows = [(
      <div key={r.id} className={'cm-item' + (child ? ' child' : '') + (r.active ? '' : ' off')}>
        <Pill label={KIND_LABEL[r.kind] || r.kind} cls={isTest(r.kind) ? 'role' : r.kind === 'SOP' ? 'red' : 'go'} icon={RES_ICON[r.kind] || 'file'} />
        <div className="t">{isTest(r.kind) ? <b>{r.title}</b> : <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title || '(tanpa judul)'}</a>}
          <div className="small muted">{r.id}{r.seq ? ' · urutan ' + r.seq : ''}</div></div>
        <div className="cm-acts">
          {isTest(r.kind) ? (r.questions ? <Pill label={r.questions + ' soal'} cls="go" icon="check" /> : <Pill label="Belum ada soal" cls="red" icon="alert" />) : null}
          {isTest(r.kind) ? <button className={'btn' + (r.questions ? '' : ' primary')} onClick={() => setQuiz(r.id)}>{r.questions ? 'Ubah soal' : 'Buat soal'}</button> : null}
          {!child && !isTest(r.kind) && r.activity_id ? <>
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
  const groups = new Map();
  c.resources.filter(r => !(r.parent_id && maps.res.has(r.parent_id)) && (showOff || r.active)).forEach(r => {
    const w = where(r);
    if (curF !== '*' && w.cur !== curF) return;
    const kids = c.resources.filter(x => x.parent_id === r.id);
    if (needle && ![r.title, r.url, w.label].concat(kids.map(k => k.title)).join(' ').toLowerCase().includes(needle)) return;
    if (!groups.has(w.label)) groups.set(w.label, { key: w.key, rows: [] });
    groups.get(w.label).rows.push(r);
  });
  return (<>
    <Head title="Kelola Materi" sub="Modul training, SOP, video, dan pre/post-test per modul. Soal test dibuat langsung di sini.">
      <button className="btn primary" onClick={() => setEditor({ preset: {} })}><Icon name="plus" />Tambah materi</button>
    </Head>
    <div className="row filters" style={{ marginBottom: 14 }}>
      <select className="input" style={{ maxWidth: 260 }} aria-label="Filter kurikulum" value={curF} onChange={e => setCurF(e.target.value)}>
        <option value="*">Semua kurikulum</option><option value="">Umum</option>{c.curricula.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <div className="search"><Icon name="search" /><input className="input" type="search" placeholder="Cari judul atau link…" value={q} onChange={e => setQ(e.target.value)} /></div>
      <label className="inline" style={{ margin: 0, whiteSpace: 'nowrap' }}><input type="checkbox" checked={showOff} onChange={e => setShowOff(e.target.checked)} />Tampilkan nonaktif</label>
    </div>
    {groups.size ? <div className="stack">{[...groups.entries()].sort((a, b) => a[1].key.localeCompare(b[1].key)).map(([label, g]) => (
      <div key={label} className="card"><div className="small muted" style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
        {g.rows.sort((a, b) => a.seq - b.seq || a.title.localeCompare(b.title)).flatMap(r => item(r, false))}</div>))}</div>
      : <Empty icon="file">{c.resources.length ? 'Tidak ada materi yang cocok.' : 'Belum ada materi. Klik "Tambah materi".'}</Empty>}
    {editor ? <ContentEditor c={c} r={editor.r} preset={editor.preset} onClose={() => setEditor(null)} onSaved={newTestId => { reload(); if (newTestId) setQuiz(newTestId); }} /> : null}
    {quiz ? <QuestionEditor resourceId={quiz} onClose={() => setQuiz(null)} onSaved={reload} /> : null}
  </>);
}
