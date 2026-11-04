import crypto from 'node:crypto';
import { cookies } from 'next/headers';
export { hashPassword, verifyPassword, passwordProblem, tempPassword } from './password.js';

export const COOKIE = 'mlms_session';
const SESSION_HOURS = 12;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production' && !process.env.TURSO_AUTH_TOKEN) throw new Error('SESSION_SECRET belum diisi.');
  // Fallback prototipe: turunkan dari token database supaya tetap stabil antar-deploy.
  return crypto.createHash('sha256').update('mlms:' + (process.env.TURSO_AUTH_TOKEN || 'dev')).digest('hex');
}

const sign = body => crypto.createHmac('sha256', secret()).update(body).digest('base64url');

export function makeToken(userId) {
  const body = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_HOURS * 3600e3 })).toString('base64url');
  return body + '.' + sign(body);
}

export function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const want = sign(body);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p.uid : null;
  } catch { return null; }
}

export async function sessionUserId() {
  const jar = await cookies();
  return readToken(jar.get(COOKIE)?.value);
}

export const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_HOURS * 3600 };
