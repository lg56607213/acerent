import { api, $, $$, esc, won, shortDt, defaultPeriod, initLayout, setBusy } from './common.js';

const site = await initLayout();
const qs = new URLSearchParams(location.search);
const st = { models: [], days: 0, cls: '전체', modelId: null, insId: null };
const locs = ((site && site.locations) || []).filter((l) => l.can_pickup);
const ins = (site && site.insurance) || [];
if (site && site.driverNote) $('#driverNote').textContent = site.driverNote;

$('#loc').innerHTML = locs.length
  ? locs.map((l) => `<option value="${l.id}">${esc(l.name)}${l.fee ? ` (+${won(l.fee)}원)` : ''}</option>`).join('')
  : '<option value="">예약 장소 준비 중</option>';
if (qs.get('loc')) $('#loc').value = qs.get('loc');
const [df, dt] = defaultPeriod();
$('#from').value = qs.get('from') || df;
$('#to').value = qs.get('to') || dt;
$('#from').min = df.slice(0, 10) + 'T00:00';

// 보험 선택지 (기본: 두 번째 = 일반 자차)
st.insId = ins.length > 1 ? ins[1].id : ins[0] ? ins[0].id : null;
$('#insBox').insertAdjacentHTML(
  'beforeend',
  ins
    .map(
      (i) => `<label class="check"><input type="radio" name="ins" value="${i.id}" ${i.id === st.insId ? 'checked' : ''}><span>${esc(i.name)}</span><span class="p">${i.per_day ? `1일 ${won(i.per_day)}원` : '0원'}</span></label>`
    )
    .join('')
);
$$('input[name=ins]').forEach((r) => r.addEventListener('change', () => { st.insId = +r.value; summary(); }));
$$('input[name=opt]').forEach((r) => r.addEventListener('change', summary));

const loc = () => locs.find((l) => String(l.id) === $('#loc').value);
const model = () => st.models.find((m) => m.id === st.modelId);
const insCur = () => ins.find((i) => i.id === st.insId);

let timer;
['loc', 'from', 'to'].forEach((id) => $('#' + id).addEventListener('change', () => { clearTimeout(timer); timer = setTimeout(search, 150); }));
$('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); search(); });

async function search() {
  const from = $('#from').value, to = $('#to').value;
  if (!from || !to) return;
  $('#carList').innerHTML = '<p class="loading">차량을 찾는 중…</p>';
  try {
    const r = await api(`/api/short/search?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&location=${$('#loc').value}`);
    st.models = r.models;
    st.days = r.days;
    if (!model()) st.modelId = null;
    $('#period').textContent = `총 ${r.days}일`;
    $('#soldOut').innerHTML = r.soldOut.length ? `<strong style="color:var(--ink)">예약 마감</strong> &nbsp; ${r.soldOut.map((n) => `<span style="text-decoration:line-through">${esc(n)}</span>`).join(' &nbsp; ')}` : '';
    history.replaceState(null, '', `?loc=${$('#loc').value}&from=${from}&to=${to}`);
    render();
  } catch (e) {
    st.models = [];
    $('#period').textContent = '-';
    $('#carList').innerHTML = `<p class="empty">${esc(e.message)}</p>`;
    $('#availCount').textContent = '0';
    summary();
  }
}

function render() {
  const classes = ['전체', ...new Set(st.models.map((m) => m.class).filter(Boolean))];
  if (!classes.includes(st.cls)) st.cls = '전체';
  $('#classTabs').innerHTML = classes.map((c) => `<button type="button" class="${c === st.cls ? 'on' : ''}" aria-pressed="${c === st.cls}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
  $$('#classTabs button').forEach((b) => b.addEventListener('click', () => { st.cls = b.dataset.c; render(); }));
  const list = st.models.filter((m) => st.cls === '전체' || m.class === st.cls);
  $('#availCount').textContent = list.reduce((s, m) => s + m.left, 0);
  $('#carList').innerHTML = list.length
    ? list
        .map(
          (m) => `<article class="car-row">
<div class="photo">${m.image ? `<img src="${esc(m.image)}" alt="${esc(m.name)}" loading="lazy">` : '차종 이미지'}</div>
<div class="info"><span class="small muted">${esc(m.class)} · ${esc(m.fuel)} · ${m.seats}인승</span><strong style="font-size:18px">${esc(m.maker)} ${esc(m.name)}</strong>
<span class="small muted">${esc(m.features)}</span><span class="small red" style="font-weight:700">잔여 ${m.left}대</span></div>
<div class="pay"><span class="small muted">1일 ${won(m.dayRate)}원 × ${st.days}일</span><strong>${won(m.rent)}원</strong>
<button type="button" class="btn ${m.id === st.modelId ? 'btn-red' : ''} btn-block" style="height:42px;margin-top:8px" data-id="${m.id}" aria-pressed="${m.id === st.modelId}">${m.id === st.modelId ? '선택됨' : '선택'}</button></div>
</article>`
        )
        .join('')
    : '<p class="empty">선택하신 기간에 예약 가능한 차량이 없습니다. 날짜를 바꾸거나 1644-8891로 문의해 주세요.</p>';
  $$('#carList button[data-id]').forEach((b) => b.addEventListener('click', () => { st.modelId = +b.dataset.id; render(); if (innerWidth < 760) $('.summary').scrollIntoView({ behavior: 'smooth' }); }));
  summary();
}

function amounts() {
  const m = model(), i = insCur(), l = loc();
  const rent = m ? m.rent : 0;
  const insAmt = i ? i.per_day * st.days : 0;
  const fee = l ? l.fee || 0 : 0;
  return { rent, insAmt, fee, total: rent + insAmt + fee };
}

function summary() {
  const m = model();
  $('#noCar').hidden = !!m;
  $('#sumBody').hidden = !m;
  if (!m) return;
  const a = amounts();
  $('#sumCar').textContent = `${m.maker} ${m.name}`;
  $('#sumPeriod').textContent = `${shortDt($('#from').value)} ~ ${shortDt($('#to').value)} · ${st.days}일`;
  $('#sumRent').textContent = won(a.rent) + '원';
  $('#sumIns').textContent = won(a.insAmt) + '원';
  $('#sumLoc').textContent = a.fee ? won(a.fee) + '원' : '없음';
  $('#sumTotal').textContent = won(a.total) + '원';
}

function step(n) {
  $('#stepSelect').hidden = n !== 1;
  $('#stepInfo').hidden = n !== 2;
  $('#stepDone').hidden = n !== 3;
  ['#st1', '#st2', '#st3'].forEach((s, i) => $(s).classList.toggle('on', i === n - 1));
  $('.searchbar').style.display = n === 1 ? '' : 'none';
  scrollTo({ top: 0, behavior: 'smooth' });
}

$('#goInfo').addEventListener('click', () => {
  const m = model(), a = amounts(), i = insCur();
  const opts = $$('input[name=opt]:checked').map((x) => x.value);
  $('#cCar').textContent = `${m.maker} ${m.name}`;
  $('#cLoc').textContent = loc() ? loc().name : '';
  $('#cPeriod').textContent = `${$('#from').value.replace('T', ' ')} ~ ${$('#to').value.replace('T', ' ')} (${st.days}일)`;
  $('#cIns').textContent = [i ? i.name : '', ...opts].filter(Boolean).join(' · ');
  $('#cTotal').textContent = won(a.total) + '원';
  step(2);
});
$('#backSelect').addEventListener('click', () => step(1));

$('#submitRes').addEventListener('click', async () => {
  const f = $('#infoForm');
  const err = $('#infoErr');
  err.textContent = '';
  if (!f.name.value.trim()) return (err.textContent = '이름을 입력해 주세요.'), f.name.focus();
  if (f.phone.value.replace(/\D/g, '').length < 10) return (err.textContent = '휴대폰 번호를 확인해 주세요.'), f.phone.focus();
  if (!$('#agree1').checked || !$('#agree2').checked) return (err.textContent = '필수 확인 항목에 체크해 주세요.');
  const btn = $('#submitRes');
  setBusy(btn, true, '접수 중…');
  try {
    const r = await api('/api/short/reservations', {
      method: 'POST',
      body: {
        locationId: +$('#loc').value, pickupAt: $('#from').value, returnAt: $('#to').value, modelId: st.modelId, insuranceId: st.insId,
        options: $$('input[name=opt]:checked').map((x) => x.value),
        name: f.name.value, phone: f.phone.value, birth: f.birth.value, license: f.license.value, flight: f.flight.value, request: f.request.value,
        website: f.website.value, agree: true,
      },
    });
    $('#dNo').textContent = r.no;
    $('#dCar').textContent = r.model;
    $('#dPeriod').textContent = `${r.location} · ${r.pickupAt.replace('T', ' ')} ~ ${r.returnAt.replace('T', ' ')} (${r.days}일)`;
    $('#dTotal').textContent = won(r.total) + '원';
    step(3);
  } catch (e) {
    err.textContent = e.message;
    if (/마감/.test(e.message)) setTimeout(() => { step(1); search(); }, 1500);
  } finally {
    setBusy(btn, false);
  }
});

search();
