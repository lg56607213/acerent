// 게시판 광고 · 매크로 차단: 사람 확인(Turnstile) · 휴대폰 문자 인증 · 자동 차단 규칙 · 작성 횟수 제한
//
// 설정 (wrangler.jsonc vars / 대시보드 비밀값) — 비어 있으면 그 기능은 꺼진 채로 동작
//   TURNSTILE_SITE_KEY (vars) + TURNSTILE_SECRET (비밀값)   : Cloudflare Turnstile 사람 확인
//   SMS_PROVIDER = 'solapi' (vars) + SMS_FROM (vars, 등록된 발신번호)
//   SMS_API_KEY · SMS_API_SECRET (비밀값)                    : 문자 인증번호 발송
import { HttpError, sha256Hex, randomHex } from './util.js';

export const smsEnabled = (env) => env.SMS_PROVIDER === 'solapi' && !!env.SMS_API_KEY && !!env.SMS_API_SECRET && !!env.SMS_FROM;
export const turnstileEnabled = (env) => !!env.TURNSTILE_SITE_KEY && !!env.TURNSTILE_SECRET;

export async function ipHash(request) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';
  return (await sha256Hex('ace-ip:' + ip)).slice(0, 32);
}

// ── Turnstile ──
export async function checkTurnstile(env, token, request) {
  if (!turnstileEnabled(env)) return;
  if (!token) throw new HttpError(400, '사람 확인을 완료해 주세요.');
  const fd = new FormData();
  fd.append('secret', env.TURNSTILE_SECRET);
  fd.append('response', String(token));
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) fd.append('remoteip', ip);
  let ok = false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: fd });
    ok = !!(await r.json()).success;
  } catch {
    ok = false;
  }
  if (!ok) throw new HttpError(400, '사람 확인에 실패했습니다. 새로고침 후 다시 시도해 주세요.');
}

// ── 문자 발송 (솔라피) ──
async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sendSms(env, to, text) {
  if (!smsEnabled(env)) throw new HttpError(503, '문자 발송이 설정되지 않았습니다.');
  const date = new Date().toISOString();
  const salt = randomHex(16);
  const signature = await hmacHex(env.SMS_API_SECRET, date + salt);
  const r = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `HMAC-SHA256 apiKey=${env.SMS_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`,
    },
    body: JSON.stringify({ message: { to: to.replace(/\D/g, ''), from: String(env.SMS_FROM).replace(/\D/g, ''), text } }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    console.error('SMS 발송 실패', r.status, t.slice(0, 300));
    throw new HttpError(502, '인증번호 문자를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

// ── 문자 인증 ──
const plusMin = (m) => new Date(Date.now() + m * 60000).toISOString().replace('T', ' ').slice(0, 19);

export async function sendCode(env, phone, request) {
  const ip = await ipHash(request);
  const q = (sql, ...a) => env.DB.prepare(sql).bind(...a).first();
  const [last, perPhone, perIp] = await Promise.all([
    q(`SELECT created_at FROM phone_codes WHERE phone = ? ORDER BY id DESC LIMIT 1`, phone),
    q(`SELECT COUNT(*) AS n FROM phone_codes WHERE phone = ? AND created_at > datetime('now', '-1 day')`, phone),
    q(`SELECT COUNT(*) AS n FROM phone_codes WHERE ip_hash = ? AND created_at > datetime('now', '-1 day')`, ip),
  ]);
  if (last && last.created_at > plusMin(-1)) throw new HttpError(429, '인증번호는 1분 뒤에 다시 받을 수 있습니다.');
  if (perPhone.n >= 5 || perIp.n >= 15) throw new HttpError(429, '오늘 인증번호 요청 횟수를 넘었습니다. 내일 다시 시도해 주세요.');
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
  await env.DB.prepare('INSERT INTO phone_codes (phone, code_hash, ip_hash, expires_at) VALUES (?, ?, ?, ?)').bind(phone, await sha256Hex(phone + ':' + code), ip, plusMin(5)).run();
  await sendSms(env, phone, `[에이스렌터카] 인증번호 ${code} (5분 안에 입력해 주세요)`);
}

// 인증번호 확인 → 30분 동안 쓸 수 있는 확인 토큰
export async function verifyCode(env, phone, code) {
  const row = await env.DB.prepare(`SELECT * FROM phone_codes WHERE phone = ? AND used = 0 ORDER BY id DESC LIMIT 1`).bind(phone).first();
  if (!row || row.expires_at < plusMin(0)) throw new HttpError(400, '인증번호가 만료되었습니다. 다시 받아 주세요.');
  if (row.tries >= 5) throw new HttpError(400, '입력 횟수를 넘었습니다. 인증번호를 다시 받아 주세요.');
  if ((await sha256Hex(phone + ':' + String(code || '').trim())) !== row.code_hash) {
    await env.DB.prepare('UPDATE phone_codes SET tries = tries + 1 WHERE id = ?').bind(row.id).run();
    throw new HttpError(400, '인증번호가 맞지 않습니다.');
  }
  const token = randomHex(24);
  await env.DB.prepare('UPDATE phone_codes SET used = 1, token_hash = ?, expires_at = ? WHERE id = ?').bind(await sha256Hex(token), plusMin(30), row.id).run();
  return token;
}

// 글 등록 시: 이 번호로 인증을 마쳤는지 (토큰은 한 번만 사용)
export async function consumeToken(env, phone, token) {
  if (!token) return false;
  const row = await env.DB
    .prepare(`SELECT id FROM phone_codes WHERE phone = ? AND token_hash = ? AND used = 1 AND expires_at > ?`)
    .bind(phone, await sha256Hex(String(token)), plusMin(0))
    .first();
  if (!row) return false;
  await env.DB.prepare(`UPDATE phone_codes SET token_hash = '' WHERE id = ?`).bind(row.id).run();
  return true;
}

// ── 자동 차단 규칙: 걸리면 바로 게시하지 않고 '확인 대기'로 ──
export function spamReason(text, bannedCsv = '') {
  const t = String(text || '');
  const flat = t.replace(/\s+/g, '').toLowerCase();
  if (/(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|kr|co|io|me|xyz|top|site|shop|club|ly|gg|link)\b)/i.test(t)) return '링크 포함';
  if (/(open\.kakao|오픈카톡|오픈톡|t\.me|텔레|telegram|카톡\s*아이디|카톡id|라인\s*아이디)/i.test(t)) return '메신저 연락처 포함';
  if (/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/.test(t) && !/1644[-.\s]?8891/.test(t)) return '전화번호 포함';
  const words = String(bannedCsv).split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
  const hit = words.find((w) => flat.includes(w.replace(/\s+/g, '')));
  if (hit) return `금칙어 (${hit})`;
  if (/(.)\1{9,}/.test(flat)) return '같은 글자 반복';
  return '';
}
