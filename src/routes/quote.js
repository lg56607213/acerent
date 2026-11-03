// 견적 사용자 API
//  - /api/quote/*               : 견적 사용자 본인 (로그인 · 로그아웃 · 내 정보 · 비밀번호 변경)
//  - /api/admin/quote-users/*   : 관리자가 견적 사용자 계정 발급 · 수정 · 사용 중지 · 삭제
import { HttpError, bad, json, readJson, cleanText, int } from '../lib/util.js';
import { hashPassword, verifyPassword } from '../lib/auth.js';
import {
  createQuoteSession, quoteCookie, clearQuoteCookie, currentQuoteUser, requireQuoteUser, endQuoteSession, endOtherQuoteSessions,
} from '../lib/quoteAuth.js';

const ID_RE = /^[a-zA-Z0-9_.-]{3,30}$/;
const ID_MSG = '아이디는 영문 · 숫자 3~30자로 정해 주세요. (기호는 _ . - 만 가능)';
const PW_MSG = '비밀번호는 8자 이상으로 정해 주세요.';

const profile = (b) => ({
  name: cleanText(b.name, 30),
  company: cleanText(b.company, 60),
  phone: cleanText(b.phone, 30),
  memo: cleanText(b.memo, 500),
});

export function registerQuote(r) {
  // ── 견적 사용자 본인 ───────────────────────────────────
  r.get('/api/quote/me', async ({ env, request }) => json({ user: await currentQuoteUser(request, env.DB) }));

  r.post('/api/quote/login', async ({ env, request, url }) => {
    const b = await readJson(request);
    const u = await env.DB.prepare('SELECT * FROM quote_users WHERE username = ?').bind(cleanText(b.username, 30)).first();
    if (!u || !(await verifyPassword(String(b.password || ''), u.pw_hash, u.pw_salt))) {
      await new Promise((res) => setTimeout(res, 800));
      throw new HttpError(400, '아이디 또는 비밀번호가 맞지 않습니다.');
    }
    if (!u.active) throw new HttpError(403, '사용이 중지된 계정입니다. 에이스렌터카 담당자에게 문의해 주세요.');
    const s = await createQuoteSession(env.DB, u.id);
    return json({ ok: true }, 200, { 'set-cookie': quoteCookie(s.token, s.maxAge, url.protocol === 'https:') });
  });

  r.post('/api/quote/logout', async ({ env, request, url }) => {
    await endQuoteSession(request, env.DB);
    return json({ ok: true }, 200, { 'set-cookie': clearQuoteCookie(url.protocol === 'https:') });
  });

  r.post('/api/quote/password', async ({ env, request }) => {
    const me = await requireQuoteUser(request, env.DB);
    const b = await readJson(request);
    const u = await env.DB.prepare('SELECT * FROM quote_users WHERE id = ?').bind(me.id).first();
    if (!(await verifyPassword(String(b.current || ''), u.pw_hash, u.pw_salt))) throw bad('현재 비밀번호가 맞지 않습니다.');
    if (String(b.next || '').length < 8) throw bad(PW_MSG);
    const { hash, salt } = await hashPassword(String(b.next));
    await env.DB.prepare('UPDATE quote_users SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(hash, salt, me.id).run();
    await endOtherQuoteSessions(env.DB, me.id, request);
    return json({ ok: true });
  });

  // ── 관리자: 견적 사용자 계정 관리 (index.js 에서 관리자 로그인 확인) ──
  r.get('/api/admin/quote-users', async ({ env }) => {
    const { results } = await env.DB.prepare(
      'SELECT id, username, name, company, phone, memo, active, last_login_at, created_at FROM quote_users ORDER BY active DESC, id DESC'
    ).all();
    return json({ users: results });
  });

  r.post('/api/admin/quote-users', async ({ env, request }) => {
    const b = await readJson(request);
    const username = cleanText(b.username, 30);
    if (!ID_RE.test(username)) throw bad(ID_MSG);
    if (String(b.password || '').length < 8) throw bad(PW_MSG);
    const p = profile(b);
    if (!p.name) throw bad('이름을 입력해 주세요.');
    const dup = await env.DB.prepare('SELECT id FROM quote_users WHERE username = ?').bind(username).first();
    if (dup) throw bad('이미 있는 아이디입니다.');
    const { hash, salt } = await hashPassword(String(b.password));
    const r2 = await env.DB.prepare(
      'INSERT INTO quote_users (username, name, company, phone, memo, pw_hash, pw_salt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(username, p.name, p.company, p.phone, p.memo, hash, salt).run();
    return json({ ok: true, id: r2.meta.last_row_id });
  });

  r.put('/api/admin/quote-users/:id', async ({ env, params, request }) => {
    const id = int(params.id);
    const u = await env.DB.prepare('SELECT id FROM quote_users WHERE id = ?').bind(id).first();
    if (!u) throw new HttpError(404, '견적 사용자를 찾을 수 없습니다.');
    const b = await readJson(request);
    const p = profile(b);
    if (!p.name) throw bad('이름을 입력해 주세요.');
    const active = b.active ? 1 : 0;
    const stmts = [
      env.DB.prepare('UPDATE quote_users SET name = ?, company = ?, phone = ?, memo = ?, active = ? WHERE id = ?').bind(p.name, p.company, p.phone, p.memo, active, id),
    ];
    // 사용 중지하면 지금 접속해 있는 화면도 끊는다
    if (!active) stmts.push(env.DB.prepare('DELETE FROM quote_sessions WHERE user_id = ?').bind(id));
    await env.DB.batch(stmts);
    return json({ ok: true });
  });

  r.post('/api/admin/quote-users/:id/password', async ({ env, params, request }) => {
    const id = int(params.id);
    const b = await readJson(request);
    if (String(b.password || '').length < 8) throw bad(PW_MSG);
    const u = await env.DB.prepare('SELECT id FROM quote_users WHERE id = ?').bind(id).first();
    if (!u) throw new HttpError(404, '견적 사용자를 찾을 수 없습니다.');
    const { hash, salt } = await hashPassword(String(b.password));
    await env.DB.batch([
      env.DB.prepare('UPDATE quote_users SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(hash, salt, id),
      env.DB.prepare('DELETE FROM quote_sessions WHERE user_id = ?').bind(id),
    ]);
    return json({ ok: true });
  });

  r.delete('/api/admin/quote-users/:id', async ({ env, params }) => {
    const id = int(params.id);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM quote_sessions WHERE user_id = ?').bind(id),
      env.DB.prepare('DELETE FROM quote_users WHERE id = ?').bind(id),
    ]);
    return json({ ok: true });
  });
}
