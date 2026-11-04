'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon, Notice, api, toast, confirmBox, useApi } from '@/components/ui';
import { useShell, useCrumbs } from '@/components/Shell';

export default function QuizPage() {
  const p = useParams(), router = useRouter();
  const { refreshBadges } = useShell();
  const params = { assignmentId: decodeURIComponent(p.assignmentId), resourceId: decodeURIComponent(p.resourceId) };
  const { data: q, error } = useApi('quizGet', params);
  const [answers, setAnswers] = useState({}), [result, setResult] = useState(null), [sending, setSending] = useState(false);
  useCrumbs([['Pembelajaran Saya', '/learning'], [q ? q.title : 'Test']]);
  const back = q ? '/enrollment/' + encodeURIComponent(q.enrollmentId) : '/learning';

  if (error) return <><Link className="crumb" href="/learning"><Icon name="back" />Pembelajaran Saya</Link><Notice err>{error}</Notice></>;
  if (!q) return <div className="card sk" style={{ height: 320 }} />;

  if (result) {
    const pass = result.passed;
    return (
      <div className="quiz">
        <div className={'card result' + (pass ? '' : ' fail')}>
          <div className="avatar"><Icon name={pass ? 'award' : 'refresh'} /></div>
          <div className="big">{result.score}</div>
          <h2>{result.kind === 'PRE_TEST' ? 'Pre-test tersimpan' : pass ? 'Selamat, kamu lulus!' : 'Belum lulus'}</h2>
          <p className="muted">{result.correct} dari {result.total} jawaban benar
            {result.kind === 'POST_TEST' ? ' · nilai lulus ' + result.passing : ''}.
            {result.kind === 'PRE_TEST' ? ' Pelajari materinya, lalu kerjakan post-test.' : pass ? '' : ' Pelajari lagi materinya, lalu coba sekali lagi.'}</p>
          {result.finished ? <Notice>Kurikulum selesai — sertifikat sudah terbit 🎉</Notice> : result.advanced.length ? <Notice>Stage {result.advanced.join(', ')} sudah terbuka 🎉</Notice> : null}
          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            {!pass && result.kind === 'POST_TEST' ? <button className="btn" onClick={() => { setResult(null); setAnswers({}); window.scrollTo(0, 0); }}>Coba lagi</button> : null}
            <Link className="btn primary" href={back + '?focus=' + encodeURIComponent(result.activityId)}>Kembali ke aktivitas</Link>
          </div>
        </div>
      </div>);
  }

  const done = Object.keys(answers).length, total = q.questions.length;
  const submit = async () => {
    if (done < total) return toast('Masih ada ' + (total - done) + ' soal yang belum dijawab.', true);
    if (!(await confirmBox('Kirim jawaban?', 'Jawaban tidak bisa diubah setelah dikirim.', 'Kirim'))) return;
    setSending(true);
    try { const r = await api('quizSubmit', { ...params, answers }); setResult(r); refreshBadges(); window.scrollTo(0, 0); }
    catch (e) { toast(e.message, true); }
    setSending(false);
  };
  return (
    <div className="quiz">
      <Link className="crumb" href={back}><Icon name="back" />{q.curriculum}</Link>
      <div className="page-head"><div style={{ flex: 1 }}><h1>{q.title}</h1>
        <p>{q.activity} · {total} soal{q.kind === 'POST_TEST' ? ' · nilai lulus ' + q.passing : ''}</p></div></div>
      {!q.available ? <><Notice err={!q.done}>{q.reason}{q.done && q.score !== null ? ' Nilai kamu: ' + q.score + '.' : ''}</Notice>
        <div style={{ marginTop: 14 }}><Link className="btn" href={back}>Kembali</Link></div></> : (
        <div className="card">
          {q.questions.map((x, i) => (
            <div className="q" key={x.id} role="radiogroup" aria-label={'Soal ' + (i + 1)}>
              <h3><i>{i + 1}.</i><span>{x.question}</span></h3>
              {x.options.map((o, j) => (
                <label key={j} className={'opt' + (answers[x.id] === j ? ' on' : '')}>
                  <input type="radio" name={x.id} checked={answers[x.id] === j} onChange={() => setAnswers({ ...answers, [x.id]: j })} />{o}
                </label>))}
            </div>))}
          <div className="bar"><span className="small muted">{done} dari {total} soal terjawab</span>
            <button className="btn primary" disabled={sending} onClick={submit}>{sending ? <><span className="spin" />Mengirim…</> : 'Kirim jawaban'}</button></div>
        </div>)}
      {q.available ? null : <button className="btn link" style={{ marginTop: 10 }} onClick={() => router.back()}>← Kembali</button>}
    </div>);
}
