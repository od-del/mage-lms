'use client';
import { useState } from 'react';
import { Head, Icon, Pill, Notice, Skeleton, Empty, Modal, Busy, api, toast, useApi } from '@/components/ui';

const RULE_LABEL = {
  SELF_CONFIRMED: 'Trainee menandai selesai',
  ACKNOWLEDGED: 'Trainee konfirmasi sudah paham',
  MENTOR_PASSED: 'Dinilai mentor (praktik)',
  PRE_SUBMITTED_AND_POST_PASSED: 'Pre-test dikerjakan & lulus post-test',
  ALL_REQUIRED_CHILDREN: 'Semua sub-aktivitas wajib selesai',
};

function Field({ label, children }) { return <><label className="f">{label}</label>{children}</>; }
function Check({ label, value, onChange }) { return <label><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked ? 1 : 0)} />{label}</label>; }

function useForm(init) {
  const [v, setV] = useState(init);
  return [v, k => e => setV(s => ({ ...s, [k]: e && e.target ? e.target.value : e }))];
}

function Footer({ onClose, onSave }) {
  return <div className="row"><button className="btn" onClick={onClose}>Batal</button><Busy className="btn primary" onClick={onSave}>Simpan</Busy></div>;
}

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

function ActivityForm({ a, stage, onClose, onSaved }) {
  const [v, set] = useForm(a ? { ...a } : { stage_id: stage.id, name: '', rule: 'SELF_CONFIRMED', parent_id: '', seq: '', required_for_stage: 1, required_for_parent: 1, pre_required: 0, post_required: 0, passing_score: 70, due_days: '', prerequisite_id: '', active: 1 });
  const [err, setErr] = useState('');
  const roots = stage.activities.filter(x => !x.parent_id && x.id !== v.id);
  const save = async () => { try { await api('activitySave', v); toast('Aktivitas disimpan'); onSaved(); onClose(); } catch (e) { setErr(e.message); } };
  return (
    <Modal title={a ? 'Ubah aktivitas' : 'Aktivitas baru · ' + stage.name} onClose={onClose} wide>
      <Field label="Nama aktivitas"><input className="input" value={v.name} onChange={set('name')} placeholder="Contoh: Kalibrasi grinder" autoFocus /></Field>
      <Field label="Cara aktivitas dinyatakan selesai">
        <select className="input" value={v.rule} onChange={set('rule')}>{Object.entries(RULE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
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
        <Check label="Wajib pre-test" value={v.pre_required} onChange={set('pre_required')} />
        <Check label="Wajib lulus post-test" value={v.post_required} onChange={set('post_required')} />
        <Check label="Aktif" value={v.active} onChange={set('active')} />
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>Soal pre/post-test diatur di Kelola Materi. Perubahan langsung berlaku untuk peserta yang stage-nya sudah terbuka.</p>
      {err ? <div style={{ marginTop: 10 }}><Notice err>{err}</Notice></div> : null}
      <Footer onClose={onClose} onSave={save} />
    </Modal>);
}

export default function Curricula() {
  const { data: d, error, loading, reload } = useApi('curriculumTree');
  const [form, setForm] = useState(null);
  const close = () => setForm(null);
  if (loading && !d) return <><Head title="Kurikulum" sub="Struktur kurikulum, stage, dan aktivitas." /><Skeleton n={2} /></>;
  if (error) return <><Head title="Kurikulum" /><Notice err>{error}</Notice></>;
  return (<>
    <Head title="Kurikulum" sub="Struktur kurikulum → stage → aktivitas. Stage terbuka berurutan; aktivitas utama terbuka berurutan di dalam stage.">
      <button className="btn primary" onClick={() => setForm({ type: 'c' })}><Icon name="plus" />Kurikulum baru</button>
    </Head>
    {d.curricula.length ? <div className="stack">{d.curricula.map(c => (
      <div key={c.id} className={'card' + (c.active ? '' : ' off')}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div><h2 style={{ margin: 0 }}>{c.name} {c.active ? null : <Pill label="Nonaktif" cls="lock" />}</h2>
            <div className="small muted">{c.id} · {c.stages.length} stage · {c.enrollments} pendaftaran{c.description ? ' · ' + c.description : ''}</div></div>
          <div className="row"><button className="btn" onClick={() => setForm({ type: 'c', c })}><Icon name="edit" />Ubah</button>
            <button className="btn" onClick={() => setForm({ type: 's', curriculumId: c.id })}><Icon name="plus" />Stage</button></div>
        </div>
        {c.stages.length ? c.stages.map(s => (
          <div key={s.id} className="tree-stage">
            <div className="row">
              <div><div className="small muted" style={{ fontWeight: 700 }}>STAGE {s.seq}</div><b>{s.name}</b> {s.active ? null : <Pill label="Nonaktif" cls="lock" />}</div>
              <div className="row"><button className="btn" onClick={() => setForm({ type: 's', s, curriculumId: c.id })}>Ubah</button>
                <button className="btn" onClick={() => setForm({ type: 'a', stage: s })}><Icon name="plus" />Aktivitas</button></div>
            </div>
            {s.activities.length ? s.activities.filter(a => !a.parent_id).flatMap(a => [a, ...s.activities.filter(k => k.parent_id === a.id)]).map(a => (
              <div key={a.id} className={'tree-act' + (a.parent_id ? ' child' : '') + (a.active ? '' : ' off')}>
                <div style={{ minWidth: 0 }}><b>{a.seq}. {a.name}</b>
                  <div className="small muted">{RULE_LABEL[a.rule] || a.rule}{a.pre_required ? ' · pre-test' : ''}{a.post_required ? ' · post-test ≥ ' + a.passing_score : ''}{a.required_for_stage ? '' : ' · opsional'}{a.due_days ? ' · tenggat ' + a.due_days + ' hari' : ''}</div></div>
                <button className="btn" onClick={() => setForm({ type: 'a', a, stage: s })}>Ubah</button>
              </div>)) : <p className="small muted" style={{ margin: '6px 0 0' }}>Belum ada aktivitas. Peserta tidak bisa lanjut melewati stage kosong.</p>}
          </div>)) : <p className="small muted">Belum ada stage.</p>}
      </div>))}</div> : <Empty icon="layers">Belum ada kurikulum. Klik “Kurikulum baru”.</Empty>}
    {form?.type === 'c' ? <CurriculumForm c={form.c} onClose={close} onSaved={reload} /> : null}
    {form?.type === 's' ? <StageForm s={form.s} curriculumId={form.curriculumId} onClose={close} onSaved={reload} /> : null}
    {form?.type === 'a' ? <ActivityForm a={form.a} stage={form.stage} onClose={close} onSaved={reload} /> : null}
  </>);
}
