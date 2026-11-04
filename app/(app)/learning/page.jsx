'use client';
import ListView from '@/components/ListView';

export default function Learning() {
  return <ListView action="myLearning" title="Pembelajaran Saya" sub="Kurikulum dan progress belajar kamu." emptyText="Kamu belum terdaftar di kurikulum mana pun." />;
}
