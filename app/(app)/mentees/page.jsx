'use client';
import ListView from '@/components/ListView';

export default function Mentees() {
  return <ListView action="mentees" title="Trainee Bimbingan" sub="Trainee yang kamu dampingi sebagai mentor." emptyText="Belum ada trainee yang kamu bimbing." showTrainee filters />;
}
