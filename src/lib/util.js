// 공통 도우미: 응답, 오류, 한국시간, 번호 발급, 입력 정리

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function bad(message) {
  return new HttpError(400, message);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw bad('요청 형식이 올바르지 않습니다.');
  }
}

// 한국시간 기준 'YYYY-MM-DD HH:MM:SS'
export function nowKst() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export function todayKstCompact() {
  return nowKst().slice(0, 10).replace(/-/g, '');
}

// 'YYYY-MM-DDTHH:MM' 형식 검사
export function isLocalDateTime(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v);
}

// 대여 기간 (예스렌터카와 같은 방식)
//   일수 = 반납일 - 대여일 (날짜 기준, 같은 날 반납은 1일)
//   초과 시간 = 반납 시각 - 대여 시각 (시 단위 내림, 0~10시간). 대여 시각보다 일찍 반납하면 0
//   예) 12/1 10:00 ~ 12/2 13:30 → 1일 3시간 / 12/1 10:00 ~ 12/3 08:00 → 2일
export function rentalPeriod(pickupAt, returnAt) {
  const a = Date.parse(pickupAt + ':00+09:00');
  const b = Date.parse(returnAt + ':00+09:00');
  if (!isFinite(a) || !isFinite(b) || b <= a) return null;
  const dateDiff = Math.round((Date.parse(returnAt.slice(0, 10)) - Date.parse(pickupAt.slice(0, 10))) / 86400000);
  if (dateDiff <= 0) return { days: 1, hours: 0 };
  const hhmm = (v) => +v.slice(11, 13) * 100 + +v.slice(14, 16);
  const hours = Math.min(10, Math.max(0, Math.floor((hhmm(returnAt) - hhmm(pickupAt)) / 100)));
  return { days: dateDiff, hours };
}

// 예전 이름 호환: 요금 일수
export function rentalDays(pickupAt, returnAt) {
  const p = rentalPeriod(pickupAt, returnAt);
  return p ? p.days : 0;
}

const ceil1000 = (n) => Math.ceil(n / 1000) * 1000;

// 기간에 토·일요일이 하루라도 있는지 (대여일 ~ 반납일, 날짜 기준)
export function hasWeekend(pickupAt, returnAt) {
  const a = Date.parse(pickupAt.slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(returnAt.slice(0, 10) + 'T00:00:00Z');
  for (let t = a, i = 0; t <= b && i < 8; t += 86400000, i++) {
    const d = new Date(t).getUTCDay();
    if (d === 0 || d === 6) return true;
  }
  return false;
}

// 성수기 할증률(%): 기간(날짜 기준)과 겹치는 성수기 중 가장 높은 할증률. peaks = [{ name, start_date, end_date, rate }]
export function peakRate(pickupAt, returnAt, peaks) {
  const s = pickupAt.slice(0, 10), e = returnAt.slice(0, 10);
  let best = null;
  for (const p of peaks || []) {
    if (!p.rate || !p.start_date || !p.end_date) continue;
    if (s <= p.end_date && e >= p.start_date && (!best || p.rate > best.rate)) best = p;
  }
  return best;
}

// 단기 대여료 전체 (예스렌터카 예약 화면과 같은 계산 순서)
//   1) 일수 대여료 (요금표 또는 4구간)  2) 성수기 할증 (% · 천원 올림)  3) 주말 추가 (차종별 정액, 기간에 토·일이 있으면 1건당 한 번)
//   4) 초과 시간: (1~3 합계 ÷ 일수) × 시간 × 10% (천원 올림, 최대 10시간)
//   배회차비(장소) · 보험은 여기에 포함하지 않음 (rent). hiddenFee 를 주면 고객 화면용 shownRent · shownLabel 에 배회차비를 일수 대여료에 합쳐서 보여줌
// 자차보험 이름의 한도를 차종별 한도로 바꿔 표시 (예: '자차보험 포함 (자차한도 400만원)' → 카니발 700만원)
export function insNameFor(name, limitManwon) {
  const n = String(name || '');
  return limitManwon > 0 ? n.replace(/자차한도\s*[\d,]+\s*만원/, `자차한도 ${limitManwon}만원`) : n;
}

// 확정 가격 상품: 주단위렌트 = 7일, 월렌트 = 30일 (차종별 week_price · month_price, 0 이면 일반 요금)
export const WEEK_DAYS = 7;
export const MONTH_DAYS = 30;
export function fixedPlan(model, days) {
  if (days === WEEK_DAYS && model.week_price > 0) return { name: '주단위렌트', price: model.week_price, km: model.week_km || 0 };
  if (days === MONTH_DAYS && model.month_price > 0) return { name: '월렌트', price: model.month_price, km: model.month_km || 0 };
  return null;
}

// 단기 주행 가능 거리 (km): 1일 = day_km(300) · 2일 500 · 3일 700 · 4일 850 · 5일 1,000 · 6일 1,100 (day_km 300 기준 비율)
//   7일 = 주단위 제한(week_km) · 8~29일 = 주단위 → 월렌트 제한(month_km) 사이를 일수에 비례 · 30일 = month_km
//   30일 넘으면 month_km ÷ 30 × 일수. 10km 단위 반올림
const SHORT_KM_STEPS = [300, 500, 700, 850, 1000, 1100];
export function shortKm(model, days) {
  const base = model.day_km || 0;
  if (!base || days < 1) return 0;
  const r10 = (n) => Math.round(n / 10) * 10;
  const wk = model.week_km || 0, mo = model.month_km || 0;
  if (days <= 6) return r10((SHORT_KM_STEPS[days - 1] * base) / 300);
  if (!wk) return r10((SHORT_KM_STEPS[5] * base) / 300 + ((days - 6) * base) / 3);
  if (days === 7) return wk;
  if (mo && days < 30) return r10(wk + ((mo - wk) * (days - 7)) / 23);
  if (mo) return r10((mo * days) / 30);
  return r10(wk + ((wk / 7) * (days - 7)) / 2);
}

export function shortQuote(model, pickupAt, returnAt, peaks, hiddenFee = 0) {
  const period = rentalPeriod(pickupAt, returnAt);
  if (!period) return null;
  const { days, hours } = period;
  // 주단위렌트(7일) · 월렌트(30일): 차종별 확정 가격 그대로 — 성수기 할증 · 주말 추가 · 배회차비 없음
  const plan = fixedPlan(model, days);
  const fixed = !!plan;
  if (fixed) hiddenFee = 0;
  const base = fixed ? { rent: plan.price } : shortRent(model, days);
  const peak = fixed ? null : peakRate(pickupAt, returnAt, peaks);
  const afterPeak = peak ? ceil1000((base.rent * (100 + peak.rate)) / 100) : base.rent;
  const weekend = !fixed && model.weekend_fee && hasWeekend(pickupAt, returnAt) ? model.weekend_fee : 0;
  const sub = afterPeak + weekend;
  const overtime = hours ? ceil1000(((sub / days) * hours) / 10) : 0;
  const rent = sub + overtime;
  const extras = [];
  if (peak) extras.push(`${peak.name || '성수기'} +${peak.rate}%`);
  if (weekend) extras.push(`주말 +${won(weekend)}`);
  if (overtime) extras.push(`${hours}시간 +${won(overtime)}`);
  // 주단위 · 월렌트 주행거리 제한: 상품별 제한 km · 초과 1km당 요금(차종별, 주 · 월 같음) (예약 내역 · 알림 메일에 기록)
  //   단기(그 외 기간): 기간별 주행 가능 거리 (shortKm) — 1일 → 주단위(7일) → 월렌트(30일)로 이어짐
  const kmLimit = fixed ? plan.km : shortKm(model, days);
  const overKmFee = kmLimit ? model.over_km_fee || 0 : 0;
  const kmText = kmLimit ? `${kmLimit.toLocaleString('ko-KR')}km${overKmFee ? ` (초과 1km당 ${won(overKmFee)})` : ''}` : '';
  if (kmText) extras.push(`주행 가능 ${kmText}`);
  const parts = [fixed ? `${plan.name} ${won(base.rent)}` : `${days}일 ${won(base.rent)}`, ...extras];
  const shownParts = [fixed ? `${plan.name} ${won(base.rent)}` : `${days}일 ${won(base.rent + hiddenFee)}`, ...extras];
  return {
    days, hours, base: base.rent, peakName: peak ? peak.name : '', peakRate: peak ? peak.rate : 0, peakAmt: afterPeak - base.rent,
    weekend, overtime, rent, dayRate: Math.round(rent / days), label: parts.join(' · '),
    shownRent: rent + hiddenFee, shownLabel: shownParts.join(' · '), fixed, planName: fixed ? plan.name : '단기렌트', kmLimit, overKmFee, kmText,
  };
}

// '3일' / '1일 3시간'
export function periodText(days, hours) {
  return `${days}일${hours ? ` ${hours}시간` : ''}`;
}

// 신청번호: 접두어-YYYYMMDD-0001 (그날 순번)
export async function nextNo(db, table, prefix) {
  const day = todayKstCompact();
  const like = `${prefix}-${day}-%`;
  const row = await db.prepare(`SELECT no FROM ${table} WHERE no LIKE ? ORDER BY no DESC LIMIT 1`).bind(like).first();
  const seq = row ? parseInt(row.no.split('-')[2], 10) + 1 : 1;
  return `${prefix}-${day}-${String(seq).padStart(4, '0')}`;
}

// 대여 일수 구간별 1일 요금 (1~2일 / 3~4일 / 5~6일 / 7일 이상). 0 인 구간은 앞 구간 요금 사용
export function dayRateFor(model, days) {
  const r12 = model.day_rate || 0;
  const r34 = model.rate_3_4 || r12;
  const r56 = model.rate_5_6 || r34;
  const r7 = model.rate_7 || r56;
  if (days >= 7) return r7;
  if (days >= 5) return r56;
  if (days >= 3) return r34;
  return r12;
}

// 일수별 요금표 (rate_table): '1일 총액,2일 총액,…,30일 총액' 쉼표 구분 문자열 → 숫자 배열. 비어 있으면 []
export function parseRateTable(v) {
  return String(v || '')
    .split(/[\s,]+/)
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 60);
}

// 관리자 입력값 정리: 숫자만 남겨서 쉼표 구분 문자열로 저장
export function cleanRateTable(v) {
  return parseRateTable(Array.isArray(v) ? v.join(',') : v).join(',');
}

// 단기 대여료
//   요금표(rate_table)가 있으면: 대여 일수 칸의 총액 그대로. 표보다 길면 마지막 칸 총액 + (마지막 칸 1일 평균 × 넘는 일수)
//   요금표가 없으면: 1~6일은 해당 구간 1일 요금 × 일수, 7일 이상은 (5~6일 요금 × 6일) + (7일 이상 요금 × 7일째부터 일수)
//   예) 5~6일 50,000 · 7일~ 30,000 → 10일 = 6 × 50,000 + 4 × 30,000
export function shortRent(model, days) {
  const table = parseRateTable(model.rate_table);
  if (table.length) {
    const n = table.length;
    let rent;
    if (days <= n) rent = table[days - 1];
    else rent = table[n - 1] + Math.round(table[n - 1] / n / 100) * 100 * (days - n);
    return { rent, dayRate: Math.round(rent / days), label: `${days}일 대여료` };
  }
  const r56 = model.rate_5_6 || model.rate_3_4 || model.day_rate || 0;
  const r7 = model.rate_7 || r56;
  if (days >= 7) {
    const extra = days - 6;
    return { rent: r56 * 6 + r7 * extra, dayRate: r7, label: `1일 ${r56.toLocaleString('ko-KR')}원 × 6일 + ${r7.toLocaleString('ko-KR')}원 × ${extra}일` };
  }
  const rate = dayRateFor(model, days);
  return { rent: rate * days, dayRate: rate, label: `1일 ${rate.toLocaleString('ko-KR')}원 × ${days}일` };
}

export function cleanText(v, max = 200) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

export function cleanPhone(v) {
  const digits = String(v || '').replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 11) return '';
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10 && digits.startsWith('02')) return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
}

export function maskName(name) {
  const s = String(name || '');
  if (s.length <= 1) return s;
  return s[0] + '○'.repeat(Math.min(2, s.length - 1));
}

export function maskPhone(phone) {
  return String(phone || '').replace(/^(\d{2,3})-(\d{3,4})-(\d{4})$/, '$1-****-$3');
}

export function int(v, def = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function won(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

export async function getSettings(db) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  const s = {};
  for (const r of results) s[r.key] = r.value;
  return s;
}

// 연락처 기준으로 고객을 찾고, 없으면 새로 만든다
export async function upsertCustomer(db, { name, phone, kind = '개인', company = '', biz_no = '', source = '' }) {
  const found = await db.prepare('SELECT id FROM customers WHERE phone = ? ORDER BY id LIMIT 1').bind(phone).first();
  if (found) {
    await db
      .prepare(
        `UPDATE customers SET name = CASE WHEN ? <> '' THEN ? ELSE name END,
           company = CASE WHEN ? <> '' THEN ? ELSE company END,
           biz_no = CASE WHEN ? <> '' THEN ? ELSE biz_no END,
           kind = CASE WHEN ? = '법인' THEN '법인' ELSE kind END,
           updated_at = datetime('now') WHERE id = ?`
      )
      .bind(name, name, company, company, biz_no, biz_no, kind, found.id)
      .run();
    return found.id;
  }
  const r = await db
    .prepare('INSERT INTO customers (name, phone, kind, company, biz_no, source) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(name, phone, kind, company, biz_no, source)
    .run();
  return r.meta.last_row_id;
}

export function randomHex(bytes = 16) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 고객 동의 기록: 개인정보(필수) 동의 시각 갱신, 마케팅(선택)은 새로 동의할 때만 켬
// (체크하지 않았다고 기존 동의를 철회로 보지 않음 — 철회는 관리자 고객 화면 또는 수신거부로)
export async function recordConsent(db, customerId, { marketing = false, verified = false } = {}) {
  await db
    .prepare(
      `UPDATE customers SET privacy_agreed_at = datetime('now'),
         marketing_agreed_at = CASE WHEN ? = 1 AND marketing_agree = 0 THEN datetime('now') ELSE marketing_agreed_at END,
         marketing_agree = CASE WHEN ? = 1 THEN 1 ELSE marketing_agree END,
         phone_verified_at = CASE WHEN ? = 1 THEN datetime('now') ELSE phone_verified_at END
       WHERE id = ?`
    )
    .bind(marketing ? 1 : 0, marketing ? 1 : 0, verified ? 1 : 0, customerId)
    .run();
}
