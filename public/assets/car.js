import { api, $, $$, esc, won, initLayout, setBusy, classImage } from './common.js';
import { quote, rateAmount, describe } from './longcalc.js';

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
const bases = data.bases;
const P = v.pricing;
const cv = v.car_value || 0;
root.innerHTML = '';
root.append($('#carTpl').content.cloneNode(true));
document.title = `${v.name} 중장기렌트 | 에이스렌터카`;
const km = (n) => won(n) + 'km';
const W = (n) => won(n) + '원';

// ── 머리 ──
const ST = { available: v.badge || '즉시출고', soon: '출고 예정', reserved: '상담 진행 중' };
$('#vName').textContent = v.name;
$('#vSt').textContent = ST[v.status] || v.badge || '';
$('#vSt').classList.toggle('soon', v.status !== 'available');
$('#vMeta').textContent = [v.class, v.year ? v.year + '년식' : '', km(v.km), v.fuel, v.avail_note].filter(Boolean).join(' · ');
$('#vPrice').innerHTML = cv ? `현재 차량가격<strong>${W(cv)}</strong>` : '';

// ── 탭 ──
$$('[data-tab]').forEach((b) =>
  b.addEventListener('click', () => {
    $$('[data-tab]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); });
    $$('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
  })
);

// ── 사진 ──
const showPhoto = (i) => {
  $('#mainPhoto').innerHTML = v.photos[i] ? `<img src="${esc(v.photos[i])}" alt="${esc(v.name)} 실차 사진 ${i + 1}">` : `<img src="${classImage(v.class)}" alt="실차 사진 준비 중" style="object-fit:contain">`;
  $$('#thumbs button').forEach((b, j) => b.classList.toggle('on', i === j));
};
$('#thumbs').innerHTML = v.photos.map((p, i) => `<button type="button" aria-label="사진 ${i + 1} 보기"><img src="${esc(p)}" alt="" loading="lazy"></button>`).join('');
$$('#thumbs button').forEach((b, i) => b.addEventListener('click', () => showPhoto(i)));
showPhoto(0);

// ── 차량 정보 ──
const kv = (rows) => rows.filter((r) => r[1] !== '' && r[1] != null).map(([k, val, cls]) => `<div class="${cls || ''}"><dt>${esc(k)}</dt><dd>${esc(val)}</dd></div>`).join('');
const dep = v.new_price ? v.new_price - (v.tax_cut || 0) - cv : 0;
$('#kvMain').innerHTML = kv([
  ['차량 번호', v.plate || ''],
  ['신차가격', v.new_price ? W(v.new_price) : ''],
  ['신차 개소세 감면', v.tax_cut ? '-' + W(v.tax_cut) : '', 'minus'],
  ['감가상각', dep > 0 ? '-' + W(dep) : '', 'minus'],
  ['현재 차량가격', cv ? W(cv) : '', 'total'],
  ['신차등록일', v.first_reg],
  ['모델 연도', v.year || ''],
  ['주행거리', km(v.km)],
  ['배기량', v.displacement ? won(v.displacement) + 'cc' : ''],
]);
$('#kvMore').innerHTML = kv([
  ['연료', v.fuel], ['승차 인원', v.seats ? v.seats + '인승' : ''], ['외장 색상', v.color], ['내장 색상', v.int_color],
  ['사고 이력', v.accident], ['인수', v.pickup], ['주요 옵션', v.options],
]);
if (!$('#kvMore').innerHTML) $('#moreBtn').remove();
else $('#moreBtn').addEventListener('click', (e) => { const m = $('#kvMore'); m.hidden = !m.hidden; e.target.textContent = m.hidden ? '더 보기' : '접기'; });

// ── 추가 옵션 ──
const addTotal = v.added_options.reduce((s, o) => s + (o.price || 0), 0);
const optRows = [
  ...(v.color ? [[`외장색상 · ${v.color}`, 0]] : []),
  ...(v.int_color ? [[`내장색상 · ${v.int_color}`, 0]] : []),
  ...v.added_options.map((o) => [o.name, o.price || 0]),
];
$('#addOpts').innerHTML = `<li><strong>총합</strong><strong>${W(addTotal)}</strong></li>` + optRows.map(([n, p]) => `<li><span>${esc(n)}</span><span>${W(p)}</span></li>`).join('');
if (!optRows.length) $('#secOpts').hidden = true;

// ── 정비 · 매입 · 보험 · 위치 ──
$('#maintItems').innerHTML = P.maintItems.map((x) => `<li>${esc(x)}</li>`).join('');
$('#buyout').textContent = P.buyout || '-';
$('#buyoutNote').innerHTML = P.buyoutNote ? `<li>${esc(P.buyoutNote)}</li>` : '';
$('#driverAge').textContent = P.driverAge || '-';
$('#deductible').textContent = P.deductible || '-';
$('#location').textContent = v.location || '';
if (!v.location) $('#secLoc').hidden = true;
$('#regionNote').textContent = P.regionNote || '';
if (!P.regions.length) $('#secRegion').hidden = true;
if (P.liability.length < 2 && !(P.liability[0] && P.liability[0].fee)) {
  $('#secLiab').querySelector('.sec-body').innerHTML = `<span class="fixed-val">${esc(P.liability[0] ? P.liability[0].label : '-')}</span>`;
}

// ── 선택 상태 ──
const st = {
  term: +(qs.get('term') || 0), km: +(qs.get('km') || P.kmBase),
  dep: rateAmount(cv, +(qs.get('dep') || 0)), pre: 0, liab: 0, maint: false, region: P.regions[0] || '',
  custom: { km: false, dep: false, pre: false }, type: 'person',
};
let Q = quote(v, P, bases, st);
st.term = Q.sel.term;

function optButtons(box, items, isOn, onPick, customKey) {
  $(box).innerHTML =
    items.map((it, i) => `<button type="button" class="opt ${isOn(it) ? 'on' : ''}" aria-pressed="${isOn(it)}" data-i="${i}">${it.html}</button>`).join('') +
    (customKey ? `<button type="button" class="opt ${st.custom[customKey] ? 'on' : ''}" aria-pressed="${st.custom[customKey]}" data-custom>직접입력</button>` : '');
  $$(box + ' [data-i]').forEach((b) => b.addEventListener('click', () => { if (customKey) st.custom[customKey] = false; onPick(items[+b.dataset.i]); update(); }));
  const c = $(box + ' [data-custom]');
  if (c) c.addEventListener('click', () => { st.custom[customKey] = true; update(); $('#' + customKey + 'In').focus(); });
}

function drawOptions() {
  optButtons('#kmOpts', P.kmPresets.map((k) => ({ k, html: km(k) })), (it) => !st.custom.km && it.k === Q.sel.km, (it) => (st.km = it.k), 'km');
  optButtons('#depOpts', P.depRates.map((r) => ({ a: rateAmount(cv, r), html: `${W(rateAmount(cv, r))}<small>${r}%</small>` })), (it) => !st.custom.dep && it.a === Q.sel.dep, (it) => (st.dep = it.a), 'dep');
  optButtons('#preOpts', P.preRates.map((r) => ({ a: rateAmount(cv, r), html: `${W(rateAmount(cv, r))}<small>${r}%</small>` })), (it) => !st.custom.pre && it.a === Q.sel.pre, (it) => (st.pre = it.a), 'pre');
  if ($('#liabOpts')) optButtons('#liabOpts', P.liability.map((l, i) => ({ i, html: `${esc(l.label)}${l.fee ? `<small>월 ${l.fee > 0 ? '+' : ''}${won(l.fee)}원</small>` : ''}` })), (it) => it.i === Q.sel.liab, (it) => (st.liab = it.i));
  optButtons('#regionOpts', P.regions.map((r) => ({ r, html: esc(r) })), (it) => it.r === Q.sel.region, (it) => (st.region = it.r));
  for (const k of ['km', 'dep', 'pre']) $('#' + k + 'Custom').hidden = !st.custom[k];
}

// 직접입력
for (const k of ['km', 'dep', 'pre']) {
  const inp = $('#' + k + 'In');
  inp.addEventListener('input', () => { st[k] = +inp.value.replace(/\D/g, ''); calc(); drawTerms(); });
  inp.addEventListener('blur', () => { inp.value = Q.sel[k] ? won(Q.sel[k]) : '0'; update(); });
}

// 안내 문구
const pctOf = (a) => (cv ? Math.round((a / cv) * 1000) / 10 : 0);
$('#kmNote').innerHTML = [
  '약정운행거리는 짧을수록 저렴합니다.',
  P.kmFee ? `연 1만km 늘리거나 줄일 때마다 월 대여료가 약 ${won(P.kmFee)}원 달라집니다.` : '',
  `1,000km 단위로 최소 ${km(P.kmMin)} ~ 최대 ${km(P.kmMax)}까지 선택할 수 있습니다.`,
].filter(Boolean).map((x) => `<li>${x}</li>`).join('');
$('#depNote').innerHTML = [
  '보증금 = 현재 차량가격 × 보증금율 (계약이 끝나면 돌려드립니다)',
  P.depDiscount ? `보증금을 100만원 늘리면 월 대여료가 약 ${won(P.depDiscount)}원 내려갑니다.` : '',
  `최대 ${P.depMaxPct}%까지 가능하며, 신용도에 따라 최소 보증금 조건이 있을 수 있습니다.`,
].filter(Boolean).map((x) => `<li>${x}</li>`).join('');
$('#preNote').innerHTML = [
  '선납금 = 현재 차량가격 × 선납금율',
  '선납금은 계약 기간 동안 매월 나눠 차감되어 소멸됩니다. 월 대여료를 크게 낮추고 싶을 때 선택하세요.',
].map((x) => `<li>${x}</li>`).join('');

if (P.maintAddFee > 0) {
  $('#maintAdd').innerHTML = `<label class="check-line"><input type="checkbox" id="maintChk">정비 서비스 추가 (월 +${won(P.maintAddFee)}원)</label>${P.maintAddNote ? `<p class="small muted" style="margin:0">${esc(P.maintAddNote)}</p>` : ''}`;
  $('#maintChk').addEventListener('change', (e) => { st.maint = e.target.checked; update(); });
}

function drawTerms() {
  if (!Q.rows.length) {
    $('#terms').innerHTML = '<li class="muted small" style="padding:18px">월 대여료는 상담으로 안내해 드립니다.</li>';
    return;
  }
  $('#terms').innerHTML = Q.rows
    .map((r) => `<li><button type="button" class="${r.term === Q.sel.term ? 'on' : ''}" aria-pressed="${r.term === Q.sel.term}" data-t="${r.term}"><span>${r.term}개월</span><strong>${won(r.monthly)}원</strong></button></li>`)
    .join('');
  $$('#terms button').forEach((b) => b.addEventListener('click', () => { st.term = +b.dataset.t; update(); }));
}

function calc() {
  Q = quote(v, P, bases, st);
  const s = Q.sel;
  const extra = [P.liability[s.liab] && P.liability.length > 1 ? '대물 ' + P.liability[s.liab].label : '', s.maint ? '정비 추가' : '', s.region ? '인도 ' + s.region : ''].filter(Boolean).join(' · ');
  $('#sKm').textContent = '연 ' + km(s.km);
  $('#sDep').textContent = s.dep ? `${W(s.dep)} (${pctOf(s.dep)}%)` : '없음';
  $('#sPre').textContent = s.pre ? `${W(s.pre)} (${pctOf(s.pre)}%)` : '없음';
  $('#sExtra').textContent = extra || '-';
  const has = Q.rows.length > 0;
  $('#sTerm').textContent = has ? `${s.term}개월 월 대여료` : '월 대여료';
  $('#sMonthly').textContent = has ? W(Q.monthly) : '상담';
  $('#mTerm').textContent = has ? `${s.term}개월 · 부가세 포함` : '월 대여료';
  $('#mMonthly').textContent = has ? W(Q.monthly) : '상담';
  $('#applyCond').textContent = has ? `${s.term}개월 · 보증금 ${s.dep ? W(s.dep) : '없음'} · 선납금 ${s.pre ? W(s.pre) : '없음'} · ${describe(P, s)}` : '상담 후 결정';
  $('#applyMonthly').textContent = has ? W(Q.monthly) + ' (부가세 포함)' : '상담';
  $('#applyBtn').textContent = has ? `${s.term}개월 · 월 ${won(Q.monthly)}원 신청` : '상담 신청';
}

function update() {
  calc();
  // 직접입력 칸 값이 범위를 벗어났으면 맞춘 값으로 보여 줌
  for (const k of ['km', 'dep', 'pre']) if (document.activeElement !== $('#' + k + 'In')) $('#' + k + 'In').value = won(Q.sel[k]);
  st.term = Q.sel.term;
  drawOptions();
  drawTerms();
}
update();

// ── 사양 · 이용이력 · 사고수리 ──
$('#specBody').innerHTML =
  (v.spec_text ? `<p class="pre">${esc(v.spec_text)}</p>` : '') +
  (v.options ? `<strong style="font-size:14px">주요 옵션</strong><p class="pre">${esc(v.options)}</p>` : '') ||
  '<p class="muted" style="margin:0">사양 정보를 준비 중입니다. 전화로 문의해 주세요.</p>';
$('#usageBody').innerHTML = v.usage_history.length
  ? `<table class="htable"><thead><tr><th scope="col">구분</th><th scope="col">기간</th><th scope="col">이용자</th></tr></thead><tbody>${v.usage_history.map((u) => `<tr><td>${esc(u.kind)}</td><td>${esc(u.period)}</td><td>${esc(u.user)}</td></tr>`).join('')}</tbody></table>`
  : '<p class="muted" style="margin:0">등록된 이용이력이 없습니다.</p>';
$('#repairBody').innerHTML =
  (v.accident ? `<p style="margin:0;font-weight:700">${esc(v.accident)}</p>` : '') +
  (v.repair_history.length
    ? `<table class="htable"><thead><tr><th scope="col">일자</th><th scope="col">수리 내용</th><th scope="col" style="text-align:right">수리비</th></tr></thead><tbody>${v.repair_history.map((r) => `<tr><td style="white-space:nowrap">${esc(r.date)}</td><td>${esc(r.detail)}</td><td style="text-align:right;white-space:nowrap">${r.cost ? W(r.cost) : '-'}</td></tr>`).join('')}</tbody></table>`
    : '<p class="muted" style="margin:0">등록된 사고 수리 내역이 없습니다.</p>');

// ── 신청 ──
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
  const s = Q.sel;
  setBusy(btn, true, '접수 중…');
  try {
    const r = await api('/api/long/applications', {
      method: 'POST',
      body: {
        applicantType: st.type, vehicleId: v.id, term: Q.rows.length ? s.term : null, km: s.km, dep: s.dep, pre: s.pre, liab: s.liab, maint: s.maint, region: s.region,
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
<tr><th scope="row">보증금</th><td>${W(r.depositAmt)}</td></tr>
<tr><th scope="row">선납금</th><td>${W(r.prepayAmt)}</td></tr>
<tr><th scope="row">월 대여료</th><td style="font-weight:700;color:var(--red)">${r.monthly ? W(r.monthly) + ' (부가세 포함)' : '상담'}</td></tr>
</tbody></table>
<div style="display:flex;justify-content:center;gap:10px;margin-top:22px"><a class="btn btn-lg" href="/long.html">다른 차량 보기</a><a class="btn btn-black btn-lg" href="/">메인으로</a></div></div>`;
    scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    err.textContent = e.message;
  } finally {
    if (document.body.contains(btn)) setBusy(btn, false);
  }
});
