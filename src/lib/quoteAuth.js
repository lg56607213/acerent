// 견적 사용자 로그인: 관리자 로그인과 같은 방식(PBKDF2 + 세션 쿠키)이지만 쿠키 · 테이블이 따로라
// 견적 사용자는 관리자 화면 · 관리자 API 에 접근할 수 없다.
import { HttpError, randomHex, sha256Hex } from './util.js';

const COOKIE = 'ace_quote';
const SESSION_DAYS = 7;

export async function createQuoteSession(db, userId) {
  const token = randomHex(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await db.batch([
    db.prepare('INSERT INTO quote_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256Hex(token), userId, expires),
    db.prepare('DELETE FROM quote_sessions WHERE expires_at < ?').bind(new Date().toISOString()),
    db.prepare("UPDATE quote_users SET last_login_at = datetime('now') WHERE id = ?").bind(userId),
  ]);
  return { token, maxAge: SESSION_DAYS * 86400 };
}

export function quoteCookie(token, maxAge, secure) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function clearQuoteCookie(secure) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

function readCookie(request) {
  const raw = request.headers.get('cookie') || '';
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return m ? m[1] : null;
}

// 사용 중지된 계정은 로그인이 남아 있어도 바로 막힌다
export async function currentQuoteUser(request, db) {
  const token = readCookie(request);
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT u.id, u.username, u.name, u.company, u.phone, u.active, s.expires_at
         FROM quote_sessions s JOIN quote_users u ON u.id = s.user_id WHERE s.token_hash = ?`
    )
    .bind(await sha256Hex(token))
    .first();
  if (!row || !row.active || row.expires_at < new Date().toISOString()) return null;
  return { id: row.id, username: row.username, name: row.name, company: row.company, phone: row.phone };
}

export async function requireQuoteUser(request, db) {
  const u = await currentQuoteUser(request, db);
  if (!u) throw new HttpError(401, '로그인이 필요합니다.');
  return u;
}

export async function endQuoteSession(request, db) {
  const token = readCookie(request);
  if (token) await db.prepare('DELETE FROM quote_sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
}

export async function endOtherQuoteSessions(db, userId, request) {
  const token = readCookie(request);
  const keep = token ? await sha256Hex(token) : '';
  await db.prepare('DELETE FROM quote_sessions WHERE user_id = ? AND token_hash <> ?').bind(userId, keep).run();
}
