'use client';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Icon, Notice, fmtDate, useApi } from '@/components/ui';

// Sertifikat sebagai halaman cetak: "Cetak / Simpan PDF" memakai dialog print browser.
export default function CertificatePage() {
  const { id } = useParams();
  const { data: c, error } = useApi('certificate', { enrollmentId: decodeURIComponent(id) });
  useEffect(() => { if (c) document.title = 'Sertifikat ' + c.id + ' · Mage LMS'; }, [c]);
  if (error) return <div className="certpage"><div style={{ maxWidth: 480 }}><Notice err>{error}</Notice></div></div>;
  if (!c) return <div className="certpage"><span className="spin" style={{ borderColor: 'var(--line)', borderTopColor: 'var(--blue-700)' }} /></div>;
  return (
    <div className="certpage">
      <div style={{ width: '100%', maxWidth: 960 }}>
        <div className="noprint"><button className="btn primary" onClick={() => window.print()}><Icon name="download" />Cetak / Simpan PDF</button>
          <button className="btn" onClick={() => window.close()}>Tutup</button></div>
        <div className="certsheet">
          <div className="logo"><span className="mark">M</span>Mage LMS</div>
          <div>
            <div className="muted" style={{ fontWeight: 700, letterSpacing: '.12em' }}>SERTIFIKAT PENYELESAIAN</div>
            <h1>{c.curriculum.name}</h1>
            <p className="muted" style={{ margin: '18px 0 6px' }}>Diberikan kepada</p>
            <div className="name">{c.trainee.name}</div>
            <p className="muted" style={{ marginTop: 10 }}>{[c.trainee.job, c.trainee.outlet].filter(Boolean).join(' · ')}</p>
            <p style={{ maxWidth: 560 }}>atas keberhasilan menyelesaikan seluruh stage, aktivitas, dan penilaian dalam kurikulum ini.</p>
          </div>
          <div className="meta">
            <div><b style={{ color: 'var(--ink)' }}>No. {c.id}</b><br />Diterbitkan {fmtDate(c.issuedAt)}</div>
            <div>Mulai {fmtDate(c.startDate)}</div>
            <div>Mentor: <b style={{ color: 'var(--ink)' }}>{c.mentors.join(', ') || '–'}</b></div>
          </div>
        </div>
      </div>
    </div>);
}
