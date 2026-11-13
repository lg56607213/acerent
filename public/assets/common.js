// 모든 고객 화면에서 쓰는 공통 기능
export async function api(path, opts = {}) {
  const init = { ...opts, headers: { ...(opts.headers || {}) } };
  if (opts.body && !(opts.body instanceof FormData)) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, init);
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
  return data;
}

// 차종 이미지가 아직 없을 때 쓰는 기본 그림 (차급별)
export function classImage(cls) {
  const c = String(cls || '');
  if (/경/.test(c)) return '/assets/cars/compact.svg';
  if (/SUV|RV/i.test(c)) return '/assets/cars/suv.svg';
  if (/승합|밴/.test(c)) return '/assets/cars/van.svg';
  if (/화물|트럭/.test(c)) return '/assets/cars/truck.svg';
  return '/assets/cars/sedan.svg';
}

export const won = (n) => Number(n || 0).toLocaleString('ko-KR');
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const nl = (s) => String(s ?? '').replace(/\\n/g, '\n');

// 'YYYY-MM-DDTHH:MM' → '11/14 10:00'
export function shortDt(v) {
  if (!v) return '';
  const [d, t] = v.split('T');
  const [, m, day] = d.split('-');
  return `${+m}/${+day} ${t}`;
}

// 기본 대여 일시: 내일 10시 ~ 3일 뒤 10시
export function defaultPeriod() {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const d1 = new Date(k.getTime() + 86400000);
  const d2 = new Date(k.getTime() + 4 * 86400000);
  const f = (d) => d.toISOString().slice(0, 10) + 'T10:00';
  return [f(d1), f(d2)];
}

let siteCache;
export async function site() {
  if (!siteCache) siteCache = api('/api/site');
  return siteCache;
}

// 머리·꼬리 공통 처리: 모바일 메뉴, 전화번호·주소 채우기
export async function initLayout() {
  const btn = $('.menu-btn');
  if (btn) btn.addEventListener('click', () => {
    const g = $('.gnb');
    g.classList.toggle('open');
    btn.setAttribute('aria-expanded', g.classList.contains('open'));
  });
  try {
    const s = await site();
    $$('[data-site="phone"]').forEach((el) => (el.textContent = s.phone));
    $$('[data-site="tel"]').forEach((el) => el.setAttribute('href', 'tel:' + String(s.phone).replace(/\D/g, '')));
    $$('[data-site="messenger"]').forEach((el) => (el.textContent = s.messenger));
    $$('[data-site="address"]').forEach((el) => (el.textContent = s.address));
    $$('[data-site="biz"]').forEach((el) => (el.textContent = s.bizNo || '393-81-01841'));
    $$('[data-site="ceo"]').forEach((el) => (el.textContent = s.ceo || '백은영'));
    return s;
  } catch {
    return null;
  }
}

export function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.textContent;
    btn.textContent = label || '처리 중…';
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.label || btn.textContent;
    btn.disabled = false;
  }
}

// ── 입력 칸 자동 형식: 휴대폰 010-0000-0000 (숫자 11자리까지), 생년월일 1990-01-01 (숫자 8자리까지) ──
export function fmtPhone(v) {
  const d = String(v).replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
}
export function fmtBirth(v) {
  const d = String(v).replace(/\D/g, '').slice(0, 8);
  if (d.length < 5) return d;
  if (d.length < 7) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}
// 생년월일이 실제 있는 날짜인지 (1900년 이후 ~ 오늘)
export function validBirth(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  if (!m) return false;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] && +m[1] >= 1900 && d <= new Date();
}
if (typeof document !== 'undefined' && !window.__aceMask) {
  window.__aceMask = true;
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement)) return;
    const kind = el.dataset.mask || (el.type === 'tel' ? 'phone' : '');
    if (!kind) return;
    const f = kind === 'birth' ? fmtBirth : kind === 'phone' ? fmtPhone : null;
    if (!f) return;
    const v = f(el.value);
    if (v !== el.value) el.value = v;
  });
}
