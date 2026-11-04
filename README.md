# Mage LMS

Learning management system (prototipe) — port dari JPT LMS V2 (Google Apps Script + Google Sheets) ke **Next.js 16** dengan database **Turso (libSQL/SQLite)**.

## Fitur
- **Trainee**: beranda "lanjutkan belajar", kurikulum per stage, materi/SOP, pre/post-test bawaan, riwayat nilai, sertifikat (cetak/PDF).
- **Mentor**: antrean praktik yang perlu dinilai, Lulus / Perlu ulang.
- **Admin/HR**: dashboard (filter kurikulum/outlet, export CSV), semua peserta, daftarkan peserta (pratinjau → buat).
- **Super Admin**: kurikulum (stage & aktivitas), kelola materi + editor soal, pengguna & password sementara, pemeriksaan sistem.

Aturan status aktivitas (dulu formula *Current Status* di sheet) ada di [`lib/lms.js`](lib/lms.js):
`SELF_CONFIRMED`, `ACKNOWLEDGED`, `MENTOR_PASSED`, `PRE_SUBMITTED_AND_POST_PASSED`, `ALL_REQUIRED_CHILDREN`.
Aktivitas utama terbuka berurutan; stage berikutnya terbuka otomatis saat semua aktivitas wajib selesai; sertifikat terbit saat stage terakhir selesai.

## Struktur
```
app/(app)/…        halaman (client components) di dalam shell navigasi
app/api/rpc        satu endpoint aksi: { action, params } → { data } | { error }
app/api/auth       login (POST) / logout (DELETE), cookie HMAC httpOnly
lib/lms.js         mesin LMS (aturan, stage, kuis, dashboard)
lib/db.js          klien Turso; semua tabel dibaca dalam 1 round trip, tulis dalam 1 transaksi
lib/schema.js      skema tabel
scripts/           migrate & seed
```

## Menjalankan lokal
```bash
npm install
cp .env.example .env.local   # isi TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, SESSION_SECRET
npm run db:migrate
npm run db:seed              # data contoh; akun & password acak → .seed-credentials.txt (tidak di-commit)
npm run dev
```
Untuk database lokal tanpa Turso: `TURSO_DATABASE_URL=file:local.db`.

## Deploy ke Vercel
1. Import repo ini di Vercel (framework: Next.js).
2. Isi Environment Variables: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET`.
3. Deploy. Region fungsi diset ke `sin1` (Singapura) di `vercel.json`, dekat dengan database Turso `aws-ap-southeast-1`.

## Batasan prototipe
- Login email + password (tanpa OTP email). Lupa password → Super Admin membuat password sementara di menu **Pengguna**.
- Belum ada notifikasi email harian (butuh layanan email seperti Resend).
- Data dibaca utuh per permintaan — cocok untuk puluhan sampai beberapa ratus peserta.
- Belum ada impor data dari spreadsheet lama.
