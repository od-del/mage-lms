'use client';
import ListView from '@/components/ListView';

export default function Participants() {
  return <ListView action="allEnrollments" title="Semua Peserta" sub="Semua pendaftaran kurikulum di LMS." emptyText="Belum ada pendaftaran. Buka Daftarkan Peserta untuk memulai." showTrainee />;
}
