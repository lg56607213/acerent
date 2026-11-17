import { api, $, $$, esc, won, shortDt, defaultPeriod, initLayout, setBusy, classImage, validBirth } from './common.js';

const site = await initLayout();
const qs = new URLSearchParams(location.search);
const st = { models: [], days: 0, hours: 0, periodText: '', cls: '전체', modelId: null, insId: null };
const locs = ((site && site.locations) || []).filter((l) => l.can_pickup);
const ins = (site && site.insurance) || [];
if (site && site.driverNote) $('#driverNote').textContent = site.driverNote;

$('#loc').innerHTML = locs.length
  ? locs.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('')
  : '<option value="">예약 장소 준비 중</option>';
if (qs.get('loc')) $('#loc').value = qs.get('loc');
// 딜리버리 지역(서울 등)은 탁송비 별도 안내
const locNote = () => { const l = locs.find((x) => String(x.id) === $('#loc').value); $('#locNote').hidden = !(l && l.type === '딜리버리'); };
locNote();
$('#loc').addEventListener('change', locNote);
const [df, dt] = defaultPeriod();
$('#from').value = qs.get('from') || df;
$('#to').value = qs.get('to') || dt;
// 주단위렌트(?days=7) · 월렌트(?days=30) 메뉴: 대여일 기준으로 반납일을 맞추고 메뉴 표시를 바꿈
const qDays = parseInt(qs.get('days'), 10);
if (qDays > 0 && qDays <= 60) {
  if (!qs.get('to')) {
    const d = new Date($('#from').value.slice(0, 10) + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + qDays);
    $('#to').value = d.toISOString().slice(0, 10) + $('#from').value.slice(10);
  }
  const cur = $(`.gnb a[href="/short.html?days=${qDays}"]`);
  if (cur) {
    $$('.gnb a').forEach((a) => { a.classList.remove('on'); a.removeAttribute('aria-current'); });
    cur.classList.add('on');
    cur.setAttribute('aria-current', 'page');
  }
}
$('#from').min = df.slice(0, 10) + 'T00:00';

// 보험 선택지 (기본: 두 번째 = 일반 자차)
st.insId = ins.length > 1 ? ins[1].id : ins[0] ? ins[0].id : null;
$('#insBox').insertAdjacentHTML(
  'beforeend',
  ins
    .map(
      (i) => `<label class="check"><input type="radio" name="ins" value="${i.id}" ${i.id === st.insId ? 'checked' : ''}><span>${esc(i.name)}</span><span class="p">${insPriceText(i)}</span></label>`
    )
    .join('')
);
$$('input[name=ins]').forEach((r) => r.addEventListener('change', () => { st.insId = +r.value; summary(); }));
$$('input[name=opt]').forEach((r) => r.addEventListener('change', summary));

// 보험 요금 표시: 정액은 '+20,000원', 1일 요금은 '1일 N원'
function insPriceText(i) {
  const parts = [];
  if (i.per_day) parts.push(`1일 ${won(i.per_day)}원`);
  if (i.flat_fee) parts.push(`+${won(i.flat_fee)}원`);
  return parts.join(' ') || '0원';
}

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
    st.hours = r.hours || 0;
    st.periodText = r.periodText || `${r.days}일`;
    if (!model()) st.modelId = null;
    $('#period').textContent = `총 ${st.periodText}`;
    $('#soldOut').innerHTML = r.soldOut.length ? `<strong style="color:var(--ink)">예약 마감</strong> &nbsp; ${r.soldOut.map((n) => `<span style="text-decoration:line-through">${esc(n)}</span>`).join(' &nbsp; ')}` : '';
    history.replaceState(null, '', `?loc=${$('#loc').value}&from=${from}&to=${to}${qDays > 0 && qDays <= 60 ? `&days=${qDays}` : ''}`);
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
          (m) => `<article class="car-row ${st.modelId && m.id !== st.modelId ? 'other' : ''}">
<div class="photo"><img src="${esc(m.image || classImage(m.class))}" alt="${esc(m.maker + ' ' + m.name)}" loading="lazy" style="object-fit:contain;background:#fff"></div>
<div class="info"><span class="small muted">${[m.class, m.fuel, m.seats ? m.seats + '인승' : ''].filter(Boolean).map(esc).join(' · ')}</span><strong style="font-size:18px">${esc(m.maker)} ${esc(m.name)}</strong>
${m.features ? `<span class="small muted">${esc(m.features)}</span>` : ''}<span class="small muted">${m.samples ? `대여료 ${m.samples.map(([d, v]) => `${d}일 ${won(v)}`).join(' · ')}` : `1일 요금 1~2일 ${won(m.tiers[0])} · 3~4일 ${won(m.tiers[1])} · 5~6일 ${won(m.tiers[2])} · 7일째부터 ${won(m.tiers[3])}`}</span><span class="small red" style="font-weight:700">잔여 ${m.left}대</span></div>
<div class="pay"><span class="small muted">${esc(m.rentLabel || `${st.periodText} 대여료`)}</span><strong>${won(m.rent)}원</strong>
<button type="button" class="btn ${m.id === st.modelId ? 'btn-red' : ''} btn-block" style="height:42px;margin-top:8px" data-id="${m.id}" aria-pressed="${m.id === st.modelId}">${m.id === st.modelId ? '선택됨' : '선택'}</button></div>
</article>`
        )
        .join('') + (st.modelId ? '<div class="show-all" style="justify-content:center;padding:14px 0"><button type="button" class="btn" id="showAll" style="height:42px">다른 차량 보기</button></div>' : '')
    : '<p class="empty">선택하신 기간에 예약 가능한 차량이 없습니다. 날짜를 바꾸거나 1644-8891로 문의해 주세요.</p>';
  $$('#carList button[data-id]').forEach((b) => b.addEventListener('click', () => {
    st.modelId = +b.dataset.id;
    render();
    // 차량번호는 고르지 않음 (차종만 선택 → 서버가 빈 차량 자동 배정)
    if (innerWidth < 760) $('.summary').scrollIntoView({ behavior: 'smooth' });
  }));
  // 모바일에서는 고른 차만 보여 줌 (화면 폭 760px 이하, CSS 로 처리)
  $('#carList').classList.toggle('picked', !!model());
  $('#showAll')?.addEventListener('click', () => { st.modelId = null; render(); $('#carList').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  summary();
}

function amounts() {
  const m = model(), i = insCur(), l = loc();
  const rent = m ? m.rent : 0;
  const insAmt = i ? i.per_day * st.days + (i.flat_fee || 0) : 0;
  // 배회차비는 서버가 대여료(rent)에 포함해서 내려줌 — 따로 더하지 않음
  return { rent, insAmt, total: rent + insAmt };
}

function summary() {
  const m = model();
  $('#noCar').hidden = !!m;
  $('#sumBody').hidden = !m;
  if (!m) return;
  const a = amounts();
  $('#sumCar').textContent = `${m.maker} ${m.name}`;
  $('#sumPeriod').textContent = `${shortDt($('#from').value)} ~ ${shortDt($('#to').value)} · ${st.periodText}`;
  $('#sumRent').textContent = won(a.rent) + '원';
  $('#sumIns').textContent = won(a.insAmt) + '원';
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
  $('#cPeriod').textContent = `${$('#from').value.replace('T', ' ')} ~ ${$('#to').value.replace('T', ' ')} (${st.periodText})`;
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
  if (!/^01\d{9}$/.test(f.phone.value.replace(/\D/g, ''))) return (err.textContent = '휴대폰 번호 11자리를 입력해 주세요. (예: 010-1234-5678)'), f.phone.focus();
  if (f.birth.value && !validBirth(f.birth.value)) return (err.textContent = '생년월일 8자리를 입력해 주세요. (예: 1990-01-01)'), f.birth.focus();
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
        website: f.website.value, agree: true, marketing: $('#agree3').checked,
      },
    });
    $('#dNo').textContent = r.no;
    $('#dCar').textContent = r.model;
    $('#dPeriod').textContent = `${r.location} · ${r.pickupAt.replace('T', ' ')} ~ ${r.returnAt.replace('T', ' ')} (${r.periodText || r.days + '일'})`;
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
