// 견적 사용자 화면 (/quote)
// 렌트료는 서버(/api/quote/calc)에서 계산해 결과 금액만 받는다. 금리 · 보험료 · 원가는 이 화면에 오지 않는다.
import { api, $, $$, esc, won } from '/assets/common.js';

const TERMS = [12, 24, 36, 48, 60];
const KMS = [10000, 15000, 20000, 25000, 30000, 35000, 40000, 50000];
const MAINT_COLS = ['엔진오일 교환', '소모품 교환', '법정검사', '사고처리 지원', '정비대행', '대차'];
const DRAFT_KEY = 'ace_quote_draft';

let ME = null, DATA = null, CFG = {}, S = null, RES = null, issued = null;
const T = () => DATA.T; // [제조사, 구분, 차종, 라인업, 트림, 기본가, 배기량, 세금구분, 정액세, 잔가그룹, 옵션[]]
const uniq = (a) => [...new Set(a)];
const num = (v) => { const t = String(v ?? '').replace(/[,\s원]/g, ''); const n = parseFloat(t); return Number.isFinite(n) ? n : 0; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const pct = (x) => (Math.round(x * 1000) / 10).toFixed(1) + '%';

function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.classList.toggle('err', !!err); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3000); }

function blankState() {
  const P = (term, dep) => ({ on: true, term, km: 30000, pre: '0', dep, rv: '', ag: '0' });
  return {
    date: today(), v: { mk: '', cat: '', model: '', line: '', trim: '' }, opts: [],
    ext: '', int: '', extra: '0', del1: String(CFG.del1 ?? 330000), del2: '0', del3: '0',
    tint: '고객자체시공', bb: '고객자체시공', otherName: '', otherAmt: '0',
    ctype: '법인', cname: '', mgr: ME?.name || '', tel: ME?.phone || '',
    P: [P(36, '10%'), P(48, '10%'), P(60, '10%')],
  };
}
function saveDraft() { try { localStorage.setItem(DRAFT_KEY + ':' + ME.id, JSON.stringify(S)); } catch {} }
function loadDraft() { try { const v = localStorage.getItem(DRAFT_KEY + ':' + ME.id); return v ? JSON.parse(v) : null; } catch { return null; } }

// ── 로그인 · 회원가입 ─────────────────────────────────
function showView(id) {
  for (const v of ['loginView', 'signupView', 'signupDone', 'appView']) $('#' + v).hidden = v !== id;
  window.scrollTo(0, 0);
}
$('#toSignup').addEventListener('click', () => { $('#signupErr').textContent = ''; showView('signupView'); $('#signupForm').username.focus(); });
$('#toLogin').addEventListener('click', () => showView('loginView'));
$('#doneLogin').addEventListener('click', () => { showView('loginView'); $('#loginForm').username.focus(); });
$('#signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, err = $('#signupErr');
  err.textContent = '';
  if (f.password.value !== f.password2.value) return (err.textContent = '비밀번호 확인이 일치하지 않습니다.');
  if (!f.agree.checked) return (err.textContent = '개인정보 수집 · 이용에 동의해 주세요.');
  $('#signupBtn').disabled = true;
  try {
    await api('/api/quote/signup', { method: 'POST', body: {
      username: f.username.value.trim(), password: f.password.value, name: f.name.value, company: f.company.value,
      phone: f.phone.value, email: f.email.value.trim(), note: f.note.value, agree: f.agree.checked, website: f.website.value,
    } });
    const id = f.username.value.trim();
    f.reset();
    $('#loginForm').username.value = id;
    showView('signupDone');
  } catch (e2) { err.textContent = e2.message; }
  finally { $('#signupBtn').disabled = false; }
});

// ── 로그인 ───────────────────────────────────────────
async function boot() {
  const { user } = await api('/api/quote/me').catch(() => ({ user: null }));
  ME = user;
  showView(user ? 'appView' : 'loginView');
  if (!user) { $('#loginForm').username.focus(); return; }
  $('#whoName').textContent = (user.name || user.username) + ' 님';
  $('#whoCompany').textContent = user.company ? '· ' + user.company : '';
  try {
    const d = await api('/api/quote/data');
    DATA = d; CFG = d.config || {};
  } catch (e) { return toast(e.message, true); }
  S = loadDraft() || blankState();
  if (!S.P || S.P.length !== 3) S = blankState();
  S.P.forEach((p) => { if (p.ag === undefined) p.ag = '0'; });
  syncInputs(); renderVehicle(); buildProducts(); recalc(true);
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  $('#loginErr').textContent = '';
  $('#loginBtn').disabled = true;
  try {
    await api('/api/quote/login', { method: 'POST', body: { username: f.username.value.trim(), password: f.password.value } });
    f.reset();
    await boot();
  } catch (err) { $('#loginErr').textContent = err.message; }
  finally { $('#loginBtn').disabled = false; }
});
$('#logoutBtn').addEventListener('click', async () => { await api('/api/quote/logout', { method: 'POST' }).catch(() => {}); boot(); });
$('#pwBtn').addEventListener('click', () => { ['#pwCur', '#pwNew', '#pwNew2'].forEach((x) => ($(x).value = '')); $('#pwErr').textContent = ''; $('#dlg').showModal(); });
$('#pwSave').addEventListener('click', async () => {
  const err = $('#pwErr');
  err.textContent = '';
  if ($('#pwNew').value.length < 8) return (err.textContent = '새 비밀번호는 8자 이상으로 정해 주세요.');
  if ($('#pwNew').value !== $('#pwNew2').value) return (err.textContent = '새 비밀번호 확인이 일치하지 않습니다.');
  try {
    await api('/api/quote/password', { method: 'POST', body: { current: $('#pwCur').value, next: $('#pwNew').value } });
    $('#dlg').close(); toast('비밀번호를 바꿨습니다.');
  } catch (e) { if (/로그인/.test(e.message)) { $('#dlg').close(); return boot(); } err.textContent = e.message; }
});
let resetArm = 0;
$('#resetBtn').addEventListener('click', () => {
  if (resetArm && Date.now() - resetArm < 4000) {
    resetArm = 0; $('#resetBtn').textContent = '새 견적';
    S = blankState(); syncInputs(); renderVehicle(); buildProducts(); recalc(true); toast('새 견적을 시작합니다.');
  } else {
    resetArm = Date.now(); $('#resetBtn').textContent = '한 번 더 누르면 초기화';
    setTimeout(() => { if (resetArm && Date.now() - resetArm >= 4000) { resetArm = 0; $('#resetBtn').textContent = '새 견적'; } }, 4100);
  }
});

// ── 차량 선택 ─────────────────────────────────────────
function curTrim() { const v = S.v; return T().find((t) => t[0] === v.mk && t[1] === v.cat && t[2] === v.model && t[3] === v.line && t[4] === v.trim) || null; }
function fill(el, items, val, ph) { el.innerHTML = `<option value="">${ph}</option>` + items.map((x) => `<option value="${esc(x)}"${x === val ? ' selected' : ''}>${esc(x || '(구분 없음)')}</option>`).join(''); }
function renderVehicle() {
  const v = S.v, all = T();
  const mks = uniq(all.map((t) => t[0])); if (!mks.includes(v.mk)) v.mk = '';
  const cats = uniq(all.filter((t) => t[0] === v.mk).map((t) => t[1])); if (!cats.includes(v.cat)) v.cat = '';
  const models = uniq(all.filter((t) => t[0] === v.mk && t[1] === v.cat).map((t) => t[2])); if (!models.includes(v.model)) v.model = '';
  const lines = uniq(all.filter((t) => t[0] === v.mk && t[1] === v.cat && t[2] === v.model).map((t) => t[3])); if (!lines.includes(v.line)) v.line = lines.length === 1 ? lines[0] : '';
  const trims = all.filter((t) => t[0] === v.mk && t[1] === v.cat && t[2] === v.model && t[3] === v.line);
  if (!trims.some((t) => t[4] === v.trim)) v.trim = '';
  fill($('#mk'), mks, v.mk, '브랜드 선택'); fill($('#cat'), cats, v.cat, '구분 선택'); fill($('#model'), models, v.model, '모델 선택'); fill($('#line'), lines, v.line, '라인업 선택');
  $('#trim').innerHTML = '<option value="">트림 선택</option>' + trims.map((t) => `<option value="${esc(t[4])}"${t[4] === v.trim ? ' selected' : ''}>${esc(t[4])} · ${won(t[5])}원</option>`).join('');
  const tr = curTrim();
  $('#opts').innerHTML = tr ? tr[10].map((o) => `<label class="q-opt"><input type="checkbox" data-opt="${esc(o[0])}"${S.opts.includes(o[0]) ? ' checked' : ''}><span class="n">${esc(o[0])}</span><span class="p">${won(o[1])}</span></label>`).join('') : '';
  const cols = DATA.C.filter((c) => c[0] === v.model);
  $('#extList').innerHTML = cols.filter((c) => c[1] === '외장').map((c) => `<option value="${esc(c[2])}">${c[3] ? '+' + won(c[3]) + '원' : ''}</option>`).join('');
  $('#intList').innerHTML = cols.filter((c) => c[1] === '내장').map((c) => `<option value="${esc(c[2])}">${c[3] ? '+' + won(c[3]) + '원' : ''}</option>`).join('');
}
['mk', 'cat', 'model', 'line', 'trim'].forEach((k, i, arr) => $('#' + k).addEventListener('change', () => {
  S.v[k] = $('#' + k).value;
  for (const j of arr.slice(i + 1)) S.v[j] = '';
  S.opts = [];
  if (k !== 'trim') { S.ext = ''; S.int = ''; syncInputs(); }
  renderVehicle(); recalc();
}));
$('#opts').addEventListener('change', (e) => {
  const n = e.target.dataset.opt; if (n === undefined) return;
  S.opts = e.target.checked ? uniq([...S.opts, n]) : S.opts.filter((x) => x !== n);
  recalc();
});

// ── 입력 칸 ───────────────────────────────────────────
const BIND = ['ext', 'int', 'extra', 'del1', 'del2', 'del3', 'tint', 'bb', 'otherName', 'otherAmt', 'ctype', 'cname', 'mgr', 'tel'];
const MONEY = ['extra', 'del1', 'del2', 'del3', 'otherAmt'];
function syncInputs() {
  for (const k of BIND) $('#' + k).value = MONEY.includes(k) ? won(num(S[k])) : S[k] ?? '';
  $('#qdate').value = S.date;
}
for (const k of BIND) $('#' + k).addEventListener('input', () => { S[k] = $('#' + k).value; recalc(); });
for (const k of MONEY) $('#' + k).addEventListener('blur', () => ($('#' + k).value = won(num(S[k]))));
$('#qdate').addEventListener('input', () => { S.date = $('#qdate').value; renderPaper(); saveDraft(); });

// ── 상품 조건 ─────────────────────────────────────────
function buildProducts() {
  const sel = (i, k, list, fmt) => `<select class="select" id="p${i}${k}" data-p="${i}" data-k="${k}">${list.map((x) => `<option value="${x}"${+S.P[i][k] === x ? ' selected' : ''}>${fmt(x)}</option>`).join('')}</select>`;
  const inp = (i, k, ph) => `<input class="input num" id="p${i}${k}" data-p="${i}" data-k="${k}" value="${esc(S.P[i][k])}" placeholder="${ph}"><span class="sub" id="s${i}${k}"></span>`;
  const row = (label, f) => `<tr><th scope="row">${label}</th>${S.P.map((_, i) => `<td>${f(i)}</td>`).join('')}</tr>`;
  const res = (label, k, cls = '') => `<tr class="res ${cls}"><th scope="row">${label}</th>${S.P.map((_, i) => `<td id="r${i}${k}"></td>`).join('')}</tr>`;
  $('#pt').innerHTML = `<thead><tr><th></th>${S.P.map((p, i) => `<th><label class="colhead"><input type="checkbox" data-p="${i}" data-k="on"${p.on ? ' checked' : ''}> 상품 ${i + 1}</label></th>`).join('')}</tr></thead><tbody>
${row('기간', (i) => sel(i, 'term', TERMS, (x) => x + '개월'))}
${row('약정거리 (km/년)', (i) => sel(i, 'km', KMS, (x) => won(x)))}
${row('선납금 (% 또는 원)', (i) => inp(i, 'pre', '0'))}
${row('보증금 (% 또는 원)', (i) => inp(i, 'dep', '10%'))}
${row('잔가율 (%)', (i) => inp(i, 'rv', '최대'))}
${row('AG수수료 (% 또는 원)', (i) => inp(i, 'ag', '0'))}
${res('월 렌트료 (공급가)', 'sup')}${res('부가세', 'vat')}${res('월 납입금', 'mon', 'main')}${res('출고 전 납입', 'up')}
</tbody>`;
}
$('#pt').addEventListener('input', (e) => {
  const t = e.target; if (t.dataset.p === undefined) return;
  S.P[+t.dataset.p][t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value;
  recalc();
});
$('#pt').addEventListener('change', (e) => {
  const t = e.target; if (t.dataset.p === undefined) return;
  S.P[+t.dataset.p][t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value;
  recalc();
});

// ── 서버 계산 ─────────────────────────────────────────
let seq = 0, timer = 0;
function payload() { return { ...S, extra: num(S.extra), del1: num(S.del1), del2: num(S.del2), del3: num(S.del3), otherAmt: num(S.otherAmt) }; }
function recalc(now) {
  issued = null;
  saveDraft();
  renderLocal();
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const my = ++seq;
    if (!curTrim()) { RES = null; renderResults(); return; }
    try {
      const r = await api('/api/quote/calc', { method: 'POST', body: payload() });
      if (my !== seq) return;
      RES = r; renderResults();
    } catch (e) {
      if (/로그인/.test(e.message)) return boot();
      toast(e.message, true);
    }
  }, now ? 0 : 250);
}

function renderLocal() {
  const tr = curTrim(), v = S.v;
  let msg = '✔ 선택 완료';
  if (!v.mk) msg = '브랜드를 선택하세요'; else if (!v.cat) msg = '구분을 선택하세요'; else if (!v.model) msg = '모델을 선택하세요'; else if (!v.line && !tr) msg = '라인업을 선택하세요'; else if (!tr) msg = '트림을 선택하세요';
  $('#vehStatus').textContent = msg; $('#vehStatus').classList.toggle('bad', !tr);
  $('#vehTag').textContent = tr ? `${v.model} ${v.trim}` : '미선택';
  $('#prodTag').textContent = S.P.filter((p) => p.on).length + '개 견적서 표시';
  if (tr) {
    const optSum = tr[10].filter((o) => S.opts.includes(o[0])).reduce((a, o) => a + o[1], 0);
    const price = tr[5] + optSum + num(S.extra);
    $('#priceBox').innerHTML = `<div><span>기본가격</span>${won(tr[5])}</div><div><span>옵션</span>${won(optSum)}</div><div><span>추가금</span>${won(num(S.extra))}</div><div class="big"><span>차량가격</span>${won(price)}원</div>`;
  } else $('#priceBox').innerHTML = '';
  const cols = DATA.C.filter((c) => c[0] === v.model);
  const add = (name, kind) => (cols.find((c) => c[1] === kind && c[2] === name) || [0, 0, 0, 0])[3];
  const ca = add(S.ext, '외장') + add(S.int, '내장');
  $('#colorNote').textContent = ca ? `선택한 색상에 추가금 ${won(ca)}원이 있습니다. 색상 · 기타 추가금 칸에 넣어 주세요.` : cols.length ? '색상 칸을 누르면 이 모델의 색상 목록이 나옵니다.' : '';
}

function renderResults() {
  const ps = RES?.ok ? RES.products : null;
  S.P.forEach((p, i) => {
    const o = ps?.[i];
    const set = (k, v) => { const el = $('#r' + i + k); if (el) { el.textContent = v; el.classList.remove('err'); } };
    ['pre', 'dep', 'rv', 'ag'].forEach((k) => { const s = $('#s' + i + k); if (s) { s.textContent = ''; s.classList.remove('warn'); } });
    if (!o) { ['sup', 'vat', 'mon', 'up'].forEach((k) => set(k, '-')); return; }
    if (o.error) {
      ['sup', 'vat', 'up'].forEach((k) => set(k, ''));
      const el = $('#r' + i + 'mon'); el.textContent = o.error; el.classList.add('err');
      return;
    }
    $('#s' + i + 'pre').textContent = won(o.pre) + '원';
    $('#s' + i + 'dep').textContent = won(o.dep) + '원';
    $('#s' + i + 'ag').textContent = won(o.agUser) + '원';
    const rs = $('#s' + i + 'rv');
    rs.textContent = o.rvCapped ? `최대 ${pct(o.rvMax)}까지 · ${pct(o.rv)} 적용` : `${pct(o.rv)} 적용 (최대 ${pct(o.rvMax)})`;
    rs.classList.toggle('warn', !!o.rvCapped);
    set('sup', won(o.supply)); set('vat', won(o.vat)); set('mon', won(o.month)); set('up', won(o.upfront));
  });
  const ok = !!ps && S.P.some((p, i) => p.on && ps[i] && !ps[i].error) && !S.P.some((p, i) => p.on && ps[i]?.error);
  $('#issueBtn').disabled = !ok;
  $('#jpgBtn').disabled = !ok;
  renderPaper();
}

// ── 고객 견적서 ───────────────────────────────────────
function renderPaper() {
  const tr = curTrim(), v = S.v;
  const ps = RES?.ok ? RES.products : [];
  const on = S.P.map((p, i) => [ps[i], p]).filter(([o, p]) => p.on && o && !o.error);
  const veh = RES?.ok ? RES.vehicle : null;
  const mgrLine = [S.mgr, S.tel].filter(Boolean).join(' / ');
  const optList = veh ? veh.optList : [];
  const optTxt = !optList.length ? '선택 옵션 없음' : optList.map((o) => `${o[0]} (${won(o[1])})`).join('\n') + `\n옵션 합계 ${won(veh.optSum)}원`;
  const cc = tr && tr[6] > 0 ? won(tr[6]) + 'cc' : tr && tr[7] === '전기' ? '전기차' : '-';
  const inst = `썬팅 : ${S.tint}   /   블랙박스 : ${S.bb}${S.otherName ? '   /   기타 : ' + S.otherName : ''}`;
  const cell = (f, cls) => on.map(([o, p]) => `<td${cls ? ` class="${cls}"` : ''}>${f(o, p)}</td>`).join('');
  const d = S.date ? S.date.replace(/-/g, '. ') + '.' : '';
  let h = `<div class="doc-top"><div class="doc-l"><img class="logo" src="/assets/logo-quote.png" alt="${esc(CFG.company)}"><div class="t"><h1 class="doc-title">장기렌트 견적서</h1><div class="doc-sub">LONG-TERM RENTAL QUOTATION</div></div></div>
<div class="doc-co"><b>${esc(CFG.company)}</b>${esc(mgrLine)}</div></div>
<div class="meta"><div class="to">${esc(S.cname || '　　　　　　')}<small>고객님 귀중</small></div>
<div class="meta-r">${issued ? '견적번호 ' + esc(issued.no) + '<br>' : ''}작성일 ${esc(d)}${mgrLine ? '<br>담당자 ' + esc(mgrLine) : ''}</div></div>
<h3>차량정보</h3>
<table><tr><th>모델</th><td>${esc(tr ? v.mk + ' ' + v.model : '-')}</td></tr>
<tr><th>세부모델</th><td>${esc(tr ? `${v.line} ${v.trim}  (기본가 ${won(tr[5])}원)` : '-')}</td></tr>
<tr><th>색상</th><td>외장 : ${esc(S.ext || '-')}　/　내장 : ${esc(S.int || '-')}</td></tr>
<tr><th>옵션</th><td class="pre">${esc(optTxt)}</td></tr>
<tr><th>배기량</th><td>${esc(cc)}</td></tr>
<tr><th>차량가격</th><td><b>${veh ? won(veh.price) + '원' : '-'}</b> <span style="color:var(--p-muted)">(VAT 포함)</span></td></tr>
<tr><th>썬팅 / 블랙박스</th><td>${esc(inst)}</td></tr></table>
<h3>계약정보</h3>`;
  if (!on.length) h += '<div class="guide">차량과 상품 조건을 입력하면 계약정보가 표시됩니다.</div>';
  else h += `<table class="k"><tr><th></th>${on.map(([o]) => `<th class="prod">${o.n}개월</th>`).join('')}</tr>
<tr><th>만기처리</th>${cell(() => esc(CFG.maturity || '반납형'), 'c')}</tr>
<tr><th>정비상품</th>${cell(() => 'Self', 'c')}</tr>
<tr><th>약정거리</th>${cell((o) => won(o.km) + 'km/년')}</tr>
<tr><th>선납금</th>${cell((o) => won(o.pre) + '원')}</tr>
<tr><th>보증금</th>${cell((o) => won(o.dep) + '원')}</tr>
<tr><th>잔존가치</th>${cell((o) => `<div class="split"><span>${pct(o.rv)}</span><span>${won(o.rvAmtVat)}원</span></div>`)}</tr>
<tr><th>렌트료 공급가</th>${cell((o) => won(o.supply) + '원')}</tr>
<tr><th>부가세</th>${cell((o) => won(o.vat) + '원')}</tr>
<tr class="total"><th>월 렌트료</th>${cell((o) => won(o.month) + '원')}</tr></table>
<div class="fine">※ 잔존가치는 차량가격(VAT 포함) 기준입니다. 선납금은 월 렌트료 할인에 반영되었습니다. 선납금/보증금 입금 계좌 : 고객별 전용 가상계좌 발급</div>`;
  const ins = veh?.ins || {};
  const iv = (k) => esc(ins[k] || '-');
  h += `<h3>보험 담보 조건 및 면책금</h3>
<table class="grid6"><tr><th>운전가능연령</th><th>대인</th><th>대물</th><th>자기신체사고</th><th>자차 한도</th><th>무보험차상해</th></tr>
<tr><td>${esc(CFG.insAge)}</td><td>${iv('bi')}</td><td>${iv('pd')}</td><td>${iv('self')}</td><td>${iv('car')}</td><td>${iv('un')}</td></tr></table>
<table class="grid6" style="margin-top:6px"><tr><th>대인 면책금</th><th>대물 면책금</th><th>자손 면책금</th><th>자차 면책금</th></tr>
<tr><td>${iv('dBi')}</td><td>${iv('dPd')}</td><td>${iv('dSelf')}</td><td>${iv('dCar')}</td></tr></table>
<div class="fine">※ 긴급출동서비스 : 비상급유, 배터리충전, 긴급견인, 타이어펑크교체 등${CFG.call ? '  /  사고접수 · 긴급출동 : ' + esc(CFG.call) : ''}${CFG.insNote ? '<br>※ ' + esc(CFG.insNote) : ''}</div>
<h3>정비상품 안내</h3>
<table class="grid6"><tr><th>정비서비스</th>${MAINT_COLS.map((c) => `<th>${c.replace(' ', '<br>')}</th>`).join('')}</tr>
<tr><td><b>Self</b></td>${MAINT_COLS.map(() => '<td>-</td>').join('')}</tr></table>
<div class="fine">※ ● 포함  /  - 미포함</div>
<h3>안내사항</h3>
<div class="guide">${esc(CFG.guide)}</div>
<div class="sign"><div><span>회사명</span><b class="stamp">${esc(CFG.company)}</b></div>${mgrLine ? `<div><span>담당자 / 연락처</span>${esc(mgrLine)}</div>` : ''}</div>`;
  $('#paper').innerHTML = h;
  fitPaper();
}
function fitPaper() {
  const stage = $('#stage'), paper = $('#paper');
  if (!stage || !paper) return;
  const s = Math.min(1, (stage.clientWidth - 28) / 794);
  $('#scaler').style.transform = `scale(${s})`;
  stage.style.height = paper.offsetHeight * s + 28 + 'px';
}
new ResizeObserver(fitPaper).observe($('#stage'));

// ── 견적서 발행: 서버에 기록하고 견적번호를 받은 뒤 PDF · JPG 저장 ──
// 입력을 바꾸지 않은 같은 견적이면 PDF·JPG 를 둘 다 받아도 발행 기록은 한 번만 남긴다.
async function ensureIssued() {
  if (issued) return issued.no;
  const r = await api('/api/quote/issue', { method: 'POST', body: payload() });
  RES = r; issued = { no: r.no };
  renderPaper();
  return r.no;
}

// 견적서 화면을 A4 폭 이미지로 그린다
async function paperCanvas() {
  await document.fonts.ready;
  const off = $('#offscreen'); off.innerHTML = '';
  const clone = $('#paper').cloneNode(true); clone.id = 'paperClone'; clone.style.boxShadow = 'none'; off.appendChild(clone);
  await Promise.all([...clone.querySelectorAll('img')].map((im) => (im.complete ? 0 : new Promise((res) => { im.onload = im.onerror = res; }))));
  try {
    return await window.html2canvas(clone, { scale: 2, backgroundColor: '#ffffff', useCORS: true, width: 794, windowWidth: 900 });
  } finally {
    off.innerHTML = '';
  }
}

// 파일로 내려받기: 만든 파일을 서버(/api/quote/file)에 보내 '이름이 붙은 첨부파일'로 받는다.
// 브라우저 안 Blob 저장은 일부 Chrome 환경 · 카카오톡 등 앱 안 브라우저에서 파일 이름이 사라지거나 저장되지 않음
function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(new Error('견적서 파일을 읽지 못했습니다.'));
    r.readAsDataURL(blob);
  });
}
async function saveBlob(blob, name) {
  const kind = name.toLowerCase().endsWith('.jpg') ? 'jpg' : 'pdf';
  const data = await blobToBase64(blob);
  const f = document.createElement('form');
  f.method = 'POST'; f.action = '/api/quote/file'; f.enctype = 'multipart/form-data'; f.hidden = true;
  for (const [k, v] of [['kind', kind], ['name', name], ['data', data]]) {
    const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.appendChild(i);
  }
  document.body.appendChild(f); f.submit(); f.remove();
}

const fileName = (no, ext) => `견적서_${no}_${S.cname || '고객'}_${S.v.model}`.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '') + '.' + ext;

async function download(kind) {
  const btn = $(kind === 'pdf' ? '#issueBtn' : '#jpgBtn');
  const both = [$('#issueBtn'), $('#jpgBtn')];
  both.forEach((b) => (b.disabled = true));
  const label = btn.textContent; btn.textContent = '만드는 중…';
  try {
    const no = await ensureIssued();
    const canvas = await paperCanvas();
    if (kind === 'pdf') {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      let w = 210, h = (canvas.height * 210) / canvas.width, x = 0;
      if (h > 297) { w = (210 * 297) / h; h = 297; x = (210 - w) / 2; }
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', x, 0, w, h);
      await saveBlob(pdf.output('blob'), fileName(no, 'pdf'));
    } else {
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.95));
      await saveBlob(blob, fileName(no, 'jpg'));
    }
    toast(`견적서 ${no} ${kind.toUpperCase()}를 내려받았습니다.`);
  } catch (e) {
    if (/로그인/.test(e.message)) return boot();
    toast(e.message || '견적서 파일을 만들지 못했습니다. 잠시 후 다시 눌러 주세요.', true);
  } finally {
    btn.textContent = label;
    both.forEach((b) => (b.disabled = false));
  }
}
$('#issueBtn').addEventListener('click', () => download('pdf'));
$('#jpgBtn').addEventListener('click', () => download('jpg'));

boot();
