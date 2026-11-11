import { redirect } from 'next/navigation';

// Menu SOP sekarang bernama Documents; tautan lama tetap berfungsi.
export default function Sop() {
  redirect('/documents');
}
