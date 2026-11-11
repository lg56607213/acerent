// 관리자 API (모두 로그인 필요 — 로그인·최초설정 제외)
import { HttpError, bad, json, readJson, cleanText, int, getSettings, esc } from '../lib/util.js';
import { hashPassword, verifyPassword, createSession, sessionCookie, clearCookie, requireAdmin, endSession, currentAdmin, endOtherSessions } from '../lib/auth.js';
import { notifyAdmins, sendLogged, buildMailHtml } from '../lib/mail.js';
import { searchErpVehicles } from '../lib/erp.js';
import { saveUpload } from './upload.js';
import { pricingOf } from '../../public/assets/longcalc.js';
import { usedRates, computeUsed, loadQuoteConfig, USED_KMS, usedBaseKm } from '../lib/rentcalc.js';
import { ALL_OPTIONS, STATUS as LONG_STATUS, MAKERS, MAINT, AGE } from '../../public/assets/longopts.js';

// R2 사진은 /img/키, 사이트에 같이 들어 있는 이미지는 '/assets/...' 경로 그대로
const img = (key) => (key ? (key.startsWith('/') ? key : `/img/${key}`) : '');

// 단순 목록형 테이블: 허용 칸만 받아서 추가·수정·삭제
const SIMPLE = {
  locations: { table: 'locations', order: 'sort, id', fields: { name: 's60', type: 's20', guide: 's500', hours: 's60', fee: 'i', can_pickup: 'b', can_return: 'b', active: 'b', sort: 'i' } },
  insurance: { table: 'insurance_options', order: 'sort, id', fields: { name: 's60', per_day: 'i', flat_fee: 'i', active: 'b', sort: 'i' } },
  'short-models': { table: 'short_models', order: 'sort, id', fields: { erp_code: 's40', maker: 's20', name: 's60', class: 's20', fuel: 's20', seats: 'i', features: 's200', day_rate: 'i', rate_3_4: 'i', rate_5_6: 'i', rate_7: 'i', image_key: 'k', active: 'b', sort: 'i' } },
  'short-vehicles': { table: 'short_vehicles', order: 'model_id, id', fields: { model_id: 'i', plate: 's20', year: 'i', active: 'b' } },
  banners: { table: 'banners', order: 'sort, id', fields: { image_key: 'k', text: 's120', sub_text: 's120', link: 's200', visible: 'b', sort: 'i' } },
  posts: { table: 'posts', order: "board, pinned DESC, sort, id DESC", fields: { board: 's10', title: 's150', body: 's20000', pinned: 'b', visible: 'b', sort: 'i', attachments: 'j', start_date: 's10', end_date: 's10', image_key: 's120', summary: 's200', cta_label: 's30', cta_link: 's200' }, touch: true },
};

function pick(body, fields) {
  const out = {};
  for (const [k, t] of Object.entries(fields)) {
    if (!(k in body)) continue;
    const v = body[k];
    if (typeof t === 'function') out[k] = t(v);
    else if (t === 'i') out[k] = int(v);
    else if (t === 'b') out[k] = v ? 1 : 0;
    else if (t === 'k') out[k] = cleanText(v, 200);
    else if (t === 'j') out[k] = JSON.stringify(Array.isArray(v) ? v.map((x) => cleanText(x, 200)) : []);
    else out[k] = cleanText(v, int(t.slice(1)));
  }
  return out;
}

async function insertRow(db, table, row) {
  const cols = Object.keys(row);
  if (!cols.length) throw bad('입력값이 없습니다.');
  const r = await db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...cols.map((c) => row[c])).run();
  return r.meta.last_row_id;
}

async function updateRow(db, table, id, row, touch) {
  const cols = Object.keys(row);
  if (!cols.length) return;
  const set = cols.map((c) => `${c} = ?`).join(', ') + (touch ? ", updated_at = datetime('now')" : '');
  await db.prepare(`UPDATE ${table} SET ${set} WHERE id = ?`).bind(...cols.map((c) => row[c]), id).run();
}

const RES_STATUS = ['pending', 'confirmed', 'done', 'cancelled'];
const APP_STATUS = ['review', 'approved', 'contracted', 'rejected', 'cancelled'];

export function registerAdmin(r) {
  // ── 로그인 ───────────────────────────────────────────
  r.get('/api/admin/me', async ({ env, request }) => {
    const admin = await currentAdmin(request, env.DB);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_users').first();
    return json({ admin, needsSetup: n.n === 0 });
  });

  // 관리자가 한 명도 없을 때만 첫 계정 생성 가능
  r.post('/api/admin/setup', async ({ env, request, url }) => {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_users').first();
    if (n.n > 0) throw new HttpError(403, '이미 관리자 계정이 있습니다.');
    const b = await readJson(request);
    const username = cleanText(b.username, 30);
    if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) throw bad('아이디는 영문·숫자 3자 이상으로 정해 주세요.');
    if (String(b.password || '').length < 8) throw bad('비밀번호는 8자 이상으로 정해 주세요.');
    const { hash, salt } = await hashPassword(String(b.password));
    const r2 = await env.DB.prepare('INSERT INTO admin_users (username, name, pw_hash, pw_salt) VALUES (?, ?, ?, ?)').bind(username, cleanText(b.name, 30), hash, salt).run();
    const s = await createSession(env.DB, r2.meta.last_row_id);
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(s.token, s.maxAge, url.protocol === 'https:') });
  });

  r.post('/api/admin/login', async ({ env, request, url }) => {
    const b = await readJson(request);
    const u = await env.DB.prepare('SELECT * FROM admin_users WHERE username = ?').bind(cleanText(b.username, 30)).first();
    if (!u || !(await verifyPassword(String(b.password || ''), u.pw_hash, u.pw_salt))) {
      await new Promise((res) => setTimeout(res, 800));
      throw new HttpError(400, '아이디 또는 비밀번호가 맞지 않습니다.');
    }
    const s = await createSession(env.DB, u.id);
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(s.token, s.maxAge, url.protocol === 'https:') });
  });

  r.post('/api/admin/logout', async ({ env, request, url }) => {
    await endSession(request, env.DB);
    return json({ ok: true }, 200, { 'set-cookie': clearCookie(url.protocol === 'https:') });
  });

  r.post('/api/admin/password', async ({ env, request, admin }) => {
    const b = await readJson(request);
    const u = await env.DB.prepare('SELECT * FROM admin_users WHERE id = ?').bind(admin.id).first();
    if (!(await verifyPassword(String(b.current || ''), u.pw_hash, u.pw_salt))) throw bad('현재 비밀번호가 맞지 않습니다.');
    if (String(b.next || '').length < 8) throw bad('새 비밀번호는 8자 이상으로 정해 주세요.');
    const { hash, salt } = await hashPassword(String(b.next));
    await env.DB.prepare('UPDATE admin_users SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(hash, salt, admin.id).run();
    // 다른 기기에 남아 있는 로그인은 끊기 (지금 쓰는 화면은 유지)
    await endOtherSessions(env.DB, admin.id, request);
    return json({ ok: true });
  });

  // 다른 관리자 비밀번호 재설정 (비밀번호를 잊었을 때)
  r.post('/api/admin/users/:id/password', async ({ env, params, request, admin }) => {
    const id = int(params.id);
    if (id === admin.id) throw bad('본인 비밀번호는 \'내 비밀번호 변경\'에서 바꿔 주세요.');
    const b = await readJson(request);
    if (String(b.password || '').length < 8) throw bad('새 비밀번호는 8자 이상으로 정해 주세요.');
    const u = await env.DB.prepare('SELECT id FROM admin_users WHERE id = ?').bind(id).first();
    if (!u) throw new HttpError(404, '관리자를 찾을 수 없습니다.');
    const { hash, salt } = await hashPassword(String(b.password));
    await env.DB.batch([
      env.DB.prepare('UPDATE admin_users SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(hash, salt, id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    ]);
    return json({ ok: true });
  });

  r.get('/api/admin/users', async ({ env }) => {
    const { results } = await env.DB.prepare('SELECT id, username, name, created_at FROM admin_users ORDER BY id').all();
    return json({ users: results });
  });
  r.post('/api/admin/users', async ({ env, request }) => {
    const b = await readJson(request);
    const username = cleanText(b.username, 30);
    if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) throw bad('아이디는 영문·숫자 3자 이상으로 정해 주세요.');
    if (String(b.password || '').length < 8) throw bad('비밀번호는 8자 이상으로 정해 주세요.');
    const dup = await env.DB.prepare('SELECT id FROM admin_users WHERE username = ?').bind(username).first();
    if (dup) throw bad('이미 있는 아이디입니다.');
    const { hash, salt } = await hashPassword(String(b.password));
    await env.DB.prepare('INSERT INTO admin_users (username, name, pw_hash, pw_salt) VALUES (?, ?, ?, ?)').bind(username, cleanText(b.name, 30), hash, salt).run();
    return json({ ok: true });
  });
  r.delete('/api/admin/users/:id', async ({ env, params, admin }) => {
    if (int(params.id) === admin.id) throw bad('본인 계정은 삭제할 수 없습니다.');
    await env.DB.prepare('DELETE FROM admin_users WHERE id = ?').bind(int(params.id)).run();
    return json({ ok: true });
  });

  // ── 현황 ─────────────────────────────────────────────
  r.get('/api/admin/dashboard', async ({ env }) => {
    const ym = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const q = (sql, ...a) => env.DB.prepare(sql).bind(...a).first();
    const [p, t, rv, iq, m1, m2, mf, qu, rw] = await Promise.all([
      q(`SELECT COUNT(*) AS n FROM reservations WHERE status = 'pending'`),
      q(`SELECT COUNT(*) AS n FROM reservations WHERE status IN ('pending','confirmed') AND substr(pickup_at,1,10) = ?`, today),
      q(`SELECT COUNT(*) AS n FROM applications WHERE status = 'review'`),
      q(`SELECT COUNT(*) AS n FROM inquiries WHERE status = 'wait'`),
      q(`SELECT COUNT(*) AS n FROM reservations WHERE substr(created_at,1,7) = ?`, ym),
      q(`SELECT COUNT(*) AS n FROM applications WHERE substr(created_at,1,7) = ?`, ym),
      q(`SELECT COUNT(*) AS n FROM mail_log WHERE status = 'failed'`),
      q(`SELECT COUNT(*) AS n FROM quote_users WHERE status = 'pending'`),
      q(`SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending' OR (status = 'published' AND coupon = 'none')`),
    ]);
    return json({ pendingShort: p.n, todayPickup: t.n, reviewLong: rv.n, waitInquiry: iq.n, monthTotal: m1.n + m2.n, mailFailed: mf.n, pendingQuoteUsers: qu.n, reviewTodo: rw.n });
  });

  // ── 단기 예약 ────────────────────────────────────────
  r.get('/api/admin/reservations', async ({ env, url }) => {
    const status = url.searchParams.get('status') || '';
    const q = cleanText(url.searchParams.get('q'), 40);
    const where = [];
    const args = [];
    if (status) { where.push('status = ?'); args.push(status); }
    if (q) { where.push('(name LIKE ? OR phone LIKE ? OR no LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const { results } = await env.DB
      .prepare(`SELECT * FROM reservations ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 300`)
      .bind(...args)
      .all();
    const nos = results.map((x) => x.no);
    const mail = await mailSummary(env, nos);
    return json({ reservations: results.map((x) => ({ ...x, mail: mail[x.no] || '' })) });
  });
  r.patch('/api/admin/reservations/:id', async ({ env, params, request }) => {
    const b = await readJson(request);
    const row = {};
    if (b.status !== undefined) {
      if (!RES_STATUS.includes(b.status)) throw bad('상태 값을 확인해 주세요.');
      row.status = b.status;
    }
    if (b.vehicle_ref !== undefined) row.vehicle_ref = cleanText(b.vehicle_ref, 40);
    if (b.admin_memo !== undefined) row.admin_memo = cleanText(b.admin_memo, 1000);
    await updateRow(env.DB, 'reservations', int(params.id), row, true);
    return json({ ok: true });
  });

  // ── 중장기 신청 · 법인 견적 ──────────────────────────
  r.get('/api/admin/applications', async ({ env, url }) => {
    const status = url.searchParams.get('status') || '';
    const q = cleanText(url.searchParams.get('q'), 40);
    const where = [];
    const args = [];
    if (status) { where.push('status = ?'); args.push(status); }
    if (q) { where.push('(name LIKE ? OR phone LIKE ? OR company LIKE ? OR no LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
    const { results } = await env.DB
      .prepare(`SELECT * FROM applications ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 300`)
      .bind(...args)
      .all();
    const mail = await mailSummary(env, results.map((x) => x.no));
    return json({ applications: results.map((x) => ({ ...x, mail: mail[x.no] || '' })) });
  });
  r.patch('/api/admin/applications/:id', async ({ env, params, request }) => {
    const b = await readJson(request);
    const row = {};
    if (b.status !== undefined) {
      if (!APP_STATUS.includes(b.status)) throw bad('상태 값을 확인해 주세요.');
      row.status = b.status;
    }
    if (b.admin_memo !== undefined) row.admin_memo = cleanText(b.admin_memo, 1000);
    await updateRow(env.DB, 'applications', int(params.id), row, true);
    // 계약 완료되면 차량을 목록에서 내리고, 취소·부결이면 다시 출고 가능으로
    if (row.status) {
      const a = await env.DB.prepare('SELECT vehicle_id FROM applications WHERE id = ?').bind(int(params.id)).first();
      if (a && a.vehicle_id) {
        if (row.status === 'contracted')
          await env.DB.prepare(`UPDATE long_vehicles SET status = 'contracted', visible = 0, updated_at = datetime('now') WHERE id = ?`).bind(a.vehicle_id).run();
        if (row.status === 'rejected' || row.status === 'cancelled') {
          const other = await env.DB
            .prepare(`SELECT COUNT(*) AS n FROM applications WHERE vehicle_id = ? AND status IN ('review','approved') AND id <> ?`)
            .bind(a.vehicle_id, int(params.id))
            .first();
          if (!other.n) await env.DB.prepare(`UPDATE long_vehicles SET status = 'available' WHERE id = ? AND status = 'reserved'`).bind(a.vehicle_id).run();
        }
      }
    }
    return json({ ok: true });
  });

  // ── 고객 ─────────────────────────────────────────────
  r.get('/api/admin/customers', async ({ env, url }) => {
    const q = cleanText(url.searchParams.get('q'), 40);
    const kind = url.searchParams.get('kind') || '';
    const where = [];
    const args = [];
    if (q) { where.push('(c.name LIKE ? OR c.phone LIKE ? OR c.company LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (kind) { where.push('c.kind = ?'); args.push(kind); }
    const mk = url.searchParams.get('mk') || '';
    if (mk === 'agree') where.push('c.marketing_agree = 1');
    // 수신 동의 2년마다 다시 알림 (법정 의무) — 동의한 지 23개월이 지난 고객
    if (mk === 'renew') where.push(`c.marketing_agree = 1 AND c.marketing_agreed_at <> '' AND c.marketing_agreed_at <= datetime('now', '-23 months')`);
    const { results } = await env.DB
      .prepare(
        `SELECT c.*,
           (SELECT COUNT(*) FROM reservations r WHERE r.customer_id = c.id) AS res_n,
           (SELECT COUNT(*) FROM applications a WHERE a.customer_id = c.id) AS app_n,
           (SELECT COUNT(*) FROM inquiries i WHERE i.customer_id = c.id) AS inq_n,
           (SELECT COUNT(*) FROM reviews v WHERE v.customer_id = c.id) AS rev_n
         FROM customers c ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.updated_at DESC LIMIT 300`
      )
      .bind(...args)
      .all();
    return json({ customers: results });
  });
  r.get('/api/admin/customers/:id', async ({ env, params }) => {
    const id = int(params.id);
    const c = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first();
    if (!c) throw new HttpError(404, '고객을 찾을 수 없습니다.');
    const [res, apps, inqs, revs] = await Promise.all([
      env.DB.prepare('SELECT no, status, model_name, pickup_at, return_at, location_name, total_amt, created_at FROM reservations WHERE customer_id = ? ORDER BY id DESC').bind(id).all(),
      env.DB.prepare('SELECT no, status, applicant_type, vehicle_name, term, dep_pct, monthly, created_at FROM applications WHERE customer_id = ? ORDER BY id DESC').bind(id).all(),
      env.DB.prepare('SELECT no, type, title, status, created_at FROM inquiries WHERE customer_id = ? ORDER BY id DESC').bind(id).all(),
      env.DB.prepare('SELECT no, rating, title, status, coupon, created_at FROM reviews WHERE customer_id = ? ORDER BY id DESC').bind(id).all(),
    ]);
    return json({ customer: c, reservations: res.results, applications: apps.results, inquiries: inqs.results, reviews: revs.results });
  });
  r.patch('/api/admin/customers/:id', async ({ env, params, request }) => {
    const b = await readJson(request);
    const row = pick(b, { name: 's30', kind: 's10', company: 's60', biz_no: 's20', email: 's80', memo: 's2000', erp_ref: 's40' });
    await updateRow(env.DB, 'customers', int(params.id), row, true);
    // 마케팅 수신 동의 · 철회 (전화로 철회 요청을 받은 경우 등) — 바뀔 때만 시각 기록
    if (b.marketing_agree !== undefined) {
      const v = b.marketing_agree ? 1 : 0;
      await env.DB.prepare(`UPDATE customers SET marketing_agreed_at = datetime('now'), marketing_agree = ? WHERE id = ? AND marketing_agree <> ?`).bind(v, int(params.id), v).run();
    }
    return json({ ok: true });
  });

  // ── 1:1 문의 ─────────────────────────────────────────
  r.get('/api/admin/inquiries', async ({ env, url }) => {
    const status = url.searchParams.get('status') || '';
    const { results } = await env.DB
      .prepare(`SELECT * FROM inquiries ${status ? 'WHERE status = ?' : ''} ORDER BY CASE status WHEN 'wait' THEN 0 ELSE 1 END, id DESC LIMIT 300`)
      .bind(...(status ? [status] : []))
      .all();
    return json({ inquiries: results.map(({ pw_hash, ...q }) => ({ ...q, attachments: JSON.parse(q.attachments || '[]').map(img) })) });
  });
  r.patch('/api/admin/inquiries/:id', async ({ env, params, request }) => {
    const b = await readJson(request);
    const answer = cleanText(b.answer, 5000);
    await env.DB
      .prepare(`UPDATE inquiries SET answer = ?, status = ?, answered_at = CASE WHEN ? <> '' THEN datetime('now') ELSE NULL END WHERE id = ?`)
      .bind(answer, answer ? 'done' : 'wait', answer, int(params.id))
      .run();
    return json({ ok: true });
  });
  r.delete('/api/admin/inquiries/:id', async ({ env, params }) => {
    await env.DB.prepare('DELETE FROM inquiries WHERE id = ?').bind(int(params.id)).run();
    return json({ ok: true });
  });

  // ── 단순 목록(장소·보험·차종·임시차량·배너·게시글) ──
  for (const [name, def] of Object.entries(SIMPLE)) {
    r.get(`/api/admin/${name}`, async ({ env }) => {
      const { results } = await env.DB.prepare(`SELECT * FROM ${def.table} ORDER BY ${def.order}`).all();
      return json({ items: results.map((x) => (x.image_key !== undefined ? { ...x, image: img(x.image_key) } : x)) });
    });
    r.post(`/api/admin/${name}`, async ({ env, request }) => {
      const id = await insertRow(env.DB, def.table, pick(await readJson(request), def.fields));
      return json({ ok: true, id });
    });
    r.patch(`/api/admin/${name}/:id`, async ({ env, params, request }) => {
      await updateRow(env.DB, def.table, int(params.id), pick(await readJson(request), def.fields), def.touch);
      return json({ ok: true });
    });
    r.delete(`/api/admin/${name}/:id`, async ({ env, params }) => {
      await env.DB.prepare(`DELETE FROM ${def.table} WHERE id = ?`).bind(int(params.id)).run();
      return json({ ok: true });
    });
    // 순서 저장: { ids: [3,1,2] }
    r.post(`/api/admin/${name}/order`, async ({ env, request }) => {
      const b = await readJson(request);
      const ids = Array.isArray(b.ids) ? b.ids.map((x) => int(x)) : [];
      if (!ids.length) return json({ ok: true });
      await env.DB.batch(ids.map((id, i) => env.DB.prepare(`UPDATE ${def.table} SET sort = ? WHERE id = ?`).bind(i + 1, id)));
      return json({ ok: true });
    });
  }

  // ── 중장기 차량 · 가격표 · 실차 사진 ─────────────────
  // 표 형식 입력 (추가 옵션 · 이용이력 · 사고수리내역): 숫자 칸은 정수로
  const rows = (spec, max = 40) => (v) =>
    JSON.stringify(
      (Array.isArray(v) ? v : [])
        .slice(0, max)
        .map((x) => Object.fromEntries(Object.entries(spec).map(([k, t]) => [k, t === 'i' ? int(String(x && x[k] != null ? x[k] : '').replace(/[^\d-]/g, '')) : cleanText(x && x[k], t)])))
        .filter((x) => Object.values(x).some((y) => y))
    );
  const pricingField = (v) => {
    const p = pricingOf(v && typeof v === 'object' ? v : {});
    const t = (x, n = 100) => cleanText(x, n);
    return JSON.stringify({
      ...p,
      driverAge: t(p.driverAge, 40), deductible: t(p.deductible, 40), buyout: t(p.buyout, 20), buyoutNote: t(p.buyoutNote, 300),
      maintAddNote: t(p.maintAddNote, 300), regionNote: t(p.regionNote, 300),
      liability: p.liability.slice(0, 8).map((x) => ({ label: t(x.label, 30), fee: x.fee })),
      maintItems: p.maintItems.slice(0, 20).map((x) => t(x, 200)), regions: p.regions.slice(0, 20).map((x) => t(x, 40)),
    });
  };
  const LONG_FIELDS = {
    erp_ref: 's40', plate: 's20', name: 's100', class: 's20', year: 'i', first_reg: 's20', km: 'i', fuel: 's20', color: 's40',
    seats: 'i', accident: 's60', pickup: 's100', options: 's1000', badge: 's20', car_value: 'i', km_note: 's60', status: 's12', visible: 'b', sort: 'i',
    new_price: 'i', tax_cut: 'i', displacement: 'i', int_color: 's40', show_plate: 'b', location: 's40', avail_note: 's100', spec_text: 's6000',
    added_options: rows({ name: 60, price: 'i' }), usage_history: rows({ kind: 30, period: 40, user: 40 }), repair_history: rows({ date: 20, detail: 200, cost: 'i' }),
    pricing: pricingField,
    maker: 's20', model_group: 's40',
    price_mode: (v) => (v === 'quote' ? 'quote' : 'table'), acq_cost: 'i',
    rv_rates: (v) => JSON.stringify(usedRates(v && typeof v === 'object' ? v : {})),
    option_list: (v) => JSON.stringify((Array.isArray(v) ? v : []).filter((x) => ALL_OPTIONS.includes(x))),
    terms: (v) => {
      const t = v && typeof v === 'object' ? v : {};
      const c = (k, n = 60) => cleanText(t[k], n);
      return JSON.stringify({
        minAge: t.minAge in AGE ? t.minAge : '26', career: c('career', 4), credit: c('credit', 4), penalty: c('penalty', 6), overKm: c('overKm', 10),
        buyout: t.buyout === false || t.buyout === 'no' ? 'no' : 'yes', maint: t.maint in MAINT ? t.maint : 'none', maintDesc: c('maintDesc', 500),
        liabPerson: c('liabPerson', 20), liabProperty: c('liabProperty', 20), liabSelf: c('liabSelf', 20),
        dedCar: c('dedCar', 20), dedProperty: c('dedProperty', 20), dedPerson: c('dedPerson', 20), dedSelf: c('dedSelf', 20), dedNote: c('dedNote', 200),
        driverPerson: c('driverPerson', 200), driverCorp: c('driverCorp', 200),
      });
    },
  };
  const normPlate = (v) => String(v || '').replace(/\s+/g, '');
  r.get('/api/admin/long', async ({ env }) => {
    const { results } = await env.DB
      .prepare(
        `SELECT v.*, (SELECT COUNT(*) FROM long_photos p WHERE p.vehicle_id = v.id) AS photo_n,
                (SELECT COUNT(*) FROM long_prices p WHERE p.vehicle_id = v.id AND p.dep_pct = 0) AS price_n,
                (SELECT COUNT(*) FROM long_plans p WHERE p.vehicle_id = v.id) AS plan_n,
                (SELECT monthly FROM long_plans p WHERE p.vehicle_id = v.id ORDER BY is_main DESC, sort, id LIMIT 1) AS main_monthly,
                (SELECT image_key FROM long_photos p WHERE p.vehicle_id = v.id ORDER BY sort, id LIMIT 1) AS photo_key
         FROM long_vehicles v ORDER BY v.sort, v.id DESC`
      )
      .all();
    return json({ items: results.map((v) => ({ ...v, photo: img(v.photo_key) })) });
  });
  r.get('/api/admin/long/:id', async ({ env, params }) => {
    const id = int(params.id);
    const v = await env.DB.prepare('SELECT * FROM long_vehicles WHERE id = ?').bind(id).first();
    if (!v) throw new HttpError(404, '차량을 찾을 수 없습니다.');
    const [prices, photos, plans] = await Promise.all([
      env.DB.prepare('SELECT term, monthly FROM long_prices WHERE vehicle_id = ? AND dep_pct = 0 ORDER BY term DESC').bind(id).all(),
      env.DB.prepare('SELECT id, image_key, sort FROM long_photos WHERE vehicle_id = ? ORDER BY sort, id').bind(id).all(),
      env.DB.prepare('SELECT * FROM long_plans WHERE vehicle_id = ? ORDER BY sort, id').bind(id).all(),
    ]);
    const pj = (k, d = '[]') => { try { return JSON.parse(v[k] || d); } catch { return JSON.parse(d); } };
    const vehicle = { ...v, rv_rates: usedRates(v.rv_rates), added_options: pj('added_options'), usage_history: pj('usage_history'), repair_history: pj('repair_history'), pricing: pricingOf(v.pricing), option_list: pj('option_list'), terms: pj('terms', '{}') };
    return json({ vehicle, prices: prices.results, plans: plans.results, photos: photos.results.map((p) => ({ ...p, url: img(p.image_key) })) });
  });
  // 차량번호로 등록 시작: 이미 있으면 그 차량, 없으면 (ERP 연동 시 ERP 정보로) 새 차량을 숨김 상태로 만들고 id 반환
  r.post('/api/admin/long/by-plate', async ({ env, request }) => {
    const b = await readJson(request);
    const plate = normPlate(cleanText(b.plate, 20));
    if (!/^\d{2,3}[가-힣]\d{4}$/.test(plate)) throw bad('차량번호를 확인해 주세요. (예: 109허7586)');
    const found = await env.DB.prepare(`SELECT id FROM long_vehicles WHERE REPLACE(plate, ' ', '') = ?`).bind(plate).first();
    if (found) return json({ ok: true, id: found.id, existed: true });
    let erp = null;
    try {
      const r = await searchErpVehicles(env, plate);
      erp = (r.vehicles || []).find((x) => normPlate(x.plate) === plate) || null;
    } catch {}
    const row = {
      plate, name: erp?.name || plate, class: erp?.class || '', year: int(erp?.year) || 0, first_reg: erp?.first_reg || '', km: int(erp?.km) || 0,
      fuel: erp?.fuel || '', color: erp?.color || '', seats: int(erp?.seats) || 0, new_price: int(erp?.new_price) || 0, displacement: int(erp?.displacement) || 0,
      erp_ref: erp?.id ? String(erp.id) : '', status: 'available', visible: 0, badge: '즉시출고', price_mode: 'quote',
    };
    return json({ ok: true, id: await insertRow(env.DB, 'long_vehicles', row), existed: false, fromErp: !!erp });
  });
  r.post('/api/admin/long', async ({ env, request }) => {
    const row = pick(await readJson(request), LONG_FIELDS);
    if (!row.name) throw bad('차명을 입력해 주세요.');
    return json({ ok: true, id: await insertRow(env.DB, 'long_vehicles', row) });
  });
  // 견적형 미리 계산 (저장 전 입력값으로)
  r.post('/api/admin/long/used-preview', async ({ env, request }) => {
    const b = await readJson(request);
    const cfg = await loadQuoteConfig(env.DB);
    const veh = { acq_cost: int(b.acq_cost), new_price: int(b.new_price), rv_rates: b.rv_rates || {}, displacement: int(b.displacement), fuel: cleanText(b.fuel, 20), class: cleanText(b.class, 20) };
    return json({ byKm: USED_KMS.map((km) => ({ km, q: computeUsed(veh, { dep: 0, pre: 0, km }, cfg) })), baseKm: usedBaseKm(cfg), selfIns: cfg.usedSelfIns, rate: cfg.rate });
  });
  // 이용금액 통째로 저장: { plans: [{deposit, term, monthly, km_year, buyout, is_main}] }
  r.put('/api/admin/long/:id/plans', async ({ env, params, request }) => {
    const id = int(params.id);
    const b = await readJson(request);
    const list = (Array.isArray(b.plans) ? b.plans : []).slice(0, 12)
      .map((p) => ({ deposit: Math.max(0, int(p.deposit)), term: int(p.term), monthly: int(p.monthly), km_year: Math.max(0, int(p.km_year)), buyout: Math.max(0, int(p.buyout)), is_main: p.is_main ? 1 : 0 }))
      .filter((p) => p.term > 0 && p.term <= 120 && p.monthly > 0);
    if (list.length && !list.some((p) => p.is_main)) list[0].is_main = 1;
    let mainSeen = false;
    for (const p of list) { if (p.is_main && mainSeen) p.is_main = 0; if (p.is_main) mainSeen = true; }
    await env.DB.batch([
      env.DB.prepare('DELETE FROM long_plans WHERE vehicle_id = ?').bind(id),
      ...list.map((p, i) => env.DB.prepare('INSERT INTO long_plans (vehicle_id, deposit, term, monthly, km_year, buyout, is_main, sort) VALUES (?,?,?,?,?,?,?,?)').bind(id, p.deposit, p.term, p.monthly, p.km_year, p.buyout, p.is_main, i + 1)),
    ]);
    return json({ ok: true, count: list.length });
  });
  r.patch('/api/admin/long/:id', async ({ env, params, request }) => {
    await updateRow(env.DB, 'long_vehicles', int(params.id), pick(await readJson(request), LONG_FIELDS), true);
    return json({ ok: true });
  });
  r.delete('/api/admin/long/:id', async ({ env, params }) => {
    const id = int(params.id);
    const { results } = await env.DB.prepare('SELECT image_key FROM long_photos WHERE vehicle_id = ?').bind(id).all();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM long_photos WHERE vehicle_id = ?').bind(id),
      env.DB.prepare('DELETE FROM long_prices WHERE vehicle_id = ?').bind(id),
      env.DB.prepare('DELETE FROM long_plans WHERE vehicle_id = ?').bind(id),
      env.DB.prepare('UPDATE applications SET vehicle_id = NULL WHERE vehicle_id = ?').bind(id),
      env.DB.prepare('DELETE FROM long_vehicles WHERE id = ?').bind(id),
    ]);
    if (results.length) await env.IMAGES.delete(results.map((p) => p.image_key));
    return json({ ok: true });
  });
  // 기간별 기준 월 렌트료 통째로 저장: { prices: [{term, monthly}] } (기준 약정거리 · 무보증 · 선납 없음)
  r.put('/api/admin/long/:id/prices', async ({ env, params, request }) => {
    const id = int(params.id);
    const b = await readJson(request);
    const list = (Array.isArray(b.prices) ? b.prices : [])
      .map((p) => ({ term: int(p.term), dep: 0, monthly: int(p.monthly) }))
      .filter((p, i, a) => p.term > 0 && p.term <= 120 && p.monthly > 0 && a.findIndex((x) => x.term === p.term) === i);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM long_prices WHERE vehicle_id = ?').bind(id),
      ...list.map((p) => env.DB.prepare('INSERT INTO long_prices (vehicle_id, term, dep_pct, monthly) VALUES (?,?,?,?)').bind(id, p.term, p.dep, p.monthly)),
    ]);
    return json({ ok: true, count: list.length });
  });
  r.post('/api/admin/long/:id/photos', async ({ env, params, request }) => {
    const id = int(params.id);
    const form = await request.formData();
    const files = form.getAll('files').filter((f) => f && typeof f === 'object' && f.size > 0).slice(0, 20);
    const cnt = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(sort),0) AS m FROM long_photos WHERE vehicle_id = ?').bind(id).first();
    if (cnt.n + files.length > 20) throw bad('차량 한 대에 사진은 20장까지 올릴 수 있습니다.');
    let sort = cnt.m;
    for (const f of files) {
      const key = await saveUpload(env, f, 'long');
      await env.DB.prepare('INSERT INTO long_photos (vehicle_id, image_key, sort) VALUES (?,?,?)').bind(id, key, ++sort).run();
    }
    return json({ ok: true, added: files.length });
  });
  r.post('/api/admin/long/:id/photos/order', async ({ env, params, request }) => {
    const b = await readJson(request);
    const ids = Array.isArray(b.ids) ? b.ids.map((x) => int(x)) : [];
    if (!ids.length) return json({ ok: true });
    await env.DB.batch(ids.map((pid, i) => env.DB.prepare('UPDATE long_photos SET sort = ? WHERE id = ? AND vehicle_id = ?').bind(i + 1, pid, int(params.id))));
    return json({ ok: true });
  });
  r.delete('/api/admin/long/:id/photos/:pid', async ({ env, params }) => {
    const p = await env.DB.prepare('SELECT * FROM long_photos WHERE id = ? AND vehicle_id = ?').bind(int(params.pid), int(params.id)).first();
    if (p) {
      await env.DB.prepare('DELETE FROM long_photos WHERE id = ?').bind(p.id).run();
      await env.IMAGES.delete(p.image_key);
    }
    return json({ ok: true });
  });
  r.get('/api/admin/erp/vehicles', async ({ env, url }) => {
    try {
      return json(await searchErpVehicles(env, url.searchParams.get('q')));
    } catch (e) {
      return json({ enabled: true, vehicles: [], error: String(e.message || e) });
    }
  });

  // ── 사진 올리기 (배너 · 차종 이미지 · 게시글) ────────
  r.post('/api/admin/upload', async ({ env, request }) => {
    const form = await request.formData();
    const folder = ['banner', 'model', 'post'].includes(form.get('folder')) ? form.get('folder') : 'post';
    const file = form.get('file');
    if (!file || typeof file !== 'object') throw bad('파일을 선택해 주세요.');
    const key = await saveUpload(env, file, folder);
    return json({ ok: true, key, url: img(key) });
  });

  // ── 설정 · 메일 ──────────────────────────────────────
  const SETTING_KEYS = ['notify_email_1', 'notify_email_2', 'notify_kinds', 'site_phone', 'site_messenger', 'company_address', 'company_biz_no', 'company_ceo', 'short_min_age_note', 'review_notice', 'review_banned_words', 'review_approve_all'];
  r.get('/api/admin/settings', async ({ env }) => {
    const s = await getSettings(env.DB);
    return json({ settings: s, mailFrom: env.MAIL_FROM, erpEnabled: !!(env.ERP_API_BASE || '').trim() });
  });
  r.put('/api/admin/settings', async ({ env, request }) => {
    const b = await readJson(request);
    const stmts = [];
    for (const k of SETTING_KEYS) {
      if (!(k in b)) continue;
      let v = b[k];
      if (k === 'notify_kinds') v = JSON.stringify(Array.isArray(v) ? v.map((x) => cleanText(x, 20)) : []);
      else v = cleanText(v, k.startsWith('review_') ? 1000 : 200);
      if ((k === 'notify_email_1' || k === 'notify_email_2') && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw bad('이메일 주소 형식을 확인해 주세요.');
      stmts.push(env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true });
  });
  r.post('/api/admin/mail-test', async ({ env }) => {
    const html = buildMailHtml({
      title: '테스트 메일',
      intro: '홈페이지 알림 메일 설정이 정상인지 확인하는 메일입니다. 이 메일이 보이면 예약·신청 알림도 같은 주소로 들어옵니다.',
      rows: [['보낸 주소', env.MAIL_FROM], ['사이트', env.SITE_URL]],
    });
    const ids = await notifyAdmins(env, { kind: '테스트', refNo: '', subject: '[에이스렌터카] 알림 메일 테스트', html });
    if (!ids.length) throw bad('수신 이메일을 먼저 저장해 주세요.');
    const { results } = await env.DB.prepare(`SELECT recipient, status, error FROM mail_log WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
    return json({ ok: true, results });
  });
  r.get('/api/admin/mail-log', async ({ env }) => {
    const { results } = await env.DB
      .prepare('SELECT id, kind, ref_no, recipient, subject, status, error, attempts, created_at, sent_at FROM mail_log ORDER BY id DESC LIMIT 200')
      .all();
    return json({ logs: results });
  });
  r.get('/api/admin/mail-log/:id', async ({ env, params }) => {
    const m = await env.DB.prepare('SELECT * FROM mail_log WHERE id = ?').bind(int(params.id)).first();
    if (!m) throw new HttpError(404, '기록을 찾을 수 없습니다.');
    return json({ log: m });
  });
  r.post('/api/admin/mail-log/:id/resend', async ({ env, params }) => {
    const ok = await sendLogged(env, int(params.id));
    return json({ ok });
  });

  // ── 엑셀(CSV) 내려받기 ───────────────────────────────
  r.get('/api/admin/export/:what', async ({ env, params }) => {
    const defs = {
      reservations: ['SELECT no 신청번호, status 상태, name 고객, phone 연락처, model_name 차종, location_name 장소, pickup_at 대여, return_at 반납, days 일수, insurance_name 보험, total_amt 예상요금, vehicle_ref 배정차량, admin_memo 메모, created_at 접수일시 FROM reservations ORDER BY id DESC', '단기예약'],
      applications: ['SELECT no 신청번호, status 상태, applicant_type 구분, company 법인명, name 이름, phone 연락처, vehicle_name 차량, term 기간, dep_pct 보증금퍼센트, deposit_amt 보증금, monthly 월렌트료, km 약정거리, wish_date 희망출고일, admin_memo 메모, created_at 접수일시 FROM applications ORDER BY id DESC', '중장기신청'],
      customers: ["SELECT name 이름, phone 연락처, kind 구분, company 법인명, biz_no 사업자번호, email 이메일, source 경로, CASE WHEN marketing_agree = 1 THEN '동의' ELSE '' END 마케팅수신, marketing_agreed_at 마케팅동의일시_UTC, memo 메모, created_at 등록일 FROM customers ORDER BY id DESC", '고객'],
    };
    const d = defs[params.what];
    if (!d) throw new HttpError(404, '없는 항목입니다.');
    const { results } = await env.DB.prepare(d[0]).all();
    const cols = results.length ? Object.keys(results[0]) : [];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '﻿' + [cols.map(cell).join(','), ...results.map((r0) => cols.map((c) => cell(r0[c])).join(','))].join('\r\n');
    const fname = encodeURIComponent(`${d[1]}_${new Date().toISOString().slice(0, 10)}.csv`);
    return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename*=UTF-8''${fname}` } });
  });

  // ── 테스트 데이터 정리 (최종 전환 전) ────────────────
  r.post('/api/admin/cleanup-test', async ({ env, request }) => {
    const b = await readJson(request);
    if (b.confirm !== '테스트 데이터 삭제') throw bad('확인 문구를 정확히 입력해 주세요.');
    const { results: att } = await env.DB.prepare('SELECT attachments FROM inquiries').all();
    const keys = att.flatMap((a) => JSON.parse(a.attachments || '[]'));
    await env.DB.batch([
      env.DB.prepare('DELETE FROM reservations'),
      env.DB.prepare('DELETE FROM applications'),
      env.DB.prepare('DELETE FROM inquiries'),
      env.DB.prepare('DELETE FROM mail_log'),
      env.DB.prepare('DELETE FROM reviews'),
      env.DB.prepare('DELETE FROM phone_codes'),
      env.DB.prepare('DELETE FROM customers'),
      env.DB.prepare(`UPDATE long_vehicles SET status = 'available' WHERE status = 'reserved'`),
    ]);
    for (let i = 0; i < keys.length; i += 500) await env.IMAGES.delete(keys.slice(i, i + 500));
    return json({ ok: true });
  });
}

async function mailSummary(env, nos) {
  if (!nos.length) return {};
  const { results } = await env.DB
    .prepare(`SELECT ref_no, status, COUNT(*) AS n FROM mail_log WHERE ref_no IN (${nos.map(() => '?').join(',')}) GROUP BY ref_no, status`)
    .bind(...nos)
    .all();
  const out = {};
  for (const r of results) {
    const o = (out[r.ref_no] = out[r.ref_no] || { sent: 0, failed: 0 });
    if (r.status === 'sent') o.sent += r.n;
    else o.failed += r.n;
  }
  const label = {};
  for (const [no, o] of Object.entries(out)) label[no] = o.failed ? `${o.sent}곳 발송 · ${o.failed}곳 실패` : `${o.sent}곳 발송`;
  return label;
}
