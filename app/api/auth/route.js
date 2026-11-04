import { NextResponse } from 'next/server';
import { query, write, audit } from '@/lib/db';
import { COOKIE, cookieOptions, makeToken, verifyPassword } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FAILS = 8, WINDOW_MIN = 15;

// POST { email, password } → masuk; DELETE → keluar.
export async function POST(req) {
  try {
    const { email = '', password = '' } = await req.json();
    const mail = String(email).trim().toLowerCase();
    if (!mail || !password) return NextResponse.json({ error: 'Isi email dan password.' }, { status: 400 });
    const [{ n }] = await query(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'LOGIN_FAIL' AND actor = ? AND at > datetime('now', ?)`, [mail, '-' + WINDOW_MIN + ' minutes']);
    if (n >= MAX_FAILS) return NextResponse.json({ error: 'Terlalu banyak percobaan. Coba lagi dalam ' + WINDOW_MIN + ' menit.' }, { status: 429 });
    const [u] = await query('SELECT id, password_hash, active FROM users WHERE email = ? COLLATE NOCASE', [mail]);
    if (!u || !u.active || !verifyPassword(String(password), u.password_hash)) {
      await write([audit(mail, 'LOGIN_FAIL')]);
      const noPw = u && u.active && !u.password_hash;
      return NextResponse.json({ error: noPw ? 'Akun ini belum punya password. Minta Super Admin membuat password sementara.' : 'Email atau password salah.' }, { status: 401 });
    }
    await write([audit(mail, 'LOGIN', u.id)]);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE, makeToken(u.id), cookieOptions);
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server sedang bermasalah. Coba lagi sebentar lagi.' }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { ...cookieOptions, maxAge: 0 });
  return res;
}
