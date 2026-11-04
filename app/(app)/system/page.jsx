'use client';
import { Head, Icon, Pill, Notice, Skeleton, fmtDateTime, useApi } from '@/components/ui';

const LVL = { error: ['danger', 'alert', 'Perlu diperbaiki'], warn: ['red', 'info', 'Perhatian'], ok: ['go', 'check', 'OK'] };
const RANK = { error: 0, warn: 1, ok: 2 };

export default function System() {
  const { data: s, error, loading, reload } = useApi('health');
  if (loading && !s) return <><Head title="Sistem" sub="Pemeriksaan data dan konfigurasi." /><Skeleton n={2} /></>;
  if (error) return <><Head title="Sistem" /><Notice err>{error}</Notice></>;
  const errors = s.checks.filter(c => c.level === 'error').length, warns = s.checks.filter(c => c.level === 'warn').length;
  const areas = [...new Set(s.checks.map(c => c.area))];
  return (<>
    <Head title="Sistem" sub={'Database Turso "' + s.database + '" · dicek ' + fmtDateTime(s.generatedAt)}>
      <button className="btn" onClick={reload}><Icon name="refresh" />Cek ulang</button>
    </Head>
    <div className="stats">
      <div className={'stat' + (errors ? ' red' : '')}><b>{errors}</b><span>Perlu diperbaiki</span></div>
      <div className="stat"><b>{warns}</b><span>Perhatian</span></div>
      <div className="stat"><b>{s.counts.users}</b><span>Pengguna</span></div>
      <div className="stat"><b>{s.counts.enrollments}</b><span>Pendaftaran</span></div>
      <div className="stat"><b>{s.counts.assignments}</b><span>Tugas</span></div>
      <div className="stat"><b>{s.counts.passwords}</b><span>Punya password</span></div>
    </div>
    <div className="two">
      <div className="card"><h2>Pemeriksaan</h2>
        {areas.map(a => (
          <div key={a} style={{ marginTop: 12 }}>
            <div className="small muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{a}</div>
            {s.checks.filter(c => c.area === a).sort((x, y) => RANK[x.level] - RANK[y.level]).map((c, i) => (
              <div key={i} className={'check hc ' + (c.level === 'ok' ? 'ok' : 'bad')}>
                <Pill label={LVL[c.level][2]} cls={LVL[c.level][0]} icon={LVL[c.level][1]} />
                <div><b>{c.title}</b>{c.detail ? <div className="small muted">{c.detail}</div> : null}</div>
              </div>))}
          </div>))}
      </div>
      <div className="stack">
        <div className="card stack"><h2>Database</h2>
          <div className="small muted">Data tersimpan di Turso (libSQL). Backup & point-in-time restore diatur di dashboard Turso.</div>
          <Notice>Setiap aksi (tandai selesai, kuis, penilaian mentor, perubahan kurikulum) ditulis dalam satu transaksi dan tercatat di tabel <b>audit_log</b>.</Notice>
        </div>
        <div className="card stack"><h2>Otomatisasi</h2>
          <div className="small muted">Nilai test dan kenaikan stage diproses langsung saat trainee mengirim jawaban atau mentor menilai — tidak perlu trigger terjadwal.</div>
        </div>
      </div>
    </div>
  </>);
}
