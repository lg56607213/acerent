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

// 대여 일수: 24시간 단위 올림, 최소 1일
export function rentalDays(pickupAt, returnAt) {
  const a = Date.parse(pickupAt + ':00+09:00');
  const b = Date.parse(returnAt + ':00+09:00');
  if (!isFinite(a) || !isFinite(b) || b <= a) return 0;
  return Math.max(1, Math.ceil((b - a) / 86400000));
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
