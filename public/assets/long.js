import { api, $, $$, esc, won, initLayout, setBusy, classImage } from './common.js';
import { quote } from './longcalc.js';

await initLayout();
const st = { sort: 'low', list: [] };
$('#sort').addEventListener('change', (e) => { st.sort = e.target.value; draw(); });

// 가장 긴 계약 기간 · 무보증 · 기본 약정거리 기준 (그 차의 가장 낮은 월 대여료)
function priceOf(v) {
  if (!v.bases.length) return null;
  const term = Math.max(...v.bases.map((b) => b.term));
  return { term, monthly: quote(v, v.pricing, v.bases, { term }).monthly };
}
const ST = (v) => (v.status === 'reserved' ? '상담 진행 중' : v.status === 'soon' ? '출고 예정' + (v.avail_note ? ' · ' + v.avail_note : '') : v.badge);

function draw() {
  const list = st.list.map((v) => ({ ...v, p: priceOf(v) }));
  if (st.sort === 'low') list.sort((a, b) => (a.p ? a.p.monthly : 9e9) - (b.p ? b.p.monthly : 9e9));
  if (st.sort === 'new') list.sort((a, b) => (b.year || 0) - (a.year || 0));
  if (st.sort === 'km') list.sort((a, b) => a.km - b.km);
  $('#count').textContent = list.length;
  $('#grid').innerHTML = list.length
    ? list
        .map(
          (v) => `<a class="car-card" href="/car.html?id=${v.id}">
<div class="photo">${v.photo ? `<img src="${esc(v.photo)}" alt="${esc(v.name)} 실차 사진" loading="lazy">` : `<img src="${classImage(v.class)}" alt="" style="object-fit:contain">`}</div>
<div style="display:flex;flex-direction:column;gap:4px">
<span class="badge">${esc(ST(v))}</span>
<strong class="name">${esc(v.name)}</strong>
<span class="meta">${v.year ? v.year + '년식 | ' : ''}${won(v.km)}km | ${esc(v.fuel)}</span></div>
<dl><dt>현재 차량가격</dt><dd>${v.car_value ? won(v.car_value) + '원' : '-'}</dd>
<dt>월 렌트료${v.p ? ` (${v.p.term}개월)` : ''}</dt><dd>${v.p ? `<strong class="price">${won(v.p.monthly)}</strong>원~` : '<span class="muted">상담</span>'}</dd></dl></a>`
        )
        .join('')
    : '<p class="empty" style="grid-column:1/-1">지금 출고 가능한 중장기 차량을 준비 중입니다. 1644-8891로 문의하시거나 아래 견적 신청을 남겨주세요.</p>';
}

try {
  st.list = (await api('/api/long')).vehicles;
  draw();
} catch (e) {
  $('#grid').innerHTML = `<p class="empty" style="grid-column:1/-1">${esc(e.message)}</p>`;
}

// 법인 견적
$('#corpForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, msg = $('#corpMsg');
  msg.textContent = '';
  if (!f.company.value.trim() || !f.name.value.trim()) return (msg.textContent = '법인명과 담당자 이름을 입력해 주세요.');
  if (f.phone.value.replace(/\D/g, '').length < 9) return (msg.textContent = '연락처를 확인해 주세요.');
  if (!f.agree.checked) return (msg.textContent = '개인정보 수집·이용에 동의해 주세요.');
  const btn = f.querySelector('button[type=submit]');
  setBusy(btn, true, '접수 중…');
  try {
    const r = await api('/api/long/applications', {
      method: 'POST',
      body: { applicantType: 'corp', company: f.company.value, bizNo: f.bizNo.value, name: f.name.value, phone: f.phone.value, vehicleWish: f.vehicleWish.value, qty: f.qty.value, request: f.request.value, website: f.website.value, agree: true },
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
