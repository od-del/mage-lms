# Mage LMS — Go-live runbook

Moving Mage LMS to its production home:

- **New version (v2):** the 18 development items (Documents, material library, master data, mentor choice, etc.).
- **Database:** copy everything from the current Turso database (`mage-lms-od-del`) into a new one.
- **Domain:** serve the app at **https://training.magepos.co.id** instead of `mage-lms.vercel.app`.

The three parts are independent. Do them in any order, or on different days.

---

## Status (10 Nov 2026)

| Item | Status |
|---|---|
| App code ready for the custom domain (security headers, robots.txt) | ✅ Done (goes live with the next deploy) |
| Copy tool `scripts/turso-copy.py` written and tested | ✅ Done |
| First dump of the current database (12 tables, 551 rows) | ✅ Done: `backups/mage-lms-od-del-20261110-164125.json` |
| Domain added in Vercel, DNS record value received | ✅ Done |
| magepos.co.id DNS is on Cloudflare (`ganz` / `kayleigh.ns.cloudflare.com`) | ✅ Confirmed |
| `training` record in Cloudflare | ⏳ Not added yet (Vercel shows "Invalid configuration" until it is) |
| New database credentials | ⏳ Waiting |
| Copy data → new database | ⏳ Waiting on credentials |
| Switch Vercel to the new database + redeploy | ⏳ Waiting on credentials |
| v2 built and tested locally on a copy of the production data | ✅ Done (not deployed yet) |
| Deploy v2 to Vercel | ⏳ Needs a Vercel login on this Mac |

---

## Part 0 — Deploy the new version (v2)

### What happens to the existing data
Nothing to run by hand. On its **first request**, the new version upgrades whichever database it's connected to, once:

- **New tables:** job titles (`positions`), outlets, mentors & trainers, material links (`resource_links`).
- **Library:** every material that sat inside an activity, stage or curriculum gets a link to that place instead. Trainees see exactly the same materials as before (checked on all 34 trainee/mentor views of the copied data).
- **Master data:** job titles and outlets are filled in from existing users. Everyone who currently mentors an enrollment becomes a mentor/trainer, authorized for those curricula.

The upgrade is safe to run twice and works on both the old and the new database. It doesn't matter whether you move the data (Part 1) before or after this deploy.

### Deploy
From the `mage-lms` folder, with Node.js installed:

```bash
npx vercel login
```

```bash
npx vercel deploy --prod
```

### Right after deploy (Super Admin)
1. **Master Data → Mentor & Trainer:** **Food Hygiene & Sanitation** has one authorized mentor (Mira) and **Probation** has none. Enrollment and practicum mentor choice now only offer mentors authorized for that curriculum, so add who may guide each one.
2. **Master Data → Kelola Outlet:** fill in *Lokasi Outlet* for each outlet.
3. **Kelola Materi:** set *Jenis* (Document / IT Support Management Tools) and, where needed, *Visibilitas* per job title. All existing materials start as *Document*, visible to all job titles.
4. **Kurikulum:** there's a test curriculum named `<script>alert(1)</script>` (inactive, 0 enrollments). It's harmless, but you can now delete it.

---

## Part 1 — Move the data to the new database

### What gets copied
Everything: all 12 tables (users and their passwords, curricula, stages, activities, materials, quiz questions, enrollments, mentor assignments, progress, quiz attempts, certificates, audit log), with the same IDs and data types. Nobody has to re-register, and existing certificates keep their numbers.

### What you need
- The new Turso database **URL** (looks like `libsql://something-yourorg.turso.io`).
- An **auth token** for that database with read/write access.
- A quiet time window of about 15 minutes. Anything people do in the LMS between the dump (step 2) and the switch (step 5) stays in the old database and won't appear in the new one.

All commands run in the `mage-lms` folder in Terminal. They only need the Python 3 that comes with macOS.

### Step 1 — Save the new database credentials
Create a file named `.env.target` in the `mage-lms` folder:

```
TURSO_DATABASE_URL=libsql://<new-database>.turso.io
TURSO_AUTH_TOKEN=<new token>
```

Git and Vercel both skip this file (every `.env*` file is excluded).

### Step 2 — Take a fresh dump of the current database
The dump from 10 Nov is older than today's data, so take a new one at cutover time:

```bash
python3 -I scripts/turso-copy.py dump --env .env.local
```

Expected output: one line per table with its row count, ending with
`✓ Dump mage-lms-od-del → backups/mage-lms-od-del-<date>-<time>.json`.
Use that new file name in the next steps.

This only reads the current database and doesn't change it.

### Step 3 — Dry run (writes nothing)

```bash
python3 -I scripts/turso-copy.py restore backups/<dump-file>.json --env .env.target --dry-run
```

This connects to the new database, checks that it's empty, and prepares everything without writing anything.
Expected: `Dry run: <n> statement siap, tidak ada yang ditulis.` ("n statements ready, nothing written").

### Step 4 — Copy the data

```bash
python3 -I scripts/turso-copy.py restore backups/<dump-file>.json --env .env.target
```

- Creates any missing tables and indexes, then inserts every row, **all in one transaction**. If anything fails, the new database is left exactly as it was.
- Afterwards it counts the rows in every table and compares them with the dump. Every line should end in ✓, followed by `✓ Restore selesai ke <new-database>` ("restore finished").

### Step 5 — Point the live app at the new database
1. Vercel → project **mage-lms** → **Settings → Environment Variables**.
2. For the **Production** environment, change:
   - `TURSO_DATABASE_URL` → the new URL
   - `TURSO_AUTH_TOKEN` → the new token
3. **Don't touch `SESSION_SECRET`.** Keeping it means everyone stays logged in.
4. **Deployments** → latest production deployment → **⋯ → Redeploy**. Environment variables only take effect on a new deploy.

### Step 6 — Check it
- Log in as a Super Admin. Users, curricula and materials should all be there.
- Open a trainee's progress and one certificate.
- The **Sistem** page in the menu (Super Admin only) should show the new database name at the top: `Database Turso "<new-database>"`.

### Rolling back
The old database isn't changed at any point. If something is wrong, put the old `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` back in Vercel and redeploy.
Keep the old database for at least a week before deleting it.

### If the copy tool stops with an error
The tool's messages are in Indonesian. What they mean:

| Message | Meaning | What to do |
|---|---|---|
| `File env tidak ditemukan: .env.target` | The credentials file doesn't exist | Do Step 1; check the file name starts with a dot |
| `TURSO_DATABASE_URL kosong` | URL line missing or empty | Fix `.env.target` |
| `Turso HTTP 401` | Token wrong, expired, or read-only | Create a new read/write token for the **new** database |
| `Tidak bisa menghubungi Turso` | Can't reach the server | Check the internet/VPN connection and the URL spelling |
| `Database tujuan sudah berisi data: …` | The new database already has rows | If that's from an earlier attempt and can be overwritten, add `--wipe` to the Step 4 command |
| `Database tujuan sama dengan sumber dump` | `.env.target` points at the **old** database | Fix `.env.target` |
| `Restore dibatalkan, database tujuan TIDAK berubah …` | Something failed; nothing was written | Read the rest of the message, fix, run Step 4 again |
| `Jumlah baris tidak cocok` | Row counts differ after the copy | Don't switch Vercel; run Step 4 again with `--wipe` |

### About the backup files
`backups/*.json` contain personal data and password hashes. Only your Mac user can read them, and they're never uploaded to git or Vercel. Delete old dumps once the move is confirmed, or store them somewhere secure.

---

## Part 2 — Domain: training.magepos.co.id on Cloudflare

Vercel says **"Invalid configuration"** because the `training` record doesn't exist in Cloudflare yet. As of 10 Nov, `training.magepos.co.id` has no CNAME, A or AAAA record.

### Step 1 — Add the record in Cloudflare
Cloudflare dashboard → **magepos.co.id** → **DNS → Records → Add record**:

| Field | Value |
|---|---|
| Type | `CNAME` |
| Name | `training` |
| Target | the value Vercel showed for this domain (for example `cname.vercel-dns.com` or `xxxx.vercel-dns-0xx.com`) |
| Proxy status | **DNS only** (grey cloud) ← important |
| TTL | Auto |

**Why "DNS only":** with the orange cloud (Proxied), Cloudflare hides Vercel's address. Vercel then keeps showing "Invalid configuration" and can't issue the SSL certificate. Vercel already provides HTTPS and a CDN, so you lose nothing by leaving the proxy off.

If Cloudflare says a record for `training` already exists (A, AAAA or CNAME), delete or edit that one first. A name can have only one CNAME and nothing else.

### Step 2 — Wait for Vercel
Vercel → mage-lms → **Settings → Domains**. Within a few minutes, `training.magepos.co.id` should change to **Valid Configuration**, and the SSL certificate is issued shortly after. Use the **Refresh** button if it's slow.

To check from Terminal (should print the Vercel target you entered):
```bash
dig +short CNAME training.magepos.co.id
```

### Step 3 — Redirect the old address
In **Settings → Domains**, edit `mage-lms.vercel.app` → **Redirect to** `training.magepos.co.id` (308 Permanent).
Old links and bookmarks keep working. People who were logged in on the old address log in once more on the new one.

### Step 4 — Redeploy
Redeploy once, so the new security headers and robots.txt are live. If you just did Part 1 Step 5, that deploy already covers it.

### Step 5 — Check it
```bash
curl -sI https://training.magepos.co.id | head -5
```
Expect a `200` or `307` status and a `strict-transport-security` line. Then log in on a phone and a laptop.

### If Vercel still says "Invalid configuration"
- **Orange cloud is on:** switch the record to DNS only.
- **Typo in the target:** copy it again from Vercel's domain panel.
- **Another record on `training`:** remove it.
- **Just added:** wait 5–10 minutes, then press Refresh in Vercel.
- **Certificate stuck on "pending":** Cloudflare SSL/TLS settings don't matter in DNS-only mode. Check there's no CAA record that leaves out `letsencrypt.org` (none exists today).

---

## Afterwards
- [ ] Tell staff the new address: https://training.magepos.co.id
- [ ] After a week with no problems, delete the old Turso database and the dump files in `backups/`
- [ ] Optional: in **Pengguna** and **Kelola materi**, turn off any demo accounts or sample materials from the original test data
