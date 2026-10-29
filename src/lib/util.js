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
