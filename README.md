# Mage LMS

Learning management system (prototipe) — port dari JPT LMS V2 (Google Apps Script + Google Sheets) ke **Next.js 16** dengan database **Turso (libSQL/SQLite)**.

## Fitur
- **Trainee**: beranda "lanjutkan belajar", kurikulum per stage, materi, pre/post-test bawaan, riwayat nilai, sertifikat (cetak/PDF), **Modul Dipelajari**, pilih **mentor/trainer pendamping praktik**.
- **Semua pengguna**: **Documents** — pusat SOP, modul training, dokumen, dan IT Support Management Tools; disaring per jabatan.
- **Mentor**: antrean praktik yang perlu dinilai (termasuk praktik yang memilihnya sebagai pendamping), cari trainee per nama/kurikulum/stage.
- **Admin/HR**: dashboard (filter kurikulum/outlet, export CSV), semua peserta, **Kelola Peserta** (pratinjau → buat; mentor dari Master Mentor).
- **Super Admin**: kurikulum (tampilan list/grid, cari, buka/tutup, hapus), **Kelola Materi** sebagai perpustakaan (jenis, visibilitas per jabatan; satu materi dipakai di banyak aktivitas), **Master Data** (jabatan, outlet, mentor & trainer), pengguna & password sementara, pemeriksaan sistem.

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
lib/schema.js      skema tabel (kolom baru otomatis ditambahkan oleh upgradeSchema di lib/db.js)
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

## Pindah ke database produksi baru (salin semua data)
Pakai `scripts/turso-copy.py` (cukup Python 3 bawaan macOS). Dump berisi data pribadi & hash password,
disimpan di `backups/` (izin 600, tidak ikut git/Vercel).

1. Buat file `.env.target` berisi kredensial database **baru**:
   ```
   TURSO_DATABASE_URL=libsql://<db-baru>-<org>.turso.io
   TURSO_AUTH_TOKEN=<token db baru>
   ```
2. Saat cutover (jam sepi — perubahan di database lama setelah dump tidak ikut), dump ulang supaya data terbaru:
   ```bash
   python3 -I scripts/turso-copy.py dump --env .env.local
   ```
3. Uji dulu tanpa menulis, lalu tulis ke database baru (satu transaksi; gagal = tidak ada yang berubah):
   ```bash
   python3 -I scripts/turso-copy.py restore backups/<file>.json --env .env.target --dry-run
   python3 -I scripts/turso-copy.py restore backups/<file>.json --env .env.target
   ```
   Jumlah baris tiap tabel dicek otomatis. Database tujuan harus kosong (tabel kosong dari `db:migrate` boleh); `--wipe` untuk menimpa.
4. Vercel → Settings → Environment Variables (Production): ganti `TURSO_DATABASE_URL` & `TURSO_AUTH_TOKEN` ke database baru. `SESSION_SECRET` **jangan diubah** — pengguna tetap login.
5. Deploy ulang, lalu cek login & data di aplikasi. Database lama biarkan dulu beberapa hari sebagai cadangan.

Database baru tanpa data sama sekali? `npm run db:migrate` lalu
`npm run db:create-admin -- --id SA001 --name "Nama" --email nama@magepos.co.id` (password sementara tampil sekali). Jangan pakai `db:seed` di produksi.

## Domain produksi: training.magepos.co.id
Aplikasi tidak menyimpan nama domain di kode (URL relatif, cookie host-only), jadi tidak perlu ubah kode untuk pindah domain.

1. **Vercel** → project `mage-lms` → Settings → Domains → *Add* `training.magepos.co.id` (environment: Production). Vercel menampilkan record DNS yang dibutuhkan.
2. **DNS magepos.co.id** (panel registrar/Cloudflare): tambah `CNAME  training  →  <nilai dari Vercel>` (umumnya `cname.vercel-dns.com`). TTL default.
   - Kalau DNS di Cloudflare: set *DNS only* (awan abu-abu), jangan *Proxied*.
   - Kalau domain punya record **CAA**, tambahkan `0 issue "letsencrypt.org"` agar SSL bisa terbit.
3. Tunggu status *Valid Configuration* dan sertifikat SSL aktif di Vercel (biasanya beberapa menit).
4. Di Domains, edit `mage-lms.vercel.app` → *Redirect to* `training.magepos.co.id` (308). Pengguna yang login di domain lama perlu login ulang sekali.
5. Cek Environment Variables (Production): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET` terisi.
6. Deploy ulang (`vercel deploy --prod`) supaya header keamanan & robots.txt di `next.config.mjs` / `app/robots.js` aktif.
7. Verifikasi: `curl -I https://training.magepos.co.id` (harus 200/307 + header `strict-transport-security`), login tiap peran, buka & cetak sertifikat.

## Batasan prototipe
- Login email + password (tanpa OTP email). Lupa password → Super Admin membuat password sementara di menu **Pengguna**.
- Belum ada notifikasi email harian (butuh layanan email seperti Resend).
- Data dibaca utuh per permintaan — cocok untuk puluhan sampai beberapa ratus peserta.
- Belum ada impor data dari spreadsheet lama.
