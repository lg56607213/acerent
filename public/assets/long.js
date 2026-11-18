import { api, $, $$, esc, won, initLayout, setBusy, classImage } from './common.js';
import { quote } from './longcalc.js';

initLayout();

// 메뉴 '법인렌트'(/long.html#corp): 장기렌트와 같은 페이지라 눌러도 반응이 없어 보였음
//   → 메뉴 표시를 법인렌트로 바꾸고, 구분을 '법인'으로 골라 둔 채 견적 양식으로 이동 · 법인명 칸에 커서
//   (이미 #corp 인 상태에서 다시 눌러도 hashchange 가 안 일어나므로 클릭을 직접 처리)
function showCorp(scroll) {
  const corpLink = $('.gnb a[href="/long.html#corp"]');
  const longLink = $('.gnb a[href="/long.html"]');
  if (corpLink && longLink) {
    longLink.classList.remove('on'); longLink.removeAttribute('aria-current');
    corpLink.classList.add('on'); corpLink.setAttribute('aria-current', 'page');
  }
  const f = $('#corpForm');
  f.bizType.value = '법인';
  if (scroll) $('#corp').scrollIntoView({ behavior: 'smooth', block: 'start' });
  f.company.focus({ preventScroll: true });
  $('.gnb')?.classList.remove('open'); // 모바일 메뉴 닫기
}
$$('a[href="/long.html#corp"]').forEach((a) =>
  a.addEventListener('click', (e) => {
    e.preventDefault();
    if (location.hash !== '#corp') history.replaceState(null, '', '#corp');
    showCorp(true);
  })
);
if (location.hash === '#corp') showCorp(false);

// ── 즉시출고 차량 목록 ──
const st = { sort: 'low', list: [] };
$('#sort').addEventListener('change', (e) => { st.sort = e.target.value; draw(); });
function priceOf(v) {
  // 관리자가 고른 대표 이용금액 줄 (없으면 예전 자동계산)
  if (v.mainPlan && v.mainPlan.monthly) return { term: v.mainPlan.term, monthly: v.mainPlan.monthly, deposit: v.mainPlan.deposit, km: v.mainPlan.km_year };
  if (!v.bases || !v.bases.length) return null;
  const term = Math.max(...v.bases.map((b) => b.term));
  return { term, monthly: quote(v, v.pricing, v.bases, { term }).monthly };
}
const ST = (v) => (v.status === 'reserved' ? '계약 진행 중' : v.status === 'soon' ? '출고 예정' + (v.avail_note ? ' · ' + v.avail_note : '') : v.badge);
function draw() {
  const list = st.list.map((v) => ({ ...v, p: priceOf(v) }));
  if (st.sort === 'low') list.sort((a, b) => (a.p ? a.p.monthly : 9e9) - (b.p ? b.p.monthly : 9e9));
  if (st.sort === 'new') list.sort((a, b) => (b.year || 0) - (a.year || 0));
  if (st.sort === 'km') list.sort((a, b) => a.km - b.km);
  $('#count').textContent = list.length;
  $('#grid').innerHTML = list.length
    ? list.map((v) => `<a class="car-card" href="/car.html?id=${v.id}">
<div class="photo">${v.photo ? `<img src="${esc(v.photo)}" alt="${esc(v.name)} 실차 사진" loading="lazy">` : `<img src="${classImage(v.class)}" alt="" style="object-fit:contain">`}</div>
<div style="display:flex;flex-direction:column;gap:4px">
<span class="badge">${esc(ST(v))}</span>
<strong class="name">${esc(v.name)}</strong>
<span class="meta">${v.year ? v.year + '년식 | ' : ''}${won(v.km)}km | ${esc(v.fuel)}</span></div>
<dl>${v.p && v.p.deposit !== undefined ? `<dt>보증금</dt><dd>${v.p.deposit ? won(Math.round(v.p.deposit / 10000)) + '만원' : '없음'}${v.p.km ? ` · 연 ${v.p.km / 10000}만km` : ''}</dd>` : `<dt>현재 차량가격</dt><dd>${v.car_value ? won(v.car_value) + '원' : '-'}</dd>`}
<dt>월 렌트료${v.p ? ` (${v.p.term}개월)` : ''}</dt><dd>${v.p ? `<strong class="price">${won(v.p.monthly)}</strong>원~` : '<span class="muted">상담</span>'}</dd></dl></a>`).join('')
    : '<p class="empty" style="grid-column:1/-1">지금 즉시출고 가능한 차량을 준비 중입니다. 1644-8891로 문의하시거나 아래 견적 신청을 남겨주세요.</p>';
}
api('/api/long').then((d) => { st.list = d.vehicles; draw(); }).catch((e) => ($('#grid').innerHTML = `<p class="empty" style="grid-column:1/-1">${esc(e.message)}</p>`));

// 법인 · 개인사업자 장기렌트 견적
$('#corpForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, msg = $('#corpMsg');
  msg.textContent = '';
  if (!f.company.value.trim() || !f.name.value.trim()) return (msg.textContent = '법인명(상호)과 담당자 이름을 입력해 주세요.');
  if (f.phone.value.replace(/\D/g, '').length < 9) return (msg.textContent = '연락처를 확인해 주세요.');
  if (!f.agree.checked) return (msg.textContent = '개인정보 수집·이용에 동의해 주세요.');
  const btn = f.querySelector('button[type=submit]');
  setBusy(btn, true, '접수 중…');
  try {
    const request = `[${f.bizType.value}] ${f.request.value}`.trim();
    const r = await api('/api/long/applications', {
      method: 'POST',
      body: { applicantType: 'corp', company: f.company.value, bizNo: f.bizNo.value, name: f.name.value, phone: f.phone.value, vehicleWish: f.vehicleWish.value, qty: f.qty.value, request, website: f.website.value, agree: true, marketing: f.marketing.checked },
    });
    f.reset();
    msg.style.color = 'var(--ink)';
    msg.textContent = `견적 요청이 접수되었습니다 (신청번호 ${r.no}). 담당자가 곧 연락드립니다.`;
  } catch (err) {
    msg.style.color = '';
    msg.textContent = err.message;
  } finally {
    setBusy(btn, false);
  }
});
