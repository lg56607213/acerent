import { api, $, $$, esc, won, initLayout, setBusy, classImage } from './common.js';
import { quote, rateAmount } from './longcalc.js';

await initLayout();
const qs = new URLSearchParams(location.search);
const st = { term: +(qs.get('term') || 36), dep: +(qs.get('dep') || 0), cls: qs.get('cls') || '전체', max: 1500000, sort: 'low', list: [] };
const CLASSES = ['전체', '경차', '준중형', '중형', '대형', 'SUV', '승합·화물'];

function chips(id, values, key, label) {
  $(id).innerHTML = values.map((v) => `<button type="button" class="chip ${st[key] === v ? 'on' : ''}" aria-pressed="${st[key] === v}" data-v="${esc(v)}">${esc(label(v))}</button>`).join('');
  $$(id + ' button').forEach((b) =>
    b.addEventListener('click', () => {
      st[key] = typeof values[0] === 'number' ? +b.dataset.v : b.dataset.v;
      drawFilters();
      draw();
    })
  );
}
function drawFilters() {
  chips('#fTerm', [12, 24, 36, 48], 'term', (v) => v + '개월');
  chips('#fDep', [0, 10, 20, 30], 'dep', (v) => (v ? v + '%' : '무보증'));
  chips('#fCls', CLASSES, 'cls', (v) => v);
}
$('#fMax').addEventListener('input', (e) => { st.max = +e.target.value; draw(); });
$('#sort').addEventListener('change', (e) => { st.sort = e.target.value; draw(); });

// 선택한 기간 · 보증금율, 기준 약정거리로 계산한 월 대여료 (그 기간이 없으면 없음)
function priceOf(v) {
  if (!v.bases.some((b) => b.term === st.term)) return null;
  const q = quote(v, v.pricing, v.bases, { term: st.term, dep: rateAmount(v.car_value, st.dep) });
  return { monthly: q.monthly, deposit: q.sel.dep };
}
const ST = (v) => (v.status === 'reserved' ? '상담 진행 중' : v.status === 'soon' ? '출고 예정' + (v.avail_note ? ' · ' + v.avail_note : '') : v.badge);

function draw() {
  $('#fMaxLabel').textContent = st.max >= 1500000 ? '전체' : `${won(st.max)}원 이하`;
  $('#cond').textContent = `· ${st.term}개월 / 보증금 ${st.dep ? st.dep + '%' : '무보증'} / 기본 약정거리 기준`;
  let list = st.list
    .map((v) => ({ ...v, p: priceOf(v) }))
    .filter((v) => (st.cls === '전체' || v.class === st.cls || (st.cls === '승합·화물' && /승합|화물/.test(v.class))) && (!v.p || v.p.monthly <= st.max));
  if (st.sort === 'low') list.sort((a, b) => (a.p ? a.p.monthly : 9e9) - (b.p ? b.p.monthly : 9e9));
  if (st.sort === 'new') list.sort((a, b) => (b.year || 0) - (a.year || 0));
  if (st.sort === 'km') list.sort((a, b) => a.km - b.km);
  $('#count').textContent = list.length;
  $('#grid').innerHTML = list.length
    ? list
        .map(
          (v) => `<a class="car-card" href="/car.html?id=${v.id}&term=${st.term}&dep=${st.dep}">
<div class="photo">${v.photo ? `<img src="${esc(v.photo)}" alt="${esc(v.name)} 실차 사진" loading="lazy">` : `<img src="${classImage(v.class)}" alt="" style="object-fit:contain">`}</div>
<div style="display:flex;flex-direction:column;gap:4px">
<span class="badge">${esc(ST(v))}</span>
<strong class="name">${esc(v.name)}</strong>
<span class="meta">${v.year ? v.year + '년식 | ' : ''}${won(v.km)}km | ${esc(v.fuel)}</span></div>
<dl><dt>보증금</dt><dd>${v.p ? won(v.p.deposit) + '원' : '-'}</dd>
<dt>월 렌트료</dt><dd>${v.p ? `<strong class="price">${won(v.p.monthly)}</strong>원` : '<span class="muted">이 조건 없음</span>'}</dd></dl></a>`
        )
        .join('')
    : '<p class="empty" style="grid-column:1/-1">조건에 맞는 차량이 없습니다. 조건을 바꾸거나 아래 견적 신청을 남겨주세요.</p>';
}

drawFilters();
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
