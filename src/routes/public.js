// 고객용 API
import {
  HttpError, bad, json, readJson, cleanText, cleanPhone, isLocalDateTime, rentalDays, nextNo, int,
  getSettings, upsertCustomer, maskName, won, randomHex,
} from '../lib/util.js';
import { availableByModel, pushHold } from '../lib/erp.js';
import { notifyAdmins, buildMailHtml } from '../lib/mail.js';
import { hashPassword, verifyPassword } from '../lib/auth.js';
import { saveUpload } from './upload.js';

const img = (key) => (key ? `/img/${key}` : '');

export function registerPublic(r) {
  // 사이트 공통 정보: 연락처, 배너, 예약 장소, 보험
  r.get('/api/site', async ({ env }) => {
    const s = await getSettings(env.DB);
    const [banners, locations, insurance] = await Promise.all([
      env.DB.prepare('SELECT id, image_key, text, sub_text, link FROM banners WHERE visible = 1 ORDER BY sort, id').all(),
      env.DB.prepare('SELECT id, name, type, hours, fee, can_pickup, can_return FROM locations WHERE active = 1 ORDER BY sort, id').all(),
      env.DB.prepare('SELECT id, name, per_day FROM insurance_options WHERE active = 1 ORDER BY sort, id').all(),
    ]);
    return json({
      phone: s.site_phone,
      messenger: s.site_messenger,
      address: s.company_address,
      bizNo: s.company_biz_no,
      ceo: s.company_ceo,
      driverNote: s.short_min_age_note,
      banners: banners.results.map((b) => ({ ...b, image: img(b.image_key) })),
      locations: locations.results,
      insurance: insurance.results,
    });
  });

  // 단기: 기간에 맞는 예약 가능 차종 검색
  r.get('/api/short/search', async ({ env, url }) => {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const locationId = int(url.searchParams.get('location'));
    if (!isLocalDateTime(from) || !isLocalDateTime(to)) throw bad('대여·반납 일시를 확인해 주세요.');
    const days = rentalDays(from, to);
    if (!days) throw bad('반납 일시는 대여 일시보다 뒤여야 합니다.');
    const avail = await availableByModel(env, { from, to, locationId });
    const { results } = await env.DB.prepare('SELECT * FROM short_models WHERE active = 1 ORDER BY sort, id').all();
    const models = [];
    const soldOut = [];
    for (const m of results) {
      const n = avail.get(m.id) || 0;
      if (n > 0) {
        models.push({
          id: m.id, maker: m.maker, name: m.name, class: m.class, fuel: m.fuel, seats: m.seats,
          features: m.features, dayRate: m.day_rate, rent: m.day_rate * days, left: n, image: img(m.image_key),
        });
      } else soldOut.push(m.name);
    }
    return json({ days, models, soldOut });
  });

  // 단기: 예약 신청
  r.post('/api/short/reservations', async ({ env, request, ctx }) => {
    const b = await readJson(request);
    if (b.website) return json({ ok: true }); // 스팸 방지용 숨김 칸
    const name = cleanText(b.name, 30);
    const phone = cleanPhone(b.phone);
    if (!name) throw bad('이름을 입력해 주세요.');
    if (!phone) throw bad('휴대폰 번호를 확인해 주세요.');
    if (!b.agree) throw bad('필수 동의 항목에 체크해 주세요.');
    const from = b.pickupAt, to = b.returnAt;
    if (!isLocalDateTime(from) || !isLocalDateTime(to)) throw bad('대여·반납 일시를 확인해 주세요.');
    const days = rentalDays(from, to);
    if (!days) throw bad('반납 일시는 대여 일시보다 뒤여야 합니다.');

    const loc = await env.DB.prepare('SELECT * FROM locations WHERE id = ? AND active = 1').bind(int(b.locationId)).first();
    if (!loc) throw bad('대여 장소를 다시 선택해 주세요.');
    const model = await env.DB.prepare('SELECT * FROM short_models WHERE id = ? AND active = 1').bind(int(b.modelId)).first();
    if (!model) throw bad('차량을 다시 선택해 주세요.');
    const avail = await availableByModel(env, { from, to, locationId: loc.id });
    if (!(avail.get(model.id) > 0)) throw new HttpError(409, '방금 선택하신 차량이 마감되었습니다. 다른 차량을 선택해 주세요.');

    const ins = b.insuranceId
      ? await env.DB.prepare('SELECT * FROM insurance_options WHERE id = ? AND active = 1').bind(int(b.insuranceId)).first()
      : null;
    const options = Array.isArray(b.options) ? b.options.map((o) => cleanText(o, 30)).filter(Boolean).slice(0, 10) : [];
    const rent = model.day_rate * days;
    const insAmt = ins ? ins.per_day * days : 0;
    const total = rent + insAmt + (loc.fee || 0);

    const customerId = await upsertCustomer(env.DB, { name, phone, source: '홈페이지 단기 예약' });
    const no = await nextNo(env.DB, 'reservations', 'S');
    const row = {
      no, location_id: loc.id, location_name: loc.name, location_fee: loc.fee || 0, pickup_at: from, return_at: to, days,
      model_id: model.id, model_name: model.name, day_rate: model.day_rate, rent_amt: rent,
      insurance_name: ins ? ins.name : '', insurance_amt: insAmt, options: JSON.stringify(options), total_amt: total,
      customer_id: customerId, name, phone, birth: cleanText(b.birth, 20), license: cleanText(b.license, 20),
      flight: cleanText(b.flight, 30), request: cleanText(b.request, 500),
    };
    const cols = Object.keys(row);
    await env.DB.prepare(`INSERT INTO reservations (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...cols.map((c) => row[c])).run();

    const html = buildMailHtml({
      title: `[단기예약] ${no}`,
      intro: '홈페이지로 새 단기렌트 예약 신청이 접수되었습니다. 배차를 확인한 뒤 고객에게 확정 안내해 주세요.',
      rows: [
        ['신청번호', no], ['고객', `${name} · ${phone}`], ['생년월일', row.birth], ['면허', row.license],
        ['차종', model.name], ['장소', loc.name], ['기간', `${from.replace('T', ' ')} ~ ${to.replace('T', ' ')} (${days}일)`],
        ['보험', row.insurance_name], ['옵션', options.join(', ')], ['예상 요금', won(total)],
        ['항공편', row.flight], ['요청 사항', row.request],
      ],
      linkUrl: `${env.SITE_URL}/admin/#reservations`, linkText: '관리자에서 배차 확정하기',
    });
    ctx.waitUntil(
      Promise.all([
        notifyAdmins(env, { kind: '단기 예약', refNo: no, subject: `[단기예약] ${no} · ${model.name} · ${from.replace('T', ' ')} ${loc.name}`, html }),
        pushHold(env, row, model),
      ])
    );
    return json({ ok: true, no, total, days, model: model.name, location: loc.name, pickupAt: from, returnAt: to });
  });

  // 중장기: 노출 중인 차량 목록
  r.get('/api/long', async ({ env }) => {
    const { results: vs } = await env.DB
      .prepare(`SELECT * FROM long_vehicles WHERE visible = 1 AND status <> 'contracted' ORDER BY sort, id DESC`)
      .all();
    if (!vs.length) return json({ vehicles: [] });
    const ids = vs.map((v) => v.id);
    const q = ids.map(() => '?').join(',');
    const [prices, photos] = await Promise.all([
      env.DB.prepare(`SELECT * FROM long_prices WHERE vehicle_id IN (${q})`).bind(...ids).all(),
      env.DB.prepare(`SELECT vehicle_id, image_key FROM long_photos WHERE vehicle_id IN (${q}) ORDER BY sort, id`).bind(...ids).all(),
    ]);
    const firstPhoto = new Map();
    for (const p of photos.results) if (!firstPhoto.has(p.vehicle_id)) firstPhoto.set(p.vehicle_id, p.image_key);
    return json({
      vehicles: vs.map((v) => ({
        id: v.id, name: v.name, class: v.class, year: v.year, km: v.km, fuel: v.fuel, badge: v.badge, carValue: v.car_value,
        status: v.status, photo: img(firstPhoto.get(v.id)),
        prices: prices.results.filter((p) => p.vehicle_id === v.id).map((p) => ({ term: p.term, dep: p.dep_pct, monthly: p.monthly })),
      })),
    });
  });

  // 중장기: 차량 상세
  r.get('/api/long/:id', async ({ env, params }) => {
    const v = await env.DB.prepare(`SELECT * FROM long_vehicles WHERE id = ? AND visible = 1`).bind(int(params.id)).first();
    if (!v) throw new HttpError(404, '차량을 찾을 수 없습니다.');
    const [prices, photos] = await Promise.all([
      env.DB.prepare('SELECT term, dep_pct AS dep, monthly FROM long_prices WHERE vehicle_id = ? ORDER BY term, dep_pct').bind(v.id).all(),
      env.DB.prepare('SELECT image_key FROM long_photos WHERE vehicle_id = ? ORDER BY sort, id').bind(v.id).all(),
    ]);
    const { plate, erp_ref, ...pub } = v;
    return json({ vehicle: { ...pub, photos: photos.results.map((p) => img(p.image_key)) }, prices: prices.results });
  });

  // 중장기 신청 · 법인 견적
  r.post('/api/long/applications', async ({ env, request, ctx }) => {
    const b = await readJson(request);
    if (b.website) return json({ ok: true });
    const name = cleanText(b.name, 30);
    const phone = cleanPhone(b.phone);
    const corp = b.applicantType === 'corp';
    if (!name) throw bad(corp ? '담당자 이름을 입력해 주세요.' : '이름을 입력해 주세요.');
    if (!phone) throw bad('휴대폰 번호를 확인해 주세요.');
    if (!b.agree) throw bad('필수 동의 항목에 체크해 주세요.');
    const company = cleanText(b.company, 60);
    if (corp && !company) throw bad('법인명을 입력해 주세요.');

    let vehicle = null, price = null;
    if (b.vehicleId) {
      vehicle = await env.DB.prepare('SELECT * FROM long_vehicles WHERE id = ? AND visible = 1').bind(int(b.vehicleId)).first();
      if (!vehicle) throw bad('차량 정보를 다시 확인해 주세요.');
      price = await env.DB
        .prepare('SELECT * FROM long_prices WHERE vehicle_id = ? AND term = ? AND dep_pct = ?')
        .bind(vehicle.id, int(b.term), int(b.dep))
        .first();
      if (!price) throw bad('선택하신 기간·보증금 조건이 없습니다. 다시 선택해 주세요.');
    }
    const kmExtra = Math.max(0, int(b.km, 2) - 2) * 30000; // 약정거리 추가금 (화면 안내와 동일)
    const monthly = price ? price.monthly + kmExtra : 0;
    const depositAmt = vehicle && price ? Math.round((vehicle.car_value * price.dep_pct) / 100) : 0;
    const kind = corp ? '법인 견적' : '중장기 신청';

    const customerId = await upsertCustomer(env.DB, {
      name: corp ? company : name, phone, kind: corp ? '법인' : '개인', company, biz_no: cleanText(b.bizNo, 20),
      source: corp ? '홈페이지 법인 견적' : '홈페이지 중장기 신청',
    });
    const no = await nextNo(env.DB, 'applications', 'L');
    const row = {
      no, applicant_type: corp ? 'corp' : 'person', vehicle_id: vehicle ? vehicle.id : null, vehicle_name: vehicle ? vehicle.name : cleanText(b.vehicleWish, 100),
      term: price ? price.term : null, dep_pct: price ? price.dep_pct : null, deposit_amt: depositAmt, monthly, km: price ? `연 ${int(b.km, 2)}만km` : '',
      company, biz_no: cleanText(b.bizNo, 20), qty: cleanText(b.qty, 20), name, phone, wish_date: cleanText(b.wishDate, 20),
      request: cleanText(b.request, 1000), customer_id: customerId,
    };
    const cols = Object.keys(row);
    await env.DB.prepare(`INSERT INTO applications (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...cols.map((c) => row[c])).run();
    if (vehicle && vehicle.status === 'available') {
      await env.DB.prepare(`UPDATE long_vehicles SET status = 'reserved', updated_at = datetime('now') WHERE id = ?`).bind(vehicle.id).run();
    }

    const cond = price ? `${price.term}개월 · 보증금 ${price.dep_pct ? price.dep_pct + '%' : '무보증'} · ${row.km}` : '';
    const html = buildMailHtml({
      title: `[${kind}] ${no}`,
      intro: corp ? '홈페이지로 법인 장기렌트 견적 요청이 접수되었습니다.' : '홈페이지로 중장기렌트 신청이 접수되었습니다. 심사 후 고객에게 연락해 주세요.',
      rows: [
        ['신청번호', no], ['구분', corp ? '법인' : '개인 · 개인사업자'], ['법인명', company], ['사업자번호', row.biz_no], ['필요 대수', row.qty],
        [corp ? '담당자' : '고객', `${name} · ${phone}`], ['차량', row.vehicle_name], ['조건', cond],
        ['보증금', price ? won(depositAmt) : ''], ['월 렌트료', price ? won(monthly) : ''], ['희망 출고일', row.wish_date], ['요청 사항', row.request],
      ],
      linkUrl: `${env.SITE_URL}/admin/#applications`, linkText: '관리자에서 확인하기',
    });
    ctx.waitUntil(notifyAdmins(env, { kind, refNo: no, subject: `[${kind}] ${no} · ${corp ? company : name}${row.vehicle_name ? ' · ' + row.vehicle_name : ''}`, html }));
    return json({ ok: true, no, monthly, depositAmt, vehicle: row.vehicle_name, cond });
  });

  // 게시판 (공지 · 이벤트 · FAQ)
  r.get('/api/posts', async ({ env, url }) => {
    const board = url.searchParams.get('board') || 'notice';
    if (!['notice', 'event', 'faq'].includes(board)) throw bad('게시판을 확인해 주세요.');
    const order = board === 'faq' ? 'sort, id' : 'pinned DESC, id DESC';
    const { results } = await env.DB
      .prepare(`SELECT id, board, title, ${board === 'faq' ? 'body,' : ''} pinned, created_at FROM posts WHERE board = ? AND visible = 1 ORDER BY ${order} LIMIT 100`)
      .bind(board)
      .all();
    return json({ posts: results });
  });
  r.get('/api/posts/:id', async ({ env, params }) => {
    const p = await env.DB.prepare('SELECT * FROM posts WHERE id = ? AND visible = 1').bind(int(params.id)).first();
    if (!p) throw new HttpError(404, '게시글을 찾을 수 없습니다.');
    return json({ post: { ...p, attachments: JSON.parse(p.attachments || '[]').map(img) } });
  });

  // 1:1 문의 목록 (이름 가림)
  r.get('/api/inquiries', async ({ env, url }) => {
    const page = Math.max(1, int(url.searchParams.get('page'), 1));
    const { results } = await env.DB
      .prepare('SELECT id, no, type, name, title, is_secret, status, created_at FROM inquiries ORDER BY id DESC LIMIT 20 OFFSET ?')
      .bind((page - 1) * 20)
      .all();
    const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM inquiries').first();
    return json({
      total: total.n,
      inquiries: results.map((q) => ({ ...q, name: maskName(q.name) })),
    });
  });

  // 1:1 문의 등록 (사진 첨부 최대 5장)
  r.post('/api/inquiries', async ({ env, request, ctx }) => {
    const form = await request.formData().catch(() => null);
    if (!form) throw bad('요청 형식이 올바르지 않습니다.');
    if (form.get('website')) return json({ ok: true });
    const name = cleanText(form.get('name'), 30);
    const phone = cleanPhone(form.get('phone'));
    const title = cleanText(form.get('title'), 100);
    const body = cleanText(form.get('body'), 3000);
    const pw = String(form.get('password') || '');
    if (!name) throw bad('이름을 입력해 주세요.');
    if (!phone) throw bad('휴대폰 번호를 확인해 주세요.');
    if (!title || !body) throw bad('제목과 내용을 입력해 주세요.');
    if (!/^\d{4,8}$/.test(pw)) throw bad('비밀번호는 숫자 4~8자리로 입력해 주세요.');
    if (form.get('agree') !== 'true') throw bad('필수 동의 항목에 체크해 주세요.');

    const files = form.getAll('files').filter((f) => f && typeof f === 'object' && f.size > 0).slice(0, 5);
    const keys = [];
    for (const f of files) keys.push(await saveUpload(env, f, 'inquiry', 5 * 1024 * 1024));

    const { hash, salt } = await hashPassword(pw);
    const customerId = await upsertCustomer(env.DB, { name, phone, source: '홈페이지 1:1 문의' });
    const no = await nextNo(env.DB, 'inquiries', 'Q');
    const type = cleanText(form.get('type'), 30) || '기타';
    await env.DB
      .prepare('INSERT INTO inquiries (no, type, name, phone, title, body, is_secret, pw_hash, attachments, customer_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(no, type, name, phone, title, body, 1, `${salt}:${hash}`, JSON.stringify(keys), customerId)
      .run();
    const html = buildMailHtml({
      title: `[1:1 문의] ${no}`,
      intro: '홈페이지 고객센터에 새 문의가 등록되었습니다.',
      rows: [['신청번호', no], ['유형', type], ['고객', `${name} · ${phone}`], ['제목', title], ['내용', body], ['첨부 사진', keys.length ? `${keys.length}장` : '']],
      linkUrl: `${env.SITE_URL}/admin/#inquiries`, linkText: '관리자에서 답변하기',
    });
    ctx.waitUntil(notifyAdmins(env, { kind: '1:1 문의', refNo: no, subject: `[1:1 문의] ${type} · ${title}`, html }));
    return json({ ok: true, no });
  });

  // 비밀글 열람 (작성 시 비밀번호)
  r.post('/api/inquiries/:id/view', async ({ env, params, request }) => {
    const b = await readJson(request);
    const q = await env.DB.prepare('SELECT * FROM inquiries WHERE id = ?').bind(int(params.id)).first();
    if (!q) throw new HttpError(404, '문의를 찾을 수 없습니다.');
    const [salt, hash] = (q.pw_hash || ':').split(':');
    if (!(await verifyPassword(String(b.password || ''), hash, salt))) throw new HttpError(403, '비밀번호가 맞지 않습니다.');
    return json({
      inquiry: {
        no: q.no, type: q.type, title: q.title, body: q.body, status: q.status, answer: q.answer, answered_at: q.answered_at,
        created_at: q.created_at, attachments: JSON.parse(q.attachments || '[]').map(img),
      },
    });
  });
}
