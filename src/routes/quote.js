// 견적 사용자 API
//  - /api/quote/*               : 견적 사용자 본인 (로그인 · 로그아웃 · 내 정보 · 비밀번호 변경)
//  - /api/admin/quote-users/*   : 관리자가 견적 사용자 계정 발급 · 수정 · 사용 중지 · 삭제
import { HttpError, bad, json, readJson, cleanText, int, nextNo } from '../lib/util.js';
import { loadQuoteConfig, computeQuote, toPublic, cleanInput, vehicleData, residualGroups, DEFAULT_QUOTE_CONFIG, PUBLIC_CONFIG_KEYS, TERMS } from '../lib/rentcalc.js';
import { hashPassword, verifyPassword } from '../lib/auth.js';
import {
  createQuoteSession, quoteCookie, clearQuoteCookie, currentQuoteUser, requireQuoteUser, endQuoteSession, endOtherQuoteSessions,
} from '../lib/quoteAuth.js';

const ID_RE = /^[a-zA-Z0-9_.-]{3,30}$/;
const ID_MSG = '아이디는 영문 · 숫자 3~30자로 정해 주세요. (기호는 _ . - 만 가능)';
const PW_MSG = '비밀번호는 8자 이상으로 정해 주세요.';

const wonTxt = (n) => Number(n || 0).toLocaleString('ko-KR');
const kstDate = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 관리자 '견적 설정' 저장값 검사
function cleanConfig(b) {
  const d = DEFAULT_QUOTE_CONFIG;
  const n = (v, def, min = 0, max = 1e12) => { const x = Number(String(v ?? '').replace(/[,\s원%]/g, '')); return Number.isFinite(x) && x >= min && x <= max ? x : def; };
  const out = {
    rate: n(b.rate, d.rate, 0, 100), insurance: n(b.insurance, d.insurance), maint: n(b.maint, d.maint),
    ag: cleanText(b.ag, 20) || d.ag, acq: n(b.acq, d.acq, 0, 100),
    plate1: n(b.plate1, d.plate1), plate2: n(b.plate2, d.plate2), stamp: n(b.stamp, d.stamp), reg: n(b.reg, d.reg), bond: n(b.bond, d.bond),
    tint: n(b.tint, d.tint), bb: n(b.bb, d.bb), del1: n(b.del1, d.del1),
    rvKm: n(b.rvKm, d.rvKm, 1000, 100000), rvAdj: n(b.rvAdj, d.rvAdj, 0, 20),
    carTax: b.carTax === '비영업용' ? '비영업용' : '영업용',
  };
  const rvCell = (v) => { if (v === null || v === undefined || v === '') return null; const x = Number(v); return Number.isFinite(x) && x > 0 && x < 1 ? Math.round(x * 10000) / 10000 : null; };
  const rvRow = (arr) => TERMS.map((_, i) => rvCell(Array.isArray(arr) ? arr[i] : null));
  out.rv = {};
  for (const g of residualGroups()) out.rv[g] = rvRow(b.rv?.[g] ?? d.rv[g]);
  out.rvDefault = rvRow(b.rvDefault);
  out.cc = d.cc.map((row, i) => [row[0], n(b.cc?.[i]?.[1], row[1]), n(b.cc?.[i]?.[2], row[2])]);
  out.fixed = d.fixed.map((row, i) => [row[0], n(b.fixed?.[i]?.[1], row[1]), n(b.fixed?.[i]?.[2], row[2]), b.fixed?.[i]?.[3] === '비영업용' ? '비영업용' : b.fixed?.[i]?.[3] === '영업용' ? '영업용' : row[3]]);
  for (const k of ['company', 'call', 'insAge', 'insEmp', 'insBi', 'insPd', 'insSelf', 'insDed', 'insUn']) out[k] = cleanText(b[k], 60) || (k === 'call' ? '' : d[k]);
  out.guide = cleanText(b.guide, 600) || d.guide;
  return out;
}

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

  // ── 견적 사용자: 차량 목록 · 렌트료 계산 · 견적서 발행 ──────
  // 금리 · 보험료 · AG수수료 · 원가는 내려주지 않는다 (계산은 서버에서만)
  r.get('/api/quote/data', async ({ env, request }) => {
    await requireQuoteUser(request, env.DB);
    const cfg = await loadQuoteConfig(env.DB);
    const pub = Object.fromEntries(PUBLIC_CONFIG_KEYS.map((k) => [k, cfg[k]]));
    return json({ ...vehicleData(), config: pub, terms: TERMS }, 200, { 'cache-control': 'private, no-store' });
  });

  r.post('/api/quote/calc', async ({ env, request }) => {
    await requireQuoteUser(request, env.DB);
    const input = cleanInput(await readJson(request));
    return json(toPublic(computeQuote(input, await loadQuoteConfig(env.DB))));
  });

  r.post('/api/quote/issue', async ({ env, request }) => {
    const me = await requireQuoteUser(request, env.DB);
    const input = cleanInput(await readJson(request));
    const res = computeQuote(input, await loadQuoteConfig(env.DB));
    if (!res.ok) throw bad(res.error);
    const shown = res.products.filter((o) => o.on);
    if (!shown.length) throw bad('견적서에 표시할 상품을 하나 이상 선택해 주세요.');
    const broken = shown.find((o) => o.error);
    if (broken) throw bad(broken.error);
    const v = res.vehicle;
    const vehicle = [v.mk, v.model, v.line, v.trim].filter(Boolean).join(' ');
    const summary = shown.map((o) => `${o.n}개월 ${wonTxt(o.month)}${o.agUser ? ` (사용자AG ${wonTxt(o.agUser)})` : ''}`).join(' / ');
    let no = '';
    for (let i = 0; i < 3; i++) {
      no = await nextNo(env.DB, 'quote_logs', 'Q');
      try {
        await env.DB.prepare(
          `INSERT INTO quote_logs (no, user_id, user_name, user_company, username, customer_type, customer_name, vehicle, price, summary, input_json, result_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(no, me.id, me.name, me.company, me.username, input.ctype, input.cname, vehicle, v.price, summary, JSON.stringify(input), JSON.stringify(res)).run();
        break;
      } catch (e) {
        if (!/UNIQUE/i.test(String(e.message)) || i === 2) throw e;
      }
    }
    return json({ ...toPublic(res), no, date: kstDate() });
  });

  // ── 관리자: 견적 설정 (사용자 견적에 쓰이는 금리 · 보험료 · 자동차세 · 최대 잔가율) ──
  r.get('/api/admin/quote-config', async ({ env }) => {
    return json({ config: await loadQuoteConfig(env.DB), groups: residualGroups(), terms: TERMS, defaults: DEFAULT_QUOTE_CONFIG });
  });
  r.put('/api/admin/quote-config', async ({ env, request }) => {
    const cfg = cleanConfig(await readJson(request));
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('quote_config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(cfg)).run();
    return json({ ok: true, config: cfg });
  });

  // ── 관리자: 견적 발행 기록 ──
  r.get('/api/admin/quote-logs', async ({ env, url }) => {
    const user = int(url.searchParams.get('user'));
    const q = cleanText(url.searchParams.get('q'), 40);
    const page = Math.max(1, int(url.searchParams.get('page'), 1));
    const size = 50;
    const where = [], args = [];
    if (user) { where.push('user_id = ?'); args.push(user); }
    if (q) { where.push('(no LIKE ? OR customer_name LIKE ? OR vehicle LIKE ? OR user_name LIKE ? OR user_company LIKE ?)'); args.push(...Array(5).fill(`%${q}%`)); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [rows, cnt, users] = await Promise.all([
      env.DB.prepare(`SELECT id, no, user_id, user_name, user_company, username, customer_type, customer_name, vehicle, price, summary, created_at FROM quote_logs ${w} ORDER BY id DESC LIMIT ? OFFSET ?`).bind(...args, size, (page - 1) * size).all(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM quote_logs ${w}`).bind(...args).first(),
      env.DB.prepare('SELECT user_id, MAX(user_name) AS user_name, MAX(user_company) AS user_company, COUNT(*) AS n FROM quote_logs GROUP BY user_id ORDER BY n DESC').all(),
    ]);
    return json({ logs: rows.results, total: cnt.n, page, size, users: users.results });
  });
  r.get('/api/admin/quote-logs/:id', async ({ env, params }) => {
    const row = await env.DB.prepare('SELECT * FROM quote_logs WHERE id = ?').bind(int(params.id)).first();
    if (!row) throw new HttpError(404, '견적 기록을 찾을 수 없습니다.');
    return json({ log: { ...row, input: JSON.parse(row.input_json || '{}'), result: JSON.parse(row.result_json || '{}') } });
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
