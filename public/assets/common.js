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
    $$('[data-site="biz"]').forEach((el) => (el.textContent = s.bizNo || '[사업자번호]'));
    $$('[data-site="ceo"]').forEach((el) => (el.textContent = s.ceo || '[대표자명]'));
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
