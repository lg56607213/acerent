// 이벤트 · 이용후기 (고객용 + 관리자용)
import { json, readJson, bad, HttpError, cleanText, cleanPhone, maskName, nextNo, upsertCustomer, getSettings, int, recordConsent } from '../lib/util.js';
import { saveUpload } from './upload.js';
import { buildMailHtml, notifyAdmins } from '../lib/mail.js';
import { smsEnabled, turnstileEnabled, checkTurnstile, sendCode, verifyCode, consumeToken, spamReason, ipHash } from '../lib/guard.js';

const img = (k) => (k ? (String(k).startsWith('/') ? k : '/img/' + k) : '');
const list = (s) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const eventState = (p, today = todayKst()) => (p.start_date && p.start_date > today ? 'upcoming' : p.end_date && p.end_date < today ? 'ended' : 'ongoing');

export function registerCommunity(r) {
  // 화면 설정: 문자 인증 · 사람 확인 사용 여부
  r.get('/api/community/config', async ({ env }) => {
    const [s, models] = await Promise.all([getSettings(env.DB), env.DB.prepare('SELECT name FROM short_models WHERE active = 1 ORDER BY sort, id').all()]);
    return json({
      sms: smsEnabled(env), turnstileKey: turnstileEnabled(env) ? env.TURNSTILE_SITE_KEY : '', reviewNotice: s.review_notice || '',
      carModels: models.results.map((m) => m.name),
    });
  });

  // ── 휴대폰 문자 인증 ──
  r.post('/api/phone/send', async ({ env, request }) => {
    if (!smsEnabled(env)) throw new HttpError(503, '문자 인증을 준비 중입니다.');
    const b = await readJson(request);
    const phone = cleanPhone(b.phone);
    if (!phone || !/^010/.test(phone.replace(/\D/g, ''))) throw bad('휴대폰 번호(010)를 확인해 주세요.');
    await checkTurnstile(env, b.turnstile, request);
    await sendCode(env, phone, request);
    return json({ ok: true });
  });
  r.post('/api/phone/verify', async ({ env, request }) => {
    const b = await readJson(request);
    const phone = cleanPhone(b.phone);
    if (!phone) throw bad('휴대폰 번호를 확인해 주세요.');
    return json({ ok: true, token: await verifyCode(env, phone, b.code) });
  });

  // ── 이벤트 ──
  r.get('/api/events', async ({ env }) => {
    const { results } = await env.DB
      .prepare(`SELECT id, title, summary, start_date, end_date, image_key, pinned, created_at FROM posts WHERE board = 'event' AND visible = 1 ORDER BY pinned DESC, id DESC LIMIT 100`)
      .all();
    const today = todayKst();
    const rank = { ongoing: 0, upcoming: 1, ended: 2 };
    const events = results
      .map((p) => ({ id: p.id, title: p.title, summary: p.summary, start_date: p.start_date, end_date: p.end_date, image: img(p.image_key), pinned: p.pinned, created_at: p.created_at, state: eventState(p, today) }))
      .sort((a, b) => rank[a.state] - rank[b.state] || b.pinned - a.pinned || b.id - a.id);
    return json({ events });
  });
  r.get('/api/events/:id', async ({ env, params }) => {
    const p = await env.DB.prepare(`SELECT * FROM posts WHERE id = ? AND board = 'event' AND visible = 1`).bind(int(params.id)).first();
    if (!p) throw new HttpError(404, '이벤트를 찾을 수 없습니다.');
    return json({
      event: {
        id: p.id, title: p.title, summary: p.summary, body: p.body, start_date: p.start_date, end_date: p.end_date, image: img(p.image_key),
        attachments: list(p.attachments).map(img), cta_label: p.cta_label, cta_link: /^\/[^/]/.test(p.cta_link) ? p.cta_link : '', state: eventState(p), created_at: p.created_at,
      },
    });
  });

  // ── 이용후기 ──
  r.get('/api/reviews', async ({ env, url }) => {
    const page = Math.max(1, int(url.searchParams.get('page'), 1));
    const size = Math.min(20, Math.max(1, int(url.searchParams.get('size'), 10)));
    const [rows, stat] = await Promise.all([
      env.DB.prepare(`SELECT id, name, rating, car_model, use_month, title, body, photos, created_at FROM reviews WHERE status = 'published' ORDER BY id DESC LIMIT ? OFFSET ?`).bind(size, (page - 1) * size).all(),
      env.DB.prepare(`SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE status = 'published'`).first(),
    ]);
    return json({
      total: stat.n, avg: stat.avg ? Math.round(stat.avg * 10) / 10 : 0,
      reviews: rows.results.map((x) => ({ ...x, name: maskName(x.name), photos: list(x.photos).map(img) })),
    });
  });

  r.post('/api/reviews', async ({ env, request, ctx }) => {
    const form = await request.formData().catch(() => null);
    if (!form) throw bad('요청 형식이 올바르지 않습니다.');
    if (form.get('website')) return json({ ok: true, status: 'pending' }); // 숨김 칸을 채운 자동 프로그램

    const name = cleanText(form.get('name'), 30);
    const phone = cleanPhone(form.get('phone'));
    const title = cleanText(form.get('title'), 80);
    const body = cleanText(form.get('body'), 2000);
    const rating = Math.min(5, Math.max(1, int(form.get('rating'), 5)));
    const carModel = cleanText(form.get('carModel'), 40);
    const useMonth = /^\d{4}-\d{2}$/.test(String(form.get('useMonth') || '')) ? String(form.get('useMonth')) : '';
    if (!name) throw bad('이름을 입력해 주세요.');
    if (!phone) throw bad('휴대폰 번호를 확인해 주세요.');
    if (!title) throw bad('제목을 입력해 주세요.');
    if (body.length < 20) throw bad('후기 내용은 20자 이상 남겨 주세요.');
    if (form.get('agreePrivacy') !== 'true') throw bad('[필수] 개인정보 수집 · 이용에 동의해 주세요.');
    const marketing = form.get('agreeMarketing') === 'true';

    // 문자 인증을 쓰면 사람 확인은 인증번호 요청 때 이미 거침. 문자 인증이 없으면 등록할 때 사람 확인
    let verified = false;
    if (smsEnabled(env)) {
      verified = await consumeToken(env, phone, form.get('verifyToken'));
      if (!verified) throw bad('휴대폰 문자 인증을 먼저 완료해 주세요.');
    } else {
      await checkTurnstile(env, form.get('turnstile'), request);
    }

    // 작성 횟수 제한
    const ip = await ipHash(request);
    const q = (sql, ...a) => env.DB.prepare(sql).bind(...a).first();
    const [byIp, byPhone] = await Promise.all([
      q(`SELECT COUNT(*) AS n FROM reviews WHERE ip_hash = ? AND created_at > datetime('now', '-1 day')`, ip),
      q(`SELECT COUNT(*) AS n FROM reviews WHERE phone = ? AND created_at > datetime('now', '-7 day')`, phone),
    ]);
    if (byIp.n >= 5) throw new HttpError(429, '오늘은 더 이상 후기를 등록할 수 없습니다. 내일 다시 시도해 주세요.');
    if (byPhone.n >= 2) throw new HttpError(429, '이 번호로 최근에 남긴 후기가 있습니다. 추가 후기는 1:1 문의로 남겨 주세요.');

    const s = await getSettings(env.DB);
    const flag = spamReason(`${title}\n${body}\n${name}\n${carModel}`, s.review_banned_words || '');
    const status = flag || s.review_approve_all === '1' ? 'pending' : 'published';

    const files = form.getAll('photos').filter((f) => f && typeof f === 'object' && f.size > 0).slice(0, 3);
    const keys = [];
    for (const f of files) keys.push(await saveUpload(env, f, 'review', 5 * 1024 * 1024));

    const customerId = await upsertCustomer(env.DB, { name, phone, source: '홈페이지 이용후기' });
    await recordConsent(env.DB, customerId, { marketing, verified });

    const no = await nextNo(env.DB, 'reviews', 'R');
    await env.DB
      .prepare(`INSERT INTO reviews (no, name, phone, customer_id, rating, car_model, use_month, title, body, photos, status, flag, phone_verified, ip_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(no, name, phone, customerId, rating, carModel, useMonth, title, body, JSON.stringify(keys), status, flag, verified ? 1 : 0, ip)
      .run();

    const html = buildMailHtml({
      title: `[이용후기] ${no}`,
      intro: status === 'published' ? '홈페이지에 이용후기가 등록되었습니다. 확인 후 커피 쿠폰을 보내 주세요.' : `이용후기가 '확인 대기'로 들어왔습니다${flag ? ` (자동 차단: ${flag})` : ''}. 관리자에서 게시 여부를 정해 주세요.`,
      rows: [['접수번호', no], ['고객', `${name} · ${phone}`], ['별점', '★'.repeat(rating)], ['이용 차종', carModel], ['이용 시기', useMonth], ['제목', title], ['내용', body], ['마케팅 수신', marketing ? '동의' : '미동의'], ['문자 인증', verified ? '완료' : '미사용']],
      linkUrl: `${env.SITE_URL}/admin/#reviews`, linkText: '관리자에서 확인하기',
    });
    ctx.waitUntil(notifyAdmins(env, { kind: '이용후기', refNo: no, subject: `[이용후기] ${'★'.repeat(rating)} ${title}`, html }));
    return json({ ok: true, no, status });
  });

  // ── 관리자: 이용후기 ──
  r.get('/api/admin/reviews', async ({ env, url }) => {
    const status = url.searchParams.get('status') || '';
    const where = status ? 'WHERE r.status = ?' : '';
    const st = env.DB.prepare(
      `SELECT r.*, c.marketing_agree,
         (SELECT COUNT(*) FROM reviews x WHERE x.phone = r.phone AND x.coupon = 'sent' AND x.id <> r.id) AS prev_coupons,
         (SELECT COUNT(*) FROM reservations s WHERE s.phone = r.phone AND s.status IN ('confirmed','done')) AS res_n
       FROM reviews r LEFT JOIN customers c ON c.id = r.customer_id ${where} ORDER BY r.id DESC LIMIT 300`
    );
    const { results } = await (status ? st.bind(status) : st).all();
    const cnt = await env.DB.prepare(`SELECT status, COUNT(*) AS n FROM reviews GROUP BY status`).all();
    return json({ items: results.map((x) => ({ ...x, photos: list(x.photos).map(img) })), counts: Object.fromEntries(cnt.results.map((c) => [c.status, c.n])) });
  });
  r.patch('/api/admin/reviews/:id', async ({ env, params, request }) => {
    const b = await readJson(request);
    const id = int(params.id);
    const sets = [], vals = [];
    if (b.status !== undefined) {
      if (!['published', 'pending', 'hidden'].includes(b.status)) throw bad('상태를 확인해 주세요.');
      sets.push('status = ?'); vals.push(b.status);
    }
    if (b.coupon !== undefined) {
      if (!['none', 'sent', 'skip'].includes(b.coupon)) throw bad('쿠폰 상태를 확인해 주세요.');
      sets.push('coupon = ?', `coupon_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE NULL END`); vals.push(b.coupon, b.coupon);
    }
    if (b.admin_memo !== undefined) { sets.push('admin_memo = ?'); vals.push(cleanText(b.admin_memo, 500)); }
    if (!sets.length) throw bad('바꿀 내용이 없습니다.');
    await env.DB.prepare(`UPDATE reviews SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...vals, id).run();
    return json({ ok: true });
  });
  r.delete('/api/admin/reviews/:id', async ({ env, params }) => {
    const row = await env.DB.prepare('SELECT photos FROM reviews WHERE id = ?').bind(int(params.id)).first();
    if (!row) throw new HttpError(404, '후기를 찾을 수 없습니다.');
    for (const k of list(row.photos)) await env.IMAGES.delete(k).catch(() => {});
    await env.DB.prepare('DELETE FROM reviews WHERE id = ?').bind(int(params.id)).run();
    return json({ ok: true });
  });
}
