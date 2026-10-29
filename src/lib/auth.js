// 관리자 로그인: 비밀번호 해시(PBKDF2) + 세션 쿠키
import { HttpError, randomHex, sha256Hex } from './util.js';

const COOKIE = 'ace_admin';
const SESSION_DAYS = 7;
const ITERATIONS = 20000; // 무료 플랜 CPU 한도를 고려한 값

export async function hashPassword(password, saltHex) {
  const salt = saltHex || randomHex(16);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(salt), iterations: ITERATIONS },
    key,
    256
  );
  const hash = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { hash, salt };
}

export async function verifyPassword(password, hash, salt) {
  const r = await hashPassword(password, salt);
  return timingSafeEqual(r.hash, hash);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export async function createSession(db, userId) {
  const token = randomHex(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256Hex(token), userId, expires).run();
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(new Date().toISOString()).run();
  return { token, maxAge: SESSION_DAYS * 86400 };
}

export function sessionCookie(token, maxAge, secure) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function clearCookie(secure) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

function readCookie(request) {
  const raw = request.headers.get('cookie') || '';
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return m ? m[1] : null;
}

export async function currentAdmin(request, db) {
  const token = readCookie(request);
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT u.id, u.username, u.name, s.expires_at FROM sessions s JOIN admin_users u ON u.id = s.user_id WHERE s.token_hash = ?`
    )
    .bind(await sha256Hex(token))
    .first();
  if (!row || row.expires_at < new Date().toISOString()) return null;
  return { id: row.id, username: row.username, name: row.name };
}

export async function requireAdmin(request, db) {
  const admin = await currentAdmin(request, db);
  if (!admin) throw new HttpError(401, '로그인이 필요합니다.');
  return admin;
}

export async function endSession(request, db) {
  const token = readCookie(request);
  if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
}
