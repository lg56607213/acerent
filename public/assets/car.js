import { api, $, $$, esc, won, initLayout, setBusy, classImage } from './common.js';

await initLayout();
const qs = new URLSearchParams(location.search);
const root = $('#carRoot');
const id = qs.get('id');
let data;
try {
  if (!id) throw new Error('차량을 찾을 수 없습니다.');
  data = await api('/api/long/' + encodeURIComponent(id));
} catch (e) {
  root.innerHTML = `<p class="empty">${esc(e.message)} <a class="red" href="/long.html">차량 목록으로</a></p>`;
  throw e;
}
const v = data.vehicle;
const prices = data.prices;
root.innerHTML = '';
root.append($('#carTpl').content.cloneNode(true));
document.title = `${v.name} 중장기렌트 | 에이스렌터카`;

// 사진
const showPhoto = (i) => {
  $('#mainPhoto').innerHTML = v.photos[i] ? `<img src="${esc(v.photos[i])}" alt="${esc(v.name)} 실차 사진 ${i + 1}">` : `<img src="${classImage(v.class)}" alt="실차 사진 준비 중" style="object-fit:contain">`;
  $$('#thumbs button').forEach((b, j) => b.classList.toggle('on', i === j));
};
$('#thumbs').innerHTML = v.photos.map((p, i) => `<button type="button" aria-label="사진 ${i + 1} 보기"><img src="${esc(p)}" alt="" loading="lazy"></button>`).join('');
$$('#thumbs button').forEach((b, i) => b.addEventListener('click', () => showPhoto(i)));
showPhoto(0);

$('#vBadge').textContent = [v.status === 'reserved' ? '상담 진행 중' : v.badge, v.class].filter(Boolean).join(' · ');
$('#vName').textContent = v.name;
$('#vMeta').textContent = [v.year ? v.year + '년식' : '', won(v.km) + 'km', v.fuel, v.color].filter(Boolean).join(' | ');

const specs = [
  ['최초 등록', v.first_reg], ['주행거리', won(v.km) + 'km'], ['연료', v.fuel], ['승차 인원', v.seats ? v.seats + '인승' : ''],
  ['사고 이력', v.accident], ['인수', v.pickup], ['주요 옵션', v.options], ['약정 기준', v.km_note],
].filter((s) => s[1]);
$('#specs').innerHTML = specs.map(([k, val]) => `<tr><th scope="row">${esc(k)}</th><td style="line-height:1.7">${esc(val)}</td></tr>`).join('');

// 가격표 (기간 × 보증금)
const terms = [...new Set(prices.map((p) => p.term))].sort((a, b) => a - b);
const deps = [...new Set(prices.map((p) => p.dep))].sort((a, b) => a - b);
const find = (t, d) => prices.find((p) => p.term === t && p.dep === d);
const st = { term: +(qs.get('term') || 0), dep: +(qs.get('dep') || 0), km: 2, type: 'person' };
if (!find(st.term, st.dep)) {
  const def = find(36, 0) || find(36, 10) || prices[0];
  if (def) { st.term = def.term; st.dep = def.dep; }
}
function drawMatrix() {
  if (!prices.length) {
    $('#matrix').innerHTML = '<tr><td style="padding:20px;text-align:center" class="muted">가격은 상담으로 안내해 드립니다.</td></tr>';
    return;
  }
  $('#matrix').innerHTML =
    `<thead><tr><th scope="col">기간 \\ 보증금</th>${deps.map((d) => `<th scope="col">${d ? d + '%' : '무보증'}</th>`).join('')}</tr></thead><tbody>` +
    terms
      .map(
        (t) =>
          `<tr><th scope="row">${t}개월</th>${deps
            .map((d) => {
              const p = find(t, d);
              const on = st.term === t && st.dep === d;
              return `<td><button type="button" ${p ? '' : 'disabled'} class="${on ? 'on' : ''}" aria-pressed="${on}" data-t="${t}" data-d="${d}">${p ? won(p.monthly) : '-'}</button></td>`;
            })
            .join('')}</tr>`
      )
      .join('') +
    '</tbody>';
  $$('#matrix button[data-t]').forEach((b) => b.addEventListener('click', () => { st.term = +b.dataset.t; st.dep = +b.dataset.d; drawMatrix(); calc(); }));
}
function calc() {
  const p = find(st.term, st.dep);
  if (!p) return;
  const monthly = p.monthly + (st.km - 2) * 30000;
  $('#cCond').textContent = `${st.term}개월 · ${st.dep ? '보증금 ' + st.dep + '%' : '무보증'} · 연 ${st.km}만km`;
  $('#cDep').textContent = won(Math.round((v.car_value * st.dep) / 100)) + '원';
  $('#cMonthly').textContent = won(monthly) + '원';
  $('#applyBtn').textContent = `${st.term}개월 · 월 ${won(monthly)}원 신청`;
}
$('#km').addEventListener('change', (e) => { st.km = +e.target.value; calc(); });
drawMatrix();
calc();

// 신청 구분
$$('[data-type]').forEach((b) =>
  b.addEventListener('click', () => {
    st.type = b.dataset.type;
    $$('[data-type]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
    $$('.corp-only').forEach((r) => (r.hidden = st.type !== 'corp'));
    $('#aNameLabel').textContent = st.type === 'corp' ? '담당자 이름' : '이름';
  })
);

$('#applyBtn').addEventListener('click', async () => {
  const f = $('#applyForm'), err = $('#applyErr');
  err.textContent = '';
  if (st.type === 'corp' && !f.company.value.trim()) return (err.textContent = '법인명을 입력해 주세요.'), f.company.focus();
  if (!f.name.value.trim()) return (err.textContent = '이름을 입력해 주세요.'), f.name.focus();
  if (f.phone.value.replace(/\D/g, '').length < 10) return (err.textContent = '휴대폰 번호를 확인해 주세요.'), f.phone.focus();
  if (!f.agree.checked) return (err.textContent = '필수 동의 항목에 체크해 주세요.');
  const btn = $('#applyBtn');
  setBusy(btn, true, '접수 중…');
  try {
    const r = await api('/api/long/applications', {
      method: 'POST',
      body: {
        applicantType: st.type, vehicleId: v.id, term: prices.length ? st.term : null, dep: st.dep, km: st.km,
        company: f.company.value, bizNo: f.bizNo.value, qty: f.qty.value, name: f.name.value, phone: f.phone.value,
        wishDate: f.wishDate.value, request: f.request.value, website: f.website.value, agree: true,
      },
    });
    root.innerHTML = `<div style="max-width:760px;margin:0 auto;width:100%;padding:24px 0">
<div class="done-box"><h2>렌트 신청이 접수되었습니다.</h2>
<p style="margin:0;font-size:15px;line-height:1.8;color:#444">신청번호 <strong class="red">${esc(r.no)}</strong><br>담당자가 심사 후 1영업일 안에 연락드립니다.</p></div>
<table class="info-table" style="margin-top:22px;border-top:0"><tbody>
<tr><th scope="row">차량</th><td>${esc(r.vehicle)}</td></tr>
<tr><th scope="row">조건</th><td>${esc(r.cond || '상담')}</td></tr>
<tr><th scope="row">보증금</th><td>${won(r.depositAmt)}원</td></tr>
<tr><th scope="row">월 렌트료</th><td style="font-weight:700;color:var(--red)">${r.monthly ? won(r.monthly) + '원' : '상담'}</td></tr>
</tbody></table>
<div style="display:flex;justify-content:center;gap:10px;margin-top:22px"><a class="btn btn-lg" href="/long.html">다른 차량 보기</a><a class="btn btn-black btn-lg" href="/">메인으로</a></div></div>`;
    scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    err.textContent = e.message;
  } finally {
    if (document.body.contains(btn)) setBusy(btn, false);
  }
});
