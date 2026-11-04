// 에이스렌터카 홈페이지 관리자
import { api, $, $$, esc, won, classImage } from '/assets/common.js';
import { shrink } from '/assets/shrink.js';
import { quote, rateAmount, DEFAULT_PRICING } from '/assets/longcalc.js';

const main = $('#main');
const RES_ST = { pending: ['확정 대기', 'st-wait'], confirmed: ['확정', 'st-ok'], done: ['반납 완료', 'st-off'], cancelled: ['취소', 'st-off'] };
const APP_ST = { review: ['심사 대기', 'st-wait'], approved: ['승인', 'st-ok'], contracted: ['계약 완료', 'st-off'], rejected: ['부결', 'st-off'], cancelled: ['취소', 'st-off'] };
const LONG_ST = { available: '출고 가능', soon: '출고 예정 (반납 대기)', reserved: '상담 진행 중', contracted: '계약 완료' };
const badge = (map, s) => `<span class="st ${(map[s] || ['', 'st-off'])[1]}">${esc((map[s] || [s])[0])}</span>`;
const dt = (s) => (s || '').replace('T', ' ').slice(0, 16);
const kst = (s) => {
  // DB 의 datetime('now') 는 UTC → 한국시간 표시
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return isNaN(d) ? s : new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
};
const opts = (list, cur) => list.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(t)}</option>`).join('');

export function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', !!err);
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 2600);
}
async function run(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    return r;
  } catch (e) {
    if (/로그인/.test(e.message)) return boot();
    toast(e.message, true);
    throw e;
  }
}
function confirmBox(message, okLabel = '확인') {
  return new Promise((resolve) => {
    const d = $('#dlg');
    $('#dlgBody').innerHTML = `<p style="margin:0;white-space:pre-line">${esc(message)}</p><div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-sm" value="no">취소</button><button class="btn btn-red btn-sm" value="yes">${esc(okLabel)}</button></div>`;
    d.onclose = () => resolve(d.returnValue === 'yes');
    d.showModal();
  });
}

// ── 로그인 ─────────────────────────────────────────
let me = null;
async function boot() {
  const r = await api('/api/admin/me');
  me = r.admin;
  if (!me) {
    $('#appView').hidden = true;
    $('#loginView').hidden = false;
    const setup = r.needsSetup;
    $('#loginHint').hidden = !setup;
    $('#setupName').hidden = !setup;
    $('#loginTitle').textContent = setup ? '관리자 계정 만들기' : '홈페이지 관리자';
    $('#loginBtn').textContent = setup ? '계정 만들고 시작하기' : '로그인';
    $('#loginForm').dataset.setup = setup ? '1' : '';
    $('#loginForm').password.setAttribute('autocomplete', setup ? 'new-password' : 'current-password');
    return;
  }
  // 견적기에서 로그인하러 온 경우 로그인 후 바로 돌려보냄
  if (new URLSearchParams(location.search).get('next') === 'quote') {
    location.replace('/admin/quote');
    return;
  }
  $('#loginView').hidden = true;
  $('#appView').hidden = false;
  $('#whoami').textContent = `${me.name || me.username} 님`;
  api('/api/admin/settings').then((s) => ($('#erpState').textContent = s.erpEnabled ? '● rentcarerp 연동 중' : 'rentcarerp 연동 전 (임시 차량 목록 사용)')).catch(() => {});
  refreshCounts();
  route();
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  $('#loginErr').textContent = '';
  const setup = !!f.dataset.setup;
  try {
    await api(setup ? '/api/admin/setup' : '/api/admin/login', { method: 'POST', body: { username: f.username.value, password: f.password.value, name: f.name.value } });
    f.reset();
    boot();
  } catch (err) {
    $('#loginErr').textContent = err.message;
  }
});
// 비밀번호 변경 창 (상단 버튼)
function openPasswordDialog() {
  const d = $('#dlg');
  $('#dlgBody').innerHTML = `<h2 style="font-size:17px">내 비밀번호 변경</h2>
<label class="field">현재 비밀번호<input class="input" id="dpCur" type="password" autocomplete="current-password"></label>
<label class="field">새 비밀번호 (8자 이상)<input class="input" id="dpNew" type="password" autocomplete="new-password"></label>
<label class="field">새 비밀번호 확인<input class="input" id="dpNew2" type="password" autocomplete="new-password"></label>
<p class="error-msg" id="dpErr" role="alert" style="margin:0"></p>
<p class="hint" style="margin:0">바꾸면 다른 기기에 로그인된 화면은 자동으로 로그아웃됩니다.</p>
<div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-sm" value="close" formnovalidate>취소</button><button class="btn btn-red btn-sm" type="button" id="dpSave">변경</button></div>`;
  d.showModal();
  $('#dpCur').focus();
  $('#dpSave').addEventListener('click', async () => {
    const err = $('#dpErr');
    err.textContent = '';
    if ($('#dpNew').value.length < 8) return (err.textContent = '새 비밀번호는 8자 이상으로 정해 주세요.');
    if ($('#dpNew').value !== $('#dpNew2').value) return (err.textContent = '새 비밀번호 확인이 일치하지 않습니다.');
    try {
      await api('/api/admin/password', { method: 'POST', body: { current: $('#dpCur').value, next: $('#dpNew').value } });
      d.close();
      toast('비밀번호를 바꿨습니다.');
    } catch (e) {
      err.textContent = e.message;
    }
  });
}
$('#pwBtn').addEventListener('click', openPasswordDialog);

$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' });
  location.hash = '';
  boot();
});
$('.a-menu').addEventListener('click', () => {
  const n = $('.a-nav');
  n.classList.toggle('open');
  $('.a-menu').setAttribute('aria-expanded', n.classList.contains('open'));
});

async function refreshCounts() {
  try {
    const d = await api('/api/admin/dashboard');
    $('#cntShort').textContent = d.pendingShort || '';
    $('#cntLong').textContent = d.reviewLong || '';
    $('#cntInq').textContent = d.waitInquiry || '';
    $('#cntMail').textContent = d.mailFailed || '';
    return d;
  } catch {
    return null;
  }
}

// ── 화면 이동 ──────────────────────────────────────
const PAGES = {};
function route() {
  if (!me) return;
  const [name, arg] = (location.hash.slice(1).split('?')[0] || 'reservations').split('/');
  const page = PAGES[name] || PAGES.reservations;
  $$('.a-nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + (PAGES[name] ? name : 'reservations')));
  $('.a-nav').classList.remove('open');
  main.innerHTML = '<p class="loading">불러오는 중…</p>';
  page(arg).catch((e) => {
    if (/로그인/.test(e.message)) return boot();
    main.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  });
  main.focus({ preventScroll: true });
}
addEventListener('hashchange', route);

// ── 단기 예약 ──────────────────────────────────────
PAGES.reservations = async () => {
  const d = await refreshCounts();
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const status = sessionStorage.getItem('resStatus') ?? 'pending';
  const text = sessionStorage.getItem('resQ') || '';
  const r = await api(`/api/admin/reservations?status=${status}&q=${encodeURIComponent(text)}`);
  main.innerHTML = `
<div class="a-title"><div><h1>단기 예약</h1><p class="desc">홈페이지 예약이 들어오면 '확정 대기'로 차량이 잡힙니다. 배차 후 '확정'으로 바꾸고 고객에게 안내해 주세요.</p></div>
<div style="display:flex;gap:6px"><a class="btn btn-sm" href="/api/admin/export/reservations">엑셀(CSV) 다운로드</a></div></div>
${d ? `<div class="stats"><div><span>확정 대기</span><strong class="red">${d.pendingShort}</strong></div><div><span>오늘 출고 예정</span><strong>${d.todayPickup}</strong></div><div><span>중장기 심사 대기</span><strong>${d.reviewLong}</strong></div><div><span>답변 대기 문의</span><strong>${d.waitInquiry}</strong></div><div><span>이번 달 홈페이지 접수</span><strong>${d.monthTotal}</strong></div></div>` : ''}
<div class="box">
<div class="toolbar">
<select class="select" id="fStatus" aria-label="상태">${opts([['', '전체 상태'], ...Object.entries(RES_ST).map(([k, v]) => [k, v[0]])], status)}</select>
<input class="input" id="fQ" type="search" placeholder="고객명 · 연락처 · 신청번호" value="${esc(text)}" aria-label="검색">
<button class="btn btn-sm btn-black" id="fGo">검색</button>
</div>
<div class="scroll-x"><table class="a-table" style="min-width:1000px">
<thead><tr><th>신청번호</th><th>고객</th><th>차종</th><th>대여 기간 · 장소</th><th>보험 · 옵션</th><th class="num">예상 요금</th><th>상태</th><th>메일</th></tr></thead>
<tbody>${r.reservations.length ? r.reservations.map((x) => `<tr class="click" data-id="${x.id}"><td>${esc(x.no)}<br><span class="hint">${kst(x.created_at)}</span></td><td>${esc(x.name)}<br><span class="hint">${esc(x.phone)}</span></td><td>${esc(x.model_name)}${x.vehicle_ref ? `<br><span class="hint">배정 ${esc(x.vehicle_ref)}</span>` : ''}</td><td>${dt(x.pickup_at)} ~ ${dt(x.return_at)} (${x.days}일)<br><span class="hint">${esc(x.location_name)}</span></td><td>${esc(x.insurance_name)}${JSON.parse(x.options || '[]').length ? '<br><span class="hint">' + esc(JSON.parse(x.options).join(', ')) + '</span>' : ''}</td><td class="num">${won(x.total_amt)}원</td><td>${badge(RES_ST, x.status)}</td><td><a class="hint" href="#notify">${esc(x.mail || '-')}</a></td></tr>`).join('') : '<tr><td colspan="8" class="muted" style="padding:40px;text-align:center">해당하는 예약이 없습니다.</td></tr>'}</tbody>
</table></div></div>
<div id="detail"></div>`;
  const go = () => { sessionStorage.setItem('resStatus', $('#fStatus').value); sessionStorage.setItem('resQ', $('#fQ').value); route(); };
  $('#fGo').addEventListener('click', go);
  $('#fStatus').addEventListener('change', go);
  $('#fQ').addEventListener('keydown', (e) => e.key === 'Enter' && go());
  $$('tr[data-id]').forEach((tr) =>
    tr.addEventListener('click', () => {
      $$('tr[data-id]').forEach((t) => t.classList.toggle('sel', t === tr));
      const x = r.reservations.find((y) => y.id === +tr.dataset.id);
      $('#detail').innerHTML = `<div class="box box-pad" style="display:flex;flex-direction:column;gap:14px">
<div class="a-title"><h2 style="font-size:17px">${esc(x.no)} · ${esc(x.name)}</h2>${badge(RES_ST, x.status)}</div>
<div class="split"><div class="l"><dl class="dl">
<dt>연락처</dt><dd><a href="tel:${esc(x.phone)}">${esc(x.phone)}</a></dd><dt>생년월일 · 면허</dt><dd>${esc(x.birth || '-')} · ${esc(x.license || '-')}</dd>
<dt>차종</dt><dd>${esc(x.model_name)} (1일 ${won(x.day_rate)}원)</dd><dt>장소</dt><dd>${esc(x.location_name)}${x.location_fee ? ` (+${won(x.location_fee)}원)` : ''}</dd>
<dt>기간</dt><dd>${dt(x.pickup_at)} ~ ${dt(x.return_at)} · ${x.days}일</dd><dt>보험</dt><dd>${esc(x.insurance_name || '-')} ${x.insurance_amt ? `(${won(x.insurance_amt)}원)` : ''}</dd>
<dt>옵션</dt><dd>${esc(JSON.parse(x.options || '[]').join(', ') || '-')}</dd><dt>예상 요금</dt><dd><strong>${won(x.total_amt)}원</strong></dd>
<dt>항공편</dt><dd>${esc(x.flight || '-')}</dd><dt>요청 사항</dt><dd>${esc(x.request || '-')}</dd>
<dt>ERP 반영</dt><dd>${x.erp_synced ? 'rentcarerp 가예약 완료' : '미반영'}</dd></dl></div>
<div class="r" style="display:flex;flex-direction:column;gap:10px">
<label class="field">상태<select class="select" id="dStatus">${opts(Object.entries(RES_ST).map(([k, v]) => [k, v[0]]), x.status)}</select></label>
<label class="field">배정 차량 (차량번호)<input class="input" id="dVeh" value="${esc(x.vehicle_ref)}"></label>
<label class="field">관리 메모 (고객에게 안 보임)<textarea class="textarea" id="dMemo" rows="3">${esc(x.admin_memo)}</textarea></label>
<div style="display:flex;justify-content:flex-end"><button class="btn btn-red btn-sm" id="dSave">저장</button></div>
</div></div></div>`;
      $('#dSave').addEventListener('click', async () => {
        await run(() => api(`/api/admin/reservations/${x.id}`, { method: 'PATCH', body: { status: $('#dStatus').value, vehicle_ref: $('#dVeh').value, admin_memo: $('#dMemo').value } }), '저장했습니다.');
        route();
      });
      $('#detail').scrollIntoView({ behavior: 'smooth' });
    })
  );
};

// ── 중장기 신청 · 법인 견적 ─────────────────────────
PAGES.applications = async () => {
  const status = sessionStorage.getItem('appStatus') ?? 'review';
  const r = await api(`/api/admin/applications?status=${status}`);
  main.innerHTML = `
<div class="a-title"><div><h1>중장기 신청 · 법인 견적</h1><p class="desc">차량별 신청이 들어오면 그 차량은 '상담 진행 중'으로 표시됩니다. 계약 완료로 바꾸면 목록에서 자동으로 내려갑니다.</p></div>
<a class="btn btn-sm" href="/api/admin/export/applications">엑셀(CSV) 다운로드</a></div>
<div class="box"><div class="toolbar"><select class="select" id="fStatus" aria-label="상태">${opts([['', '전체 상태'], ...Object.entries(APP_ST).map(([k, v]) => [k, v[0]])], status)}</select></div>
<div class="scroll-x"><table class="a-table" style="min-width:960px">
<thead><tr><th>신청번호</th><th>구분</th><th>신청자</th><th>차량</th><th>조건</th><th class="num">월 렌트료</th><th>상태</th><th>메일</th></tr></thead>
<tbody>${r.applications.length ? r.applications.map((x) => `<tr class="click" data-id="${x.id}"><td>${esc(x.no)}<br><span class="hint">${kst(x.created_at)}</span></td><td>${x.applicant_type === 'corp' ? '<strong>법인</strong>' : '개인'}</td><td>${esc(x.company ? x.company + ' · ' : '')}${esc(x.name)}<br><span class="hint">${esc(x.phone)}</span></td><td>${esc(x.vehicle_name || '-')}</td><td>${x.term ? `${x.term}개월 · 보증금 ${x.deposit_amt ? won(x.deposit_amt) + '원' : '없음'}${x.prepay_amt ? ' · 선납 ' + won(x.prepay_amt) + '원' : ''}<br><span class="hint">${esc(x.extra || x.km)}</span>` : esc(x.qty || '-')}</td><td class="num">${x.monthly ? won(x.monthly) + '원' : '-'}</td><td>${badge(APP_ST, x.status)}</td><td class="hint">${esc(x.mail || '-')}</td></tr>`).join('') : '<tr><td colspan="8" class="muted" style="padding:40px;text-align:center">해당하는 신청이 없습니다.</td></tr>'}</tbody>
</table></div></div><div id="detail"></div>`;
  $('#fStatus').addEventListener('change', () => { sessionStorage.setItem('appStatus', $('#fStatus').value); route(); });
  $$('tr[data-id]').forEach((tr) =>
    tr.addEventListener('click', () => {
      $$('tr[data-id]').forEach((t) => t.classList.toggle('sel', t === tr));
      const x = r.applications.find((y) => y.id === +tr.dataset.id);
      $('#detail').innerHTML = `<div class="box box-pad" style="display:flex;flex-direction:column;gap:14px">
<div class="a-title"><h2 style="font-size:17px">${esc(x.no)} · ${esc(x.company || x.name)}</h2>${badge(APP_ST, x.status)}</div>
<div class="split"><div class="l"><dl class="dl">
${x.company ? `<dt>법인명</dt><dd>${esc(x.company)}</dd><dt>사업자번호</dt><dd>${esc(x.biz_no || '-')}</dd><dt>필요 대수</dt><dd>${esc(x.qty || '-')}</dd>` : ''}
<dt>${x.applicant_type === 'corp' ? '담당자' : '이름'}</dt><dd>${esc(x.name)}</dd><dt>연락처</dt><dd><a href="tel:${esc(x.phone)}">${esc(x.phone)}</a></dd>
<dt>차량</dt><dd>${esc(x.vehicle_name || '-')}</dd>
<dt>조건</dt><dd>${x.term ? `${x.term}개월 · ${esc(x.extra || x.km)}` : '-'}</dd>
<dt>보증금</dt><dd>${won(x.deposit_amt)}원${x.dep_pct ? ` (${x.dep_pct}%)` : ''}</dd><dt>선납금</dt><dd>${won(x.prepay_amt || 0)}원</dd><dt>월 렌트료</dt><dd><strong>${x.monthly ? won(x.monthly) + '원' : '-'}</strong></dd>
<dt>희망 출고일</dt><dd>${esc(x.wish_date || '-')}</dd><dt>요청 사항</dt><dd>${esc(x.request || '-')}</dd></dl></div>
<div class="r" style="display:flex;flex-direction:column;gap:10px">
<label class="field">상태<select class="select" id="dStatus">${opts(Object.entries(APP_ST).map(([k, v]) => [k, v[0]]), x.status)}</select></label>
<label class="field">심사 · 상담 메모<textarea class="textarea" id="dMemo" rows="4">${esc(x.admin_memo)}</textarea></label>
<div style="display:flex;justify-content:flex-end"><button class="btn btn-red btn-sm" id="dSave">저장</button></div></div></div></div>`;
      $('#dSave').addEventListener('click', async () => {
        await run(() => api(`/api/admin/applications/${x.id}`, { method: 'PATCH', body: { status: $('#dStatus').value, admin_memo: $('#dMemo').value } }), '저장했습니다.');
        refreshCounts();
        route();
      });
      $('#detail').scrollIntoView({ behavior: 'smooth' });
    })
  );
};

// ── 고객 ───────────────────────────────────────────
PAGES.customers = async (arg) => {
  const q = sessionStorage.getItem('cusQ') || '';
  const kind = sessionStorage.getItem('cusKind') || '';
  const r = await api(`/api/admin/customers?q=${encodeURIComponent(q)}&kind=${encodeURIComponent(kind)}`);
  main.innerHTML = `
<div class="a-title"><div><h1>고객 관리</h1><p class="desc">예약 · 신청 · 문의를 남긴 고객이 연락처 기준으로 자동 등록됩니다.</p></div><a class="btn btn-sm" href="/api/admin/export/customers">엑셀(CSV) 다운로드</a></div>
<div class="box"><div class="toolbar">
<input class="input" id="fQ" type="search" placeholder="이름 · 연락처 · 법인명" value="${esc(q)}" aria-label="검색">
<select class="select" id="fKind" aria-label="구분">${opts([['', '전체'], ['개인', '개인'], ['개인사업자', '개인사업자'], ['법인', '법인']], kind)}</select>
<button class="btn btn-sm btn-black" id="fGo">검색</button></div>
<div class="scroll-x"><table class="a-table" style="min-width:760px"><thead><tr><th>고객</th><th>구분</th><th>연락처</th><th class="num">단기 예약</th><th class="num">중장기 신청</th><th class="num">문의</th><th>최근 활동</th></tr></thead>
<tbody>${r.customers.length ? r.customers.map((c) => `<tr class="click" data-id="${c.id}"><td><strong>${esc(c.company || c.name)}</strong>${c.company ? `<br><span class="hint">${esc(c.name)}</span>` : ''}</td><td>${esc(c.kind)}</td><td>${esc(c.phone)}</td><td class="num">${c.res_n}</td><td class="num">${c.app_n}</td><td class="num">${c.inq_n}</td><td class="hint">${kst(c.updated_at)}</td></tr>`).join('') : '<tr><td colspan="7" class="muted" style="padding:40px;text-align:center">고객이 없습니다.</td></tr>'}</tbody></table></div></div>
<div id="detail"></div>`;
  const go = () => { sessionStorage.setItem('cusQ', $('#fQ').value); sessionStorage.setItem('cusKind', $('#fKind').value); route(); };
  $('#fGo').addEventListener('click', go);
  $('#fQ').addEventListener('keydown', (e) => e.key === 'Enter' && go());
  $('#fKind').addEventListener('change', go);
  const open = async (id) => {
    $$('tr[data-id]').forEach((t) => t.classList.toggle('sel', +t.dataset.id === id));
    const d = await run(() => api('/api/admin/customers/' + id));
    const c = d.customer;
    const hist = [
      ...d.reservations.map((x) => [x.created_at, '단기 예약', `${x.no} · ${x.model_name} · ${dt(x.pickup_at)} ~ ${dt(x.return_at)} · ${x.location_name} · ${won(x.total_amt)}원`, RES_ST[x.status]?.[0]]),
      ...d.applications.map((x) => [x.created_at, x.applicant_type === 'corp' ? '법인 견적' : '중장기 신청', `${x.no} · ${x.vehicle_name || ''}${x.term ? ` · ${x.term}개월` : ''}${x.monthly ? ` · 월 ${won(x.monthly)}원` : ''}`, APP_ST[x.status]?.[0]]),
      ...d.inquiries.map((x) => [x.created_at, '1:1 문의', `${x.type} · ${x.title}`, x.status === 'done' ? '답변완료' : '답변대기']),
    ].sort((a, b) => b[0].localeCompare(a[0]));
    $('#detail').innerHTML = `<div class="split">
<div class="l box box-pad" style="display:flex;flex-direction:column;gap:12px">
<h2 style="font-size:17px;border-bottom:2px solid var(--ink);padding-bottom:10px">${esc(c.company || c.name)}</h2>
<div class="grid2">
<label class="field">이름<input class="input" id="cName" value="${esc(c.name)}"></label>
<label class="field">구분<select class="select" id="cKind">${opts([['개인', '개인'], ['개인사업자', '개인사업자'], ['법인', '법인']], c.kind)}</select></label>
<label class="field">법인명<input class="input" id="cCompany" value="${esc(c.company)}"></label>
<label class="field">사업자번호<input class="input" id="cBiz" value="${esc(c.biz_no)}"></label>
<label class="field">이메일<input class="input" id="cEmail" value="${esc(c.email)}"></label>
<label class="field">rentcarerp 고객번호<input class="input" id="cErp" value="${esc(c.erp_ref)}"></label>
</div>
<dl class="dl"><dt>연락처</dt><dd><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></dd><dt>처음 경로</dt><dd>${esc(c.source || '-')}</dd><dt>등록일</dt><dd>${kst(c.created_at)}</dd></dl>
<label class="field">상담 메모 (직원만 보임)<textarea class="textarea" id="cMemo" rows="4">${esc(c.memo)}</textarea></label>
<div style="display:flex;justify-content:flex-end"><button class="btn btn-black btn-sm" id="cSave">저장</button></div></div>
<div class="r box box-pad"><h2 style="font-size:16px;margin-bottom:10px">이력</h2>
<ol style="margin:0;padding:0;list-style:none;border-top:1px solid var(--ink)">${hist.length ? hist.map((h) => `<li style="display:flex;gap:12px;padding:11px 4px;border-bottom:1px solid var(--line-soft);font-size:14px;flex-wrap:wrap"><span class="hint" style="flex:0 0 110px">${kst(h[0])}</span><strong style="flex:0 0 84px">${esc(h[1])}</strong><span style="flex:1 1 220px">${esc(h[2])}</span><span class="hint">${esc(h[3] || '')}</span></li>`).join('') : '<li class="muted" style="padding:16px 0">이력이 없습니다.</li>'}</ol></div></div>`;
    $('#cSave').addEventListener('click', () =>
      run(() => api('/api/admin/customers/' + id, { method: 'PATCH', body: { name: $('#cName').value, kind: $('#cKind').value, company: $('#cCompany').value, biz_no: $('#cBiz').value, email: $('#cEmail').value, erp_ref: $('#cErp').value, memo: $('#cMemo').value } }), '저장했습니다.')
    );
    $('#detail').scrollIntoView({ behavior: 'smooth' });
  };
  $$('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => open(+tr.dataset.id)));
  if (arg) open(+arg);
};

// ── 1:1 문의 ───────────────────────────────────────
PAGES.inquiries = async () => {
  const r = await api('/api/admin/inquiries');
  let cur = r.inquiries[0] ? r.inquiries[0].id : null;
  const draw = () => {
    const q = r.inquiries.find((x) => x.id === cur);
    main.innerHTML = `<div class="a-title"><div><h1>1:1 문의</h1><p class="desc">답변을 등록하면 고객센터에서 고객이 비밀번호로 확인할 수 있습니다. 연락처로 직접 안내도 함께 해주세요.</p></div></div>
<div class="split"><div class="l box">${r.inquiries.length ? r.inquiries.map((x) => `<button type="button" data-id="${x.id}" style="width:100%;display:flex;flex-direction:column;gap:2px;padding:12px 14px;border:0;border-bottom:1px solid var(--line-soft);background:${x.id === cur ? 'var(--red-soft)' : '#fff'};text-align:left;cursor:pointer"><span class="hint" style="display:flex;justify-content:space-between;gap:8px"><span>${esc(x.type)} · ${esc(x.name)}</span><span>${kst(x.created_at).slice(5)}</span></span><strong style="font-size:14px;font-weight:${x.id === cur ? 700 : 500}">${esc(x.title)}</strong>${x.status === 'done' ? '<span class="hint">답변완료</span>' : '<span class="small red" style="font-weight:700">답변대기</span>'}</button>`).join('') : '<p class="muted" style="padding:30px;text-align:center">문의가 없습니다.</p>'}</div>
<div class="r">${q ? `<div class="box box-pad" style="display:flex;flex-direction:column;gap:14px">
<div style="border-bottom:1px solid var(--line);padding-bottom:12px"><span class="hint">${esc(q.no)} · ${esc(q.type)} · ${kst(q.created_at)}</span><h2 style="font-size:18px;margin-top:4px">${esc(q.title)}</h2>
<span class="small">${esc(q.name)} · <a href="tel:${esc(q.phone)}">${esc(q.phone)}</a> · <a class="red" href="#customers/${q.customer_id}">고객 정보 보기</a></span></div>
<p style="margin:0;white-space:pre-line;line-height:1.8;font-size:14px">${esc(q.body)}</p>
${q.attachments.length ? `<div class="photos">${q.attachments.map((a) => `<a href="${esc(a)}" target="_blank" rel="noopener" class="photo"><img src="${esc(a)}" alt="첨부 사진"></a>`).join('')}</div>` : ''}
<label class="field">답변<textarea class="textarea" id="ans" rows="6" placeholder="고객에게 보여줄 답변">${esc(q.answer)}</textarea></label>
<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><button class="btn-link" id="delQ">문의 삭제</button><button class="btn btn-red btn-sm" id="saveAns">${q.answer ? '답변 수정' : '답변 등록'}</button></div></div>` : ''}</div></div>`;
    $$('[data-id]', main).forEach((b) => b.addEventListener('click', () => { cur = +b.dataset.id; draw(); }));
    if (!q) return;
    $('#saveAns').addEventListener('click', async () => {
      await run(() => api(`/api/admin/inquiries/${q.id}`, { method: 'PATCH', body: { answer: $('#ans').value } }), '답변을 저장했습니다.');
      q.answer = $('#ans').value;
      q.status = q.answer ? 'done' : 'wait';
      refreshCounts();
      draw();
    });
    $('#delQ').addEventListener('click', async () => {
      if (!(await confirmBox('이 문의를 삭제할까요? 되돌릴 수 없습니다.', '삭제'))) return;
      await run(() => api(`/api/admin/inquiries/${q.id}`, { method: 'DELETE' }), '삭제했습니다.');
      route();
    });
  };
  draw();
};

// ── 공지 · 이벤트 · FAQ ─────────────────────────────
PAGES.posts = async () => {
  const { items } = await api('/api/admin/posts');
  const board = sessionStorage.getItem('postBoard') || 'notice';
  const NAME = { notice: '공지사항', event: '이벤트', faq: '자주 묻는 질문' };
  const list = items.filter((p) => p.board === board);
  main.innerHTML = `<div class="a-title"><div><h1>공지 · 이벤트 · FAQ</h1><p class="desc">고객센터와 메인 화면 공지 목록에 바로 반영됩니다.</p></div><button class="btn btn-black btn-sm" id="newPost">새 글 쓰기</button></div>
<div class="tabs-line" role="tablist">${Object.entries(NAME).map(([k, v]) => `<button role="tab" aria-selected="${k === board}" class="${k === board ? 'on' : ''}" data-b="${k}">${v}</button>`).join('')}</div>
<div class="box"><table class="a-table"><thead><tr><th>${board === 'faq' ? '순서' : '구분'}</th><th>제목</th><th>노출</th><th>등록일</th><th></th></tr></thead>
<tbody>${list.length ? list.map((p) => `<tr><td>${board === 'faq' ? p.sort : p.pinned ? '<strong class="red">고정</strong>' : NAME[p.board]}</td><td>${esc(p.title)}</td><td>${p.visible ? '노출' : '<span class="muted">숨김</span>'}</td><td class="hint">${kst(p.created_at).slice(0, 10)}</td><td style="text-align:right"><button class="btn btn-xs" data-edit="${p.id}">수정</button> <button class="btn-link" data-del="${p.id}">삭제</button></td></tr>`).join('') : '<tr><td colspan="5" class="muted" style="padding:30px;text-align:center">글이 없습니다.</td></tr>'}</tbody></table></div>
<div id="editor"></div>`;
  $$('[data-b]').forEach((b) => b.addEventListener('click', () => { sessionStorage.setItem('postBoard', b.dataset.b); route(); }));
  const edit = (p) => {
    p = p || { board, title: '', body: '', pinned: 0, visible: 1, sort: list.length + 1, attachments: '[]' };
    let att = JSON.parse(p.attachments || '[]');
    const drawAtt = () => ($('#pAtt').innerHTML = att.map((k, i) => `<figure><div class="photo"><img src="/img/${esc(k)}" alt=""></div><div class="acts"><span></span><button type="button" class="btn-link" data-rm="${i}">삭제</button></div></figure>`).join(''));
    $('#editor').innerHTML = `<div class="box box-pad" style="display:flex;flex-direction:column;gap:12px"><h2 style="font-size:16px">${p.id ? '글 수정' : '새 글 쓰기'}</h2>
<div class="grid2"><label class="field">게시판<select class="select" id="pBoard">${opts(Object.entries(NAME), p.board)}</select></label><label class="field">${board === 'faq' ? '질문' : '제목'}<input class="input" id="pTitle" value="${esc(p.title)}"></label></div>
<label class="field">${board === 'faq' ? '답변' : '내용'}<textarea class="textarea" id="pBody" rows="8">${esc(p.body)}</textarea></label>
<div class="field">이미지 첨부<label class="drop" style="min-height:80px"><strong>+ 이미지 추가</strong><span class="hint">눌러서 선택</span><input type="file" id="pFile" accept="image/*" multiple></label><div class="photos" id="pAtt"></div></div>
<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center"><label class="check"><input type="checkbox" id="pPin" ${p.pinned ? 'checked' : ''}>목록 맨 위에 고정</label><label class="check"><input type="checkbox" id="pVis" ${p.visible ? 'checked' : ''}>노출</label><label class="field" style="flex-direction:row;align-items:center">순서<input class="input" id="pSort" type="number" value="${p.sort}" style="width:80px;height:38px"></label></div>
<div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-sm" id="pCancel">취소</button><button class="btn btn-red btn-sm" id="pSave">저장</button></div></div>`;
    drawAtt();
    $('#pAtt').addEventListener('click', (e) => { if (e.target.dataset.rm) { att.splice(+e.target.dataset.rm, 1); drawAtt(); } });
    $('#pFile').addEventListener('change', async (e) => {
      for (const f of e.target.files) {
        const fd = new FormData();
        fd.append('folder', 'post');
        fd.append('file', await shrink(f));
        const r = await run(() => api('/api/admin/upload', { method: 'POST', body: fd }));
        att.push(r.key);
      }
      e.target.value = '';
      drawAtt();
    });
    $('#pCancel').addEventListener('click', () => ($('#editor').innerHTML = ''));
    $('#pSave').addEventListener('click', async () => {
      const body = { board: $('#pBoard').value, title: $('#pTitle').value, body: $('#pBody').value, pinned: $('#pPin').checked, visible: $('#pVis').checked, sort: +$('#pSort').value, attachments: att };
      if (!body.title.trim()) return toast('제목을 입력해 주세요.', true);
      await run(() => api(p.id ? `/api/admin/posts/${p.id}` : '/api/admin/posts', { method: p.id ? 'PATCH' : 'POST', body }), '저장했습니다.');
      sessionStorage.setItem('postBoard', body.board);
      route();
    });
    $('#editor').scrollIntoView({ behavior: 'smooth' });
  };
  $('#newPost').addEventListener('click', () => edit());
  $$('[data-edit]').forEach((b) => b.addEventListener('click', () => edit(items.find((p) => p.id === +b.dataset.edit))));
  $$('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmBox('이 글을 삭제할까요?', '삭제'))) return;
      await run(() => api(`/api/admin/posts/${b.dataset.del}`, { method: 'DELETE' }), '삭제했습니다.');
      route();
    })
  );
};

// ── 중장기 차량 ────────────────────────────────────
PAGES.long = async (arg) => {
  const { items } = await api('/api/admin/long');
  main.innerHTML = `<div class="a-title"><div><h1>중장기 차량 · 사진 · 가격표</h1><p class="desc">차량을 등록하고 실차 사진과 가격표를 넣은 뒤 '홈페이지 노출'을 켜면 중장기 목록에 나옵니다.</p></div><button class="btn btn-black btn-sm" id="newCar">+ 차량 등록</button></div>
<div class="box scroll-x"><table class="a-table" style="min-width:820px"><thead><tr><th>사진</th><th>차량</th><th>차량번호</th><th class="num">사진</th><th class="num">월 대여료</th><th>상태</th><th>노출</th></tr></thead>
<tbody>${items.length ? items.map((v) => `<tr class="click ${+arg === v.id ? 'sel' : ''}" data-id="${v.id}"><td>${v.photo ? `<img class="thumb" src="${esc(v.photo)}" alt="">` : '<span class="thumb empty">사진 없음</span>'}</td><td><strong>${esc(v.name)}</strong><br><span class="hint">${esc(v.class)} · ${v.year || ''}년식 · ${won(v.km)}km</span></td><td>${esc(v.plate || '-')}</td><td class="num">${v.photo_n}장</td><td class="num">${v.price_n ? v.price_n + "개 기간" : "<span class='red'>미입력</span>"}</td><td>${esc(LONG_ST[v.status] || v.status)}</td><td>${v.visible ? '<span class="st st-ok">노출</span>' : '<span class="st st-off">숨김</span>'}</td></tr>`).join('') : '<tr><td colspan="7" class="muted" style="padding:40px;text-align:center">등록된 차량이 없습니다. 오른쪽 위 \'차량 등록\'을 눌러 시작하세요.</td></tr>'}</tbody></table></div>
<div id="detail"></div>`;
  $('#newCar').addEventListener('click', () => carEditor());
  $$('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => (location.hash = '#long/' + tr.dataset.id)));
  if (arg) carEditor(+arg);
};

// 표 형식 입력칸 (추가 옵션 · 이용이력 · 사고수리 · 대물 · 기준 월 대여료)
function rowsEditor(el, cols, data, addLabel = '+ 줄 추가') {
  const numIn = (c, val) => `<input class="input" data-c="${c.key}" ${c.num ? 'inputmode="numeric"' : ''} value="${esc(c.num ? (val ? won(val) : '') : val ?? '')}" placeholder="${esc(c.ph || '')}" aria-label="${esc(c.label)}" style="min-width:${c.w || 120}px">`;
  const rowHtml = (r = {}) => `<tr>${cols.map((c) => `<td>${numIn(c, r[c.key])}</td>`).join('')}<td style="width:1%;white-space:nowrap"><button type="button" class="btn-link" data-rm>삭제</button></td></tr>`;
  el.innerHTML = `<div class="scroll-x"><table class="a-table rows-edit"><thead><tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th></th></tr></thead><tbody>${(data.length ? data : [{}]).map(rowHtml).join('')}</tbody></table></div><button type="button" class="btn btn-xs" data-addrow style="margin-top:6px">${esc(addLabel)}</button>`;
  const bind = () => {
    $$('[data-rm]', el).forEach((b) => (b.onclick = () => { b.closest('tr').remove(); }));
    $$('input[inputmode=numeric]', el).forEach((i) => (i.onblur = () => { const n = +i.value.replace(/[^\d-]/g, ''); i.value = n ? won(n) : ''; }));
  };
  $('[data-addrow]', el).addEventListener('click', () => { $('tbody', el).insertAdjacentHTML('beforeend', rowHtml()); bind(); });
  bind();
  return () =>
    $$('tbody tr', el)
      .map((tr) => Object.fromEntries(cols.map((c) => { const v = $(`[data-c="${c.key}"]`, tr).value.trim(); return [c.key, c.num ? +v.replace(/[^\d-]/g, '') || 0 : v]; })))
      .filter((r) => cols.some((c) => r[c.key]));
}
const numList = (s) => String(s).split(/[,\s]+/).map((x) => +x.replace(/\D/g, '')).filter((x, i, a) => x >= 0 && String(s).trim() !== '' && a.indexOf(x) === i);
const kmList = (s) => String(s).split(/[,\s]+/).map((x) => x.replace(/[^\d.]/g, '')).filter(Boolean).map((x) => (+x < 100 ? Math.round(+x * 10000) : +x));

async function carEditor(id) {
  const box = $('#detail');
  let v = { name: '', class: 'SUV', year: new Date().getFullYear(), km: 0, fuel: '가솔린', seats: 5, badge: '즉시출고', status: 'available', visible: 0, car_value: 0,
    added_options: [], usage_history: [], repair_history: [], pricing: { ...DEFAULT_PRICING } };
  let prices = [], photos = [];
  if (id) {
    const d = await api('/api/admin/long/' + id);
    v = d.vehicle;
    prices = d.prices;
    photos = d.photos;
  }
  const P = v.pricing;
  const f = (k, label, extra = '') => `<label class="field">${label}<input class="input" id="v_${k}" value="${esc(v[k] ?? '')}" ${extra}></label>`;
  const n = (k, label) => `<label class="field">${label}<input class="input money" id="v_${k}" inputmode="numeric" value="${v[k] ? won(v[k]) : ''}"></label>`;
  const pf = (k, label, val, extra = '') => `<label class="field">${label}<input class="input" id="p_${k}" value="${esc(val ?? '')}" ${extra}></label>`;
  const pn = (k, label) => `<label class="field">${label}<input class="input money" id="p_${k}" inputmode="numeric" value="${P[k] ? won(P[k]) : '0'}"></label>`;
  const H = (t, d = '') => `<div style="border-top:1px solid var(--line);padding-top:18px;display:flex;flex-direction:column;gap:4px"><h3 style="font-size:16px">${t}</h3>${d ? `<p class="hint" style="margin:0">${d}</p>` : ''}</div>`;
  box.innerHTML = `<div class="box box-pad" style="display:flex;flex-direction:column;gap:16px">
<div class="a-title"><h2 style="font-size:17px">${id ? esc(v.name) : '새 중장기 차량 등록'}</h2>${id ? `<a class="btn btn-sm" href="/car.html?id=${id}" target="_blank" rel="noopener">홈페이지에서 보기</a>` : ''}</div>
<div class="toolbar" style="padding:0;border:0"><input class="input" id="erpQ" placeholder="rentcarerp 차량 검색 (차량번호 · 차명)" style="max-width:320px"><button class="btn btn-sm" id="erpGo">ERP에서 불러오기</button><span class="hint" id="erpMsg"></span></div>
<div id="erpList"></div>

${H('차량 정보', '고객 화면 \'차량정보\' 탭에 나오는 내용입니다.')}
<div class="grid2">
${f('name', '차명 · 트림 (필수)')}
<label class="field">차종<select class="select" id="v_class">${opts(['경차', '준중형', '중형', '대형', 'SUV', '승합', '화물'].map((x) => [x, x]), v.class)}</select></label>
${f('plate', '차량번호')}
<label class="field">차량번호 공개<select class="select" id="v_show_plate">${opts([[0, '고객에게 숨김'], [1, '고객에게 보여 줌']], v.show_plate ? 1 : 0)}</select></label>
${f('year', '모델 연도', 'inputmode="numeric"')}
${f('first_reg', '신차등록일 (예: 2024-02-21)')}
${n('km', '주행거리 (km)')}
${n('displacement', '배기량 (cc)')}
<label class="field">연료<select class="select" id="v_fuel">${opts(['가솔린', '디젤', 'LPG', '하이브리드', '전기'].map((x) => [x, x]), v.fuel)}</select></label>
${f('seats', '승차 인원', 'inputmode="numeric"')}
${f('color', '외장 색상')}
${f('int_color', '내장 색상')}
${f('accident', '사고 이력 요약 (예: 무사고, 단순교환 1회)')}
${f('pickup', '인수 (예: 본점 · 탁송 가능)')}
${f('location', '차량 현 위치 (예: 수도권)')}
${f('erp_ref', 'rentcarerp 차량 ID')}
</div>

${H('출고 상태')}
<div class="grid2">
<label class="field">상태<select class="select" id="v_status">${opts(Object.entries(LONG_ST), v.status)}</select></label>
${f('badge', '출고 가능일 때 표시 문구 (예: 즉시출고)')}
${f('avail_note', '출고 안내 (예: 11월 중순 반납 예정)')}
</div>

${H('차량 가격', '신차가격 - 개소세 감면 - 감가상각 = 현재 차량가격. 보증금 · 선납금은 현재 차량가격 × % 로 계산합니다.')}
<div class="grid2">
${n('new_price', '신차가격 (원)')}
${n('tax_cut', '신차 개소세 감면 (원)')}
${n('car_value', '현재 차량가격 (원)')}
<div class="field">감가상각 (자동)<div class="input" id="depAuto" style="display:flex;align-items:center;background:var(--bg-soft)">-</div></div>
</div>

${H('추가 옵션', '차량에 실제로 들어간 선택 옵션과 가격 (외장 · 내장 색상은 위에서 입력한 값이 같이 나옵니다)')}
<div id="rOpts"></div>

${H('사양정보', '고객 화면 \'사양정보\' 탭. 기본사양 · 선택사양 설명을 자유롭게 적어 주세요.')}
<label class="field">사양 설명<textarea class="textarea" id="v_spec_text" rows="5">${esc(v.spec_text || '')}</textarea></label>
<label class="field">주요 옵션 (한 줄 요약)<textarea class="textarea" id="v_options" rows="2">${esc(v.options || '')}</textarea></label>

${H('이용이력', '이전 이용 내역 (예: 장기렌트 · 2024-02-21 ~ 2026-07-01 · 법인)')}
<div id="rUsage"></div>
${H('사고수리내역', '없으면 비워 두세요. 고객 화면에 \'등록된 사고 수리 내역이 없습니다\'로 나옵니다.')}
<div id="rRepair"></div>

${H('월 대여료 조건', '아래 기준 월 대여료에 약정거리 · 보증금 · 선납금 · 대물 · 정비 선택을 반영해 고객 화면에서 자동 계산합니다.')}
<div class="grid2">
${pf('kmBase', '기준 약정거리 (km/년)', won(P.kmBase), 'inputmode="numeric"')}
${pn('kmFee', '1만km 당 월 증감액 (원)')}
${pf('kmMin', '최소 약정거리 (km)', won(P.kmMin), 'inputmode="numeric"')}
${pf('kmMax', '최대 약정거리 (km)', won(P.kmMax), 'inputmode="numeric"')}
${pf('kmPresets', '약정거리 선택지 (만km, 쉼표)', P.kmPresets.map((x) => x / 10000).join(', '))}
${pf('depRates', '보증금 선택지 (%, 쉼표)', P.depRates.join(', '))}
${pn('depDiscount', '보증금 100만원 당 월 인하액 (원)')}
${pf('depMaxPct', '보증금 최대 (%)', P.depMaxPct, 'inputmode="numeric"')}
${pf('preRates', '선납금 선택지 (%, 쉼표)', P.preRates.join(', '))}
${pf('preMaxPct', '선납금 최대 (%)', P.preMaxPct, 'inputmode="numeric"')}
${pf('driverAge', '운전자 연령', P.driverAge)}
${pf('deductible', '자차 면책금', P.deductible)}
<label class="field">매입 옵션<select class="select" id="p_buyout">${opts([['있음', '있음'], ['없음', '없음']], P.buyout)}</select></label>
${pf('buyoutNote', '매입 옵션 안내', P.buyoutNote)}
${pn('maintAddFee', '정비 서비스 추가 월 요금 (0 = 상품 없음)')}
${pf('maintAddNote', '정비 서비스 추가 설명', P.maintAddNote)}
${pf('regions', '차량 인도지역 (쉼표)', P.regions.join(', '))}
${pf('regionNote', '인도지역 안내', P.regionNote)}
</div>
<label class="field">정비 서비스 — 기본 제공 (한 줄에 하나)<textarea class="textarea" id="p_maintItems" rows="4">${esc(P.maintItems.join('\n'))}</textarea></label>
<div><strong style="font-size:14px">대물배상 한도별 월 추가금</strong> <span class="hint">첫 줄이 기본 선택입니다. 한 줄만 있으면 선택 없이 고정으로 보여 줍니다.</span><div id="rLiab" style="margin-top:6px"></div></div>

<label class="check"><input type="checkbox" id="v_visible" ${v.visible ? 'checked' : ''}>홈페이지 중장기 목록에 노출</label>
<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">${id ? '<button class="btn-link" id="vDel">차량 삭제</button>' : '<span></span>'}<button class="btn btn-red btn-sm" id="vSave">${id ? '차량 정보 · 조건 저장' : '등록하고 사진 · 월 대여료 입력하기'}</button></div>
${id ? `
${H('기준 월 대여료 (부가세 포함)', '계약 기간마다 \'기준 약정거리 · 보증금 0 · 선납금 0\' 일 때의 월 대여료를 넣으세요. 넣은 기간만 고객 화면에 나옵니다.')}
<div id="rBase"></div>
<div id="preview"></div>
<div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-sm" id="pCalc">미리 계산</button><button class="btn btn-red btn-sm" id="pSave">기준 월 대여료 저장</button></div>
<div style="border-top:1px solid var(--line);padding-top:18px;display:flex;flex-direction:column;gap:10px">
<div class="a-title"><h3 style="font-size:16px">실차 사진 (${photos.length}/20)</h3><span class="hint">첫 번째 사진이 목록 대표 사진입니다. 휴대폰 사진은 자동으로 줄여서 올라갑니다.</span></div>
<label class="drop" id="drop"><strong>실차 사진 올리기</strong><span class="hint">여러 장을 끌어다 놓거나 눌러서 선택 · 휴대폰에서는 바로 촬영 가능</span><input type="file" id="photoIn" accept="image/*" multiple></label>
<div class="photos">${photos.map((p, i) => `<figure><div class="photo"><img src="${esc(p.url)}" alt="실차 사진 ${i + 1}" loading="lazy">${i === 0 ? '<span class="main-tag">대표</span>' : ''}</div><div class="acts"><span class="order-btns"><button type="button" data-mv="${i}" data-dir="-1" aria-label="앞으로">◀</button> <button type="button" data-mv="${i}" data-dir="1" aria-label="뒤로">▶</button></span>${i ? `<button type="button" class="btn-link" data-main="${i}" style="color:var(--ink)">대표로</button>` : ''}<button type="button" class="btn-link" data-delp="${p.id}">삭제</button></div></figure>`).join('')}</div></div>` : ''}
</div>`;

  const getOpts = rowsEditor($('#rOpts'), [{ key: 'name', label: '옵션명', w: 220, ph: '파노라마 선루프' }, { key: 'price', label: '가격 (원)', num: true }], v.added_options, '+ 옵션 추가');
  const getUsage = rowsEditor($('#rUsage'), [{ key: 'kind', label: '구분', ph: '장기렌트' }, { key: 'period', label: '기간', w: 200, ph: '2024-02-21 ~ 2026-07-01' }, { key: 'user', label: '이용자', ph: '법인' }], v.usage_history);
  const getRepair = rowsEditor($('#rRepair'), [{ key: 'date', label: '일자', ph: '2025-05-10' }, { key: 'detail', label: '수리 내용', w: 260, ph: '앞범퍼 교환' }, { key: 'cost', label: '수리비 (원)', num: true }], v.repair_history);
  const getLiab = rowsEditor($('#rLiab'), [{ key: 'label', label: '대물 한도', ph: '1억 원' }, { key: 'fee', label: '월 추가금 (원)', num: true }], P.liability);
  $$('.money', box).forEach((i) => i.addEventListener('blur', () => { const x = +i.value.replace(/\D/g, ''); i.value = x ? won(x) : ''; }));
  const money = (k) => +($('#v_' + k).value || '').replace(/\D/g, '');
  const showDep = () => { const d = money('new_price') - money('tax_cut') - money('car_value'); $('#depAuto').textContent = money('new_price') && money('car_value') ? '-' + won(d) + '원' : '-'; };
  ['new_price', 'tax_cut', 'car_value'].forEach((k) => $('#v_' + k).addEventListener('input', showDep));
  showDep();

  const pricing = () => {
    const pv = (k) => $('#p_' + k).value;
    const pm = (k) => +pv(k).replace(/\D/g, '') || 0;
    return {
      kmBase: pm('kmBase'), kmFee: pm('kmFee'), kmMin: pm('kmMin'), kmMax: pm('kmMax'), kmPresets: kmList(pv('kmPresets')),
      depRates: numList(pv('depRates')), depDiscount: pm('depDiscount'), depMaxPct: pm('depMaxPct'), preRates: numList(pv('preRates')), preMaxPct: pm('preMaxPct'),
      driverAge: pv('driverAge'), deductible: pv('deductible'), buyout: pv('buyout'), buyoutNote: pv('buyoutNote'),
      maintAddFee: pm('maintAddFee'), maintAddNote: pv('maintAddNote'), maintItems: pv('maintItems').split('\n').map((x) => x.trim()).filter(Boolean),
      regions: pv('regions').split(',').map((x) => x.trim()).filter(Boolean), regionNote: pv('regionNote'),
      liability: getLiab().filter((x) => x.label),
    };
  };

  // ERP 불러오기
  $('#erpGo').addEventListener('click', async () => {
    const r = await run(() => api('/api/admin/erp/vehicles?q=' + encodeURIComponent($('#erpQ').value)));
    if (!r.enabled) return ($('#erpMsg').textContent = 'rentcarerp 연동 전입니다. 직접 입력해 주세요.');
    if (r.error) return ($('#erpMsg').textContent = r.error);
    $('#erpMsg').textContent = `${r.vehicles.length}대 찾음`;
    $('#erpList').innerHTML = r.vehicles.map((x, i) => `<button type="button" class="btn btn-sm" data-erp="${i}" style="margin:0 6px 6px 0">${esc(x.plate)} · ${esc(x.name)}</button>`).join('');
    $$('[data-erp]').forEach((b) =>
      b.addEventListener('click', () => {
        const x = r.vehicles[+b.dataset.erp];
        const set = (k, val, m) => { if (val !== undefined && val !== null && val !== '' && $('#v_' + k)) $('#v_' + k).value = m ? won(val) : val; };
        set('erp_ref', x.id); set('plate', x.plate); set('name', x.name); set('year', x.year); set('km', x.km, 1); set('fuel', x.fuel);
        set('color', x.color); set('seats', x.seats); set('first_reg', x.first_reg); set('class', x.class); set('options', x.options);
        set('new_price', x.new_price, 1); set('displacement', x.displacement, 1);
        showDep();
        toast('ERP 차량 정보를 채웠습니다. 확인 후 저장하세요.');
      })
    );
  });

  $('#vSave').addEventListener('click', async () => {
    const keys = ['name', 'class', 'plate', 'year', 'first_reg', 'fuel', 'color', 'int_color', 'seats', 'accident', 'pickup', 'location', 'badge', 'avail_note', 'erp_ref', 'status', 'options', 'spec_text'];
    const body = Object.fromEntries(keys.map((k) => [k, $('#v_' + k).value]));
    for (const k of ['km', 'displacement', 'new_price', 'tax_cut', 'car_value']) body[k] = money(k);
    body.show_plate = $('#v_show_plate').value === '1';
    body.visible = $('#v_visible').checked;
    body.added_options = getOpts();
    body.usage_history = getUsage();
    body.repair_history = getRepair();
    body.pricing = pricing();
    if (!body.name.trim()) return toast('차명을 입력해 주세요.', true);
    if (body.visible && !body.car_value) return toast('홈페이지에 노출하려면 현재 차량가격을 입력해 주세요.', true);
    const r = await run(() => api(id ? '/api/admin/long/' + id : '/api/admin/long', { method: id ? 'PATCH' : 'POST', body }), '저장했습니다.');
    location.hash = '#long/' + (id || r.id);
    if (id) route();
  });
  if (!id) return;
  $('#vDel').addEventListener('click', async () => {
    if (!(await confirmBox('이 차량과 사진 · 월 대여료를 모두 삭제할까요?', '삭제'))) return;
    await run(() => api('/api/admin/long/' + id, { method: 'DELETE' }), '삭제했습니다.');
    location.hash = '#long';
  });

  // 기준 월 대여료 + 미리 계산
  const baseRows = prices.length ? prices : [48, 36, 24, 12].map((t) => ({ term: t, monthly: 0 }));
  const getBase = rowsEditor($('#rBase'), [{ key: 'term', label: '계약 기간 (개월)', num: true }, { key: 'monthly', label: '기준 월 대여료 (원)', num: true, w: 160 }], baseRows, '+ 기간 추가');
  const preview = () => {
    const bases = getBase().filter((b) => b.term > 0 && b.monthly > 0);
    const P2 = pricing();
    const cv = money('car_value');
    if (!bases.length) return ($('#preview').innerHTML = '');
    const deps = [0, 10, 20, 30];
    const kmb = +P2.kmBase || 20000;
    const kms = [kmb, kmb + 10000];
    const veh = { car_value: cv };
    const head = kms.map((k) => deps.map((d) => `<th class="num">연 ${won(k)}km<br>보증금 ${d}%</th>`).join('')).join('');
    const body = bases
      .sort((a, b) => b.term - a.term)
      .map((b) => `<tr><th>${b.term}개월</th>${kms.map((k) => deps.map((d) => `<td class="num">${won(quote(veh, P2, bases, { term: b.term, km: k, dep: rateAmount(cv, d) }).monthly)}</td>`).join('')).join('')}</tr>`)
      .join('');
    $('#preview').innerHTML = `<p class="hint" style="margin:6px 0">미리 계산 (저장 전 입력값 기준, 선납금 없음 · 대물 기본)</p><div class="scroll-x"><table class="a-table" style="min-width:${180 + kms.length * deps.length * 92}px"><thead><tr><th>기간</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  };
  $('#pCalc').addEventListener('click', preview);
  if (prices.length) preview();
  $('#pSave').addEventListener('click', async () => {
    const list = getBase().filter((b) => b.term > 0 && b.monthly > 0);
    await run(() => api(`/api/admin/long/${id}/prices`, { method: 'PUT', body: { prices: list } }), `기준 월 대여료 ${list.length}개 기간을 저장했습니다.`);
    preview();
  });

  // 사진
  const upload = async (files) => {
    files = [...files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    if (photos.length + files.length > 20) return toast('차량 한 대에 사진은 20장까지입니다.', true);
    toast(`사진 ${files.length}장 올리는 중…`);
    const fd = new FormData();
    for (const f of files) fd.append('files', await shrink(f));
    await run(() => api(`/api/admin/long/${id}/photos`, { method: 'POST', body: fd }), '사진을 올렸습니다.');
    route();
  };
  $('#photoIn').addEventListener('change', (e) => upload(e.target.files));
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => upload(e.dataTransfer.files));
  const saveOrder = async (arr) => { await run(() => api(`/api/admin/long/${id}/photos/order`, { method: 'POST', body: { ids: arr.map((p) => p.id) } })); route(); };
  $$('[data-mv]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = +b.dataset.mv, j = i + +b.dataset.dir;
      if (j < 0 || j >= photos.length) return;
      const arr = photos.slice();
      [arr[i], arr[j]] = [arr[j], arr[i]];
      saveOrder(arr);
    })
  );
  $$('[data-main]').forEach((b) => b.addEventListener('click', () => { const arr = photos.slice(); const [x] = arr.splice(+b.dataset.main, 1); arr.unshift(x); saveOrder(arr); }));
  $$('[data-delp]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmBox('이 사진을 삭제할까요?', '삭제'))) return;
      await run(() => api(`/api/admin/long/${id}/photos/${b.dataset.delp}`, { method: 'DELETE' }), '삭제했습니다.');
      route();
    })
  );
  box.scrollIntoView({ behavior: 'smooth' });
}

// ── 단순 목록 편집 공통 (장소 · 차종 · 보험 · 임시차량 · 배너) ──
async function listEditor({ target, endpoint, title, desc, columns, blank, orderable = true, rowNote }) {
  const { items } = await api('/api/admin/' + endpoint);
  const el = typeof target === 'string' ? $(target) : target;
  el.innerHTML = `<div class="box"><div class="box-head"><div><h2>${esc(title)}</h2>${desc ? `<p class="hint" style="margin:2px 0 0">${esc(desc)}</p>` : ''}</div><button class="btn btn-black btn-sm" data-add>+ 추가</button></div>
<div class="scroll-x"><table class="a-table" style="min-width:${columns.length * 130}px"><thead><tr>${orderable ? '<th>순서</th>' : ''}${columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th></th></tr></thead>
<tbody>${items.length ? items.map((it, i) => `<tr data-id="${it.id}">${orderable ? `<td class="order-btns"><button type="button" data-up="${i}" aria-label="위로">▲</button> <button type="button" data-down="${i}" aria-label="아래로">▼</button></td>` : ''}${columns.map((c) => `<td>${cell(c, it)}</td>`).join('')}<td style="white-space:nowrap"><button class="btn btn-xs btn-red" data-save="${it.id}">저장</button> <button class="btn-link" data-del="${it.id}">삭제</button></td></tr>`).join('') : `<tr><td colspan="${columns.length + 2}" class="muted" style="padding:24px;text-align:center">항목이 없습니다.</td></tr>`}</tbody></table></div>
${rowNote ? `<p class="hint" style="margin:0;padding:10px 16px">${esc(rowNote)}</p>` : ''}</div>`;
  function cell(c, it) {
    const v = it[c.key];
    if (c.type === 'check') return `<input type="checkbox" data-k="${c.key}" ${v ? 'checked' : ''} aria-label="${esc(c.label)}" style="width:18px;height:18px;accent-color:var(--red)">`;
    if (c.type === 'select') return `<select class="select" data-k="${c.key}" aria-label="${esc(c.label)}">${opts(c.options, v)}</select>`;
    if (c.type === 'image')
      return `<div style="display:flex;gap:8px;align-items:center;min-width:210px">${it.image ? `<img class="thumb" src="${esc(it.image)}" alt="">` : c.fallback ? `<span style="position:relative;display:inline-block"><img class="thumb" src="${classImage(it.class)}" alt="" style="object-fit:contain;opacity:.8"><span class="hint" style="position:absolute;left:4px;bottom:2px;color:var(--red);font-weight:700">기본 그림</span></span>` : '<span class="thumb empty">미등록</span>'}<label class="btn btn-xs" style="position:relative">${it.image ? '교체' : '업로드'}<input type="file" accept="image/*" data-img="${c.folder}" style="position:absolute;width:1px;height:1px;opacity:0"></label><input type="hidden" data-k="${c.key}" value="${esc(v || '')}"></div>`;
    if (c.type === 'textarea') return `<textarea class="textarea" data-k="${c.key}" rows="2" aria-label="${esc(c.label)}" style="min-width:${c.w || 200}px">${esc(v ?? '')}</textarea>`;
    return `<input class="input" data-k="${c.key}" type="${c.type === 'number' ? 'text' : 'text'}" ${c.type === 'number' ? 'inputmode="numeric"' : ''} value="${esc(c.type === 'number' && v ? won(v) : v ?? '')}" aria-label="${esc(c.label)}" style="min-width:${c.w || 120}px">`;
  }
  const rowData = (tr) => {
    const o = {};
    $$('[data-k]', tr).forEach((inp) => {
      const c = columns.find((x) => x.key === inp.dataset.k);
      o[inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : c && c.type === 'number' ? +String(inp.value).replace(/[^\d-]/g, '') : inp.value;
    });
    return o;
  };
  $('[data-add]', el).addEventListener('click', async () => {
    await run(() => api('/api/admin/' + endpoint, { method: 'POST', body: { ...blank, sort: items.length + 1 } }), '추가했습니다. 내용을 채우고 저장하세요.');
    listEditor(arguments[0]);
  });
  $$('[data-save]', el).forEach((b) => b.addEventListener('click', () => run(() => api(`/api/admin/${endpoint}/${b.dataset.save}`, { method: 'PATCH', body: rowData(b.closest('tr')) }), '저장했습니다.')));
  $$('[data-del]', el).forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmBox('이 항목을 삭제할까요?', '삭제'))) return;
      await run(() => api(`/api/admin/${endpoint}/${b.dataset.del}`, { method: 'DELETE' }), '삭제했습니다.');
      listEditor(arguments[0]);
    })
  );
  const move = async (i, d) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const arr = items.slice();
    [arr[i], arr[j]] = [arr[j], arr[i]];
    await run(() => api(`/api/admin/${endpoint}/order`, { method: 'POST', body: { ids: arr.map((x) => x.id) } }));
  };
  const args = arguments[0];
  $$('[data-up]', el).forEach((b) => b.addEventListener('click', () => move(+b.dataset.up, -1).then(() => listEditor(args))));
  $$('[data-down]', el).forEach((b) => b.addEventListener('click', () => move(+b.dataset.down, 1).then(() => listEditor(args))));
  $$('[data-img]', el).forEach((inp) =>
    inp.addEventListener('change', async () => {
      const f = inp.files[0];
      if (!f) return;
      const fd = new FormData();
      fd.append('folder', inp.dataset.img);
      fd.append('file', await shrink(f));
      const r = await run(() => api('/api/admin/upload', { method: 'POST', body: fd }));
      const tr = inp.closest('tr');
      const hidden = $('input[type=hidden][data-k]', tr);
      hidden.value = r.key;
      await run(() => api(`/api/admin/${endpoint}/${tr.dataset.id}`, { method: 'PATCH', body: { [hidden.dataset.k]: r.key } }), '이미지를 저장했습니다.');
      listEditor(args);
    })
  );
}

// ── 단기 차종 · 요금 · 보험 · 임시 차량 ─────────────
PAGES.short = async () => {
  const s = await api('/api/admin/settings');
  main.innerHTML = `<div class="a-title"><div><h1>단기 차종 · 요금 · 보험</h1><p class="desc">차종별 일요금과 대표 이미지(현대 · 기아)를 관리합니다. 예약 가능한 대수는 ${s.erpEnabled ? 'rentcarerp 배차 일정에서 자동으로' : '아래 임시 차량 목록으로'} 계산됩니다.</p></div></div>
<div id="models"></div><div id="ins"></div>${s.erpEnabled ? '' : '<div id="fleet"></div>'}`;
  await listEditor({
    target: '#models', endpoint: 'short-models', title: '단기 차종 · 대여기간별 1일 요금', desc: '요금 = 대여 일수 × 해당 구간 1일 요금 (비워둔 구간은 앞 구간 요금 사용). 대표 이미지는 같은 차종의 모든 단기 차량에 공통으로 표시되며, 없으면 차급별 기본 그림이 나옵니다.',
    columns: [
      { key: 'image_key', label: '대표 이미지', type: 'image', folder: 'model', fallback: true }, { key: 'maker', label: '제조사', w: 70 }, { key: 'name', label: '차종', w: 150 },
      { key: 'class', label: '차급', type: 'select', options: ['경차', '준중형', '중형', '대형', 'SUV', '승합', '수입'].map((x) => [x, x]) },
      { key: 'fuel', label: '연료', w: 80 }, { key: 'seats', label: '인승', type: 'number', w: 50 },
      { key: 'day_rate', label: '1~2일 (1일)', type: 'number', w: 90 }, { key: 'rate_3_4', label: '3~4일 (1일)', type: 'number', w: 90 },
      { key: 'rate_5_6', label: '5~6일 (1일)', type: 'number', w: 90 }, { key: 'rate_7', label: '7일 이상 (1일)', type: 'number', w: 90 },
      { key: 'features', label: '주요 옵션', type: 'textarea', w: 180 }, { key: 'erp_code', label: 'ERP 차종코드', w: 100 }, { key: 'active', label: '사용', type: 'check' },
    ],
    blank: { maker: '기아', name: '새 차종', class: '준중형', fuel: '', seats: 5, day_rate: 0, active: 0 },
  });
  await listEditor({
    target: '#ins', endpoint: 'insurance', title: '자차 보험 선택지', desc: '1일 요금 × 대여 일수로 계산됩니다.',
    columns: [{ key: 'name', label: '보험 이름', w: 240 }, { key: 'per_day', label: '1일 요금', type: 'number', w: 100 }, { key: 'active', label: '사용', type: 'check' }],
    blank: { name: '새 보험', per_day: 0, active: 0 },
  });
  if (!s.erpEnabled) {
    const { items: models } = await api('/api/admin/short-models');
    await listEditor({
      target: '#fleet', endpoint: 'short-vehicles', title: '단기 차량 (임시 목록)', orderable: false,
      desc: 'rentcarerp 연동 전까지 사용하는 목록입니다. 차종별로 등록한 대수만큼 예약을 받고, 기간이 겹치는 예약만큼 줄어듭니다.',
      columns: [{ key: 'model_id', label: '차종', type: 'select', options: models.map((m) => [m.id, m.name]) }, { key: 'plate', label: '차량번호', w: 120 }, { key: 'year', label: '연식', type: 'number', w: 70 }, { key: 'active', label: '운영', type: 'check' }],
      blank: { model_id: models[0] ? models[0].id : 0, plate: '', active: 1 },
    });
  }
};

// ── 단기 예약 장소 ─────────────────────────────────
PAGES.locations = async () => {
  main.innerHTML = `<div class="a-title"><div><h1>단기 예약 장소</h1><p class="desc">'사용'으로 켠 장소만, 이 순서대로 홈페이지 예약 화면에 나옵니다. 인수 위치 안내는 확정 안내에 쓰세요.</p></div></div><div id="locs"></div>`;
  await listEditor({
    target: '#locs', endpoint: 'locations', title: '예약 장소',
    columns: [
      { key: 'name', label: '장소 이름', w: 180 }, { key: 'type', label: '구분', type: 'select', options: ['공항', '지점', '딜리버리'].map((x) => [x, x]) },
      { key: 'guide', label: '인수 위치 안내', type: 'textarea', w: 220 }, { key: 'hours', label: '운영 시간', w: 110 }, { key: 'fee', label: '추가 요금', type: 'number', w: 90 },
      { key: 'can_pickup', label: '대여', type: 'check' }, { key: 'can_return', label: '반납', type: 'check' }, { key: 'active', label: '사용', type: 'check' },
    ],
    blank: { name: '새 장소', type: '딜리버리', hours: '09:00~18:00', fee: 0, active: 0, can_pickup: 1, can_return: 1 },
  });
};

// ── 메인 배너 ──────────────────────────────────────
PAGES.banners = async () => {
  main.innerHTML = `<div class="a-title"><div><h1>메인 배너</h1><p class="desc">메인 첫 화면 왼쪽 이미지와 문구입니다. 이미지가 없으면 기본 공항 그림이 나옵니다. 권장 1200 × 800px. 줄바꿈은 \\n 으로 입력하세요.</p></div><a class="btn btn-sm" href="/" target="_blank" rel="noopener">메인에서 보기</a></div><div id="bn"></div>`;
  await listEditor({
    target: '#bn', endpoint: 'banners', title: '배너 (맨 위 1개가 표시됩니다)',
    columns: [{ key: 'image_key', label: '이미지', type: 'image', folder: 'banner' }, { key: 'text', label: '큰 문구', type: 'textarea', w: 220 }, { key: 'sub_text', label: '작은 문구', w: 200 }, { key: 'link', label: '연결 주소', w: 140 }, { key: 'visible', label: '노출', type: 'check' }],
    blank: { text: '새 배너 문구', visible: 0 },
  });
};

// ── 메일 알림 · 발송 기록 ───────────────────────────
PAGES.notify = async () => {
  const [{ settings: s, mailFrom }, { logs }] = await Promise.all([api('/api/admin/settings'), api('/api/admin/mail-log')]);
  const kinds = JSON.parse(s.notify_kinds || '[]');
  const ALL = ['단기 예약', '중장기 신청', '법인 견적', '1:1 문의'];
  main.innerHTML = `<div class="a-title"><div><h1>메일 알림 · 발송 기록</h1><p class="desc">예약 · 신청 · 문의가 들어오면 아래 두 주소로 동시에 메일이 가고, 모든 발송이 아래 기록에 남습니다.</p></div></div>
<div class="split"><div class="l box box-pad" style="display:flex;flex-direction:column;gap:14px">
<h2 style="font-size:16px">수신 이메일</h2>
<p class="hint" style="margin:0">Cloudflare Email Routing 에서 '대상 주소'로 인증한 주소만 받을 수 있습니다. 보내는 주소: <strong>${esc(mailFrom)}</strong></p>
<label class="field">수신 이메일 1<input class="input" id="m1" type="email" value="${esc(s.notify_email_1)}"></label>
<label class="field">수신 이메일 2<input class="input" id="m2" type="email" value="${esc(s.notify_email_2)}"></label>
<fieldset style="border:0;margin:0;padding:0"><legend class="small" style="font-weight:700;margin-bottom:4px">메일 보낼 항목</legend>${ALL.map((k) => `<label class="check"><input type="checkbox" class="mk" value="${k}" ${kinds.includes(k) ? 'checked' : ''}>${k}</label>`).join('')}</fieldset>
<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="btn btn-sm" id="mTest">테스트 메일 보내기</button><button class="btn btn-red btn-sm" id="mSave">저장</button></div>
<div id="mTestResult" class="small"></div></div>
<div class="r box"><div class="box-head"><h2>발송 기록</h2><span class="hint">실패한 메일은 10분마다 최대 3번 다시 보냅니다</span></div>
<div class="scroll-x"><table class="a-table" style="min-width:640px"><thead><tr><th>시각</th><th>항목</th><th>신청번호</th><th>받는 주소</th><th>결과</th><th></th></tr></thead>
<tbody>${logs.length ? logs.map((l) => `<tr><td class="hint">${kst(l.created_at)}</td><td>${esc(l.kind)}</td><td>${esc(l.ref_no || '-')}</td><td>${esc(l.recipient)}</td><td>${l.status === 'sent' ? '<span class="st st-ok">발송 완료</span>' : `<span class="st st-wait">실패</span><br><span class="hint">${esc(l.error)} (${l.attempts}회)</span>`}</td><td style="white-space:nowrap"><button class="btn btn-xs" data-view="${l.id}">내용</button> ${l.status !== 'sent' ? `<button class="btn btn-xs btn-red" data-resend="${l.id}">다시 보내기</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="6" class="muted" style="padding:30px;text-align:center">발송 기록이 없습니다.</td></tr>'}</tbody></table></div></div></div>`;
  const save = () => api('/api/admin/settings', { method: 'PUT', body: { notify_email_1: $('#m1').value.trim(), notify_email_2: $('#m2').value.trim(), notify_kinds: $$('.mk:checked').map((x) => x.value) } });
  $('#mSave').addEventListener('click', () => run(save, '저장했습니다.'));
  $('#mTest').addEventListener('click', async () => {
    await run(save);
    const r = await run(() => api('/api/admin/mail-test', { method: 'POST' }));
    $('#mTestResult').innerHTML = r.results.map((x) => `${esc(x.recipient)} : ${x.status === 'sent' ? '<strong style="color:#067647">발송 완료</strong>' : `<strong class="red">실패</strong> ${esc(x.error)}`}`).join('<br>');
    refreshCounts();
  });
  $$('[data-resend]').forEach((b) => b.addEventListener('click', async () => { const r = await run(() => api(`/api/admin/mail-log/${b.dataset.resend}/resend`, { method: 'POST' })); toast(r.ok ? '다시 보냈습니다.' : '다시 실패했습니다. 주소 인증 상태를 확인해 주세요.', !r.ok); route(); refreshCounts(); }));
  $$('[data-view]').forEach((b) =>
    b.addEventListener('click', async () => {
      const { log } = await run(() => api('/api/admin/mail-log/' + b.dataset.view));
      const d = $('#dlg');
      $('#dlgBody').innerHTML = `<strong>${esc(log.subject)}</strong><iframe sandbox="" style="width:100%;height:420px;border:1px solid var(--line)" title="메일 내용"></iframe><div style="display:flex;justify-content:flex-end"><button class="btn btn-sm" value="close">닫기</button></div>`;
      $('#dlgBody iframe').srcdoc = log.body_html;
      d.showModal();
    })
  );
};

// ── 회사 정보 · 관리자 계정 · 테스트 정리 ───────────
PAGES.settings = async () => {
  const [{ settings: s }, { users }] = await Promise.all([api('/api/admin/settings'), api('/api/admin/users')]);
  const f = (k, label) => `<label class="field">${label}<input class="input" data-s="${k}" value="${esc(s[k] || '')}"></label>`;
  main.innerHTML = `<div class="a-title"><h1>회사 정보 · 관리자 계정</h1></div>
<div class="box box-pad" style="display:flex;flex-direction:column;gap:12px"><h2 style="font-size:16px">홈페이지 표시 정보</h2>
<div class="grid2">${f('site_phone', '대표전화')}${f('site_messenger', '카카오톡 · 라인 · 위챗 ID')}${f('company_address', '주소')}${f('company_biz_no', '사업자등록번호')}${f('company_ceo', '대표자')}${f('short_min_age_note', '단기 운전자 조건 문구')}</div>
<div style="display:flex;justify-content:flex-end"><button class="btn btn-red btn-sm" id="sSave">저장</button></div></div>
<div class="split"><div class="l box box-pad" style="display:flex;flex-direction:column;gap:10px"><h2 style="font-size:16px">관리자 계정</h2>
<table class="a-table"><tbody>${users.map((u) => `<tr><td><strong>${esc(u.username)}</strong> ${esc(u.name)}</td><td class="hint">${kst(u.created_at).slice(0, 10)}</td><td style="text-align:right">${u.id === me.id ? '<span class="hint">본인</span>' : `<button class="btn btn-xs" data-resetpw="${u.id}" data-name="${esc(u.username)}">비밀번호 재설정</button> <button class="btn-link" data-deluser="${u.id}">삭제</button>`}</td></tr>`).join('')}</tbody></table>
<div class="grid2"><label class="field">아이디<input class="input" id="nuId" autocomplete="off"></label><label class="field">이름<input class="input" id="nuName"></label><label class="field">비밀번호 (8자 이상)<input class="input" id="nuPw" type="password" autocomplete="new-password"></label></div>
<div style="display:flex;justify-content:flex-end"><button class="btn btn-black btn-sm" id="nuAdd">관리자 추가</button></div></div>
<div class="r box box-pad" style="display:flex;flex-direction:column;gap:10px"><h2 style="font-size:16px">내 비밀번호 변경</h2>
<label class="field">현재 비밀번호<input class="input" id="pwCur" type="password" autocomplete="current-password"></label>
<label class="field">새 비밀번호 (8자 이상)<input class="input" id="pwNew" type="password" autocomplete="new-password"></label>
<label class="field">새 비밀번호 확인<input class="input" id="pwNew2" type="password" autocomplete="new-password"></label>
<div style="display:flex;justify-content:flex-end"><button class="btn btn-black btn-sm" id="pwSave">변경</button></div></div></div>
<div class="box box-pad" style="display:flex;flex-direction:column;gap:10px;border-color:var(--red)"><h2 style="font-size:16px" class="red">테스트 데이터 정리 (최종 전환 전)</h2>
<p class="small" style="margin:0">예약 · 중장기 신청 · 문의 · 고객 · 메일 기록을 <strong>모두 삭제</strong>합니다. 차량 · 사진 · 가격표 · 장소 · 게시글 · 설정은 그대로 남습니다. 아래 칸에 <strong>테스트 데이터 삭제</strong>를 그대로 입력하세요.</p>
<div style="display:flex;gap:8px;flex-wrap:wrap"><input class="input" id="clean" style="max-width:260px" aria-label="확인 문구"><button class="btn btn-red btn-sm" id="cleanGo">삭제 실행</button></div></div>`;
  $('#sSave').addEventListener('click', () => run(() => api('/api/admin/settings', { method: 'PUT', body: Object.fromEntries($$('[data-s]').map((i) => [i.dataset.s, i.value])) }), '저장했습니다.'));
  $('#nuAdd').addEventListener('click', async () => { await run(() => api('/api/admin/users', { method: 'POST', body: { username: $('#nuId').value, name: $('#nuName').value, password: $('#nuPw').value } }), '관리자를 추가했습니다.'); route(); });
  $$('[data-deluser]').forEach((b) => b.addEventListener('click', async () => { if (!(await confirmBox('이 관리자 계정을 삭제할까요?', '삭제'))) return; await run(() => api('/api/admin/users/' + b.dataset.deluser, { method: 'DELETE' }), '삭제했습니다.'); route(); }));
  $('#pwSave').addEventListener('click', async () => {
    if ($('#pwNew').value !== $('#pwNew2').value) return toast('새 비밀번호 확인이 일치하지 않습니다.', true);
    await run(() => api('/api/admin/password', { method: 'POST', body: { current: $('#pwCur').value, next: $('#pwNew').value } }), '비밀번호를 바꿨습니다.');
    ['#pwCur', '#pwNew', '#pwNew2'].forEach((x) => ($(x).value = ''));
  });
  $$('[data-resetpw]').forEach((b) =>
    b.addEventListener('click', () => {
      const d = $('#dlg');
      $('#dlgBody').innerHTML = `<h2 style="font-size:17px">${esc(b.dataset.name)} 비밀번호 재설정</h2>
<p class="hint" style="margin:0">새 비밀번호를 정해 해당 관리자에게 전달해 주세요. 그 관리자는 로그인 후 '비밀번호 변경'으로 다시 바꾸면 됩니다.</p>
<label class="field">새 비밀번호 (8자 이상)<input class="input" id="rpNew" type="password" autocomplete="new-password"></label>
<label class="field">새 비밀번호 확인<input class="input" id="rpNew2" type="password" autocomplete="new-password"></label>
<p class="error-msg" id="rpErr" role="alert" style="margin:0"></p>
<div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-sm" value="close" formnovalidate>취소</button><button class="btn btn-red btn-sm" type="button" id="rpSave">재설정</button></div>`;
      d.showModal();
      $('#rpSave').addEventListener('click', async () => {
        const err = $('#rpErr');
        err.textContent = '';
        if ($('#rpNew').value.length < 8) return (err.textContent = '비밀번호는 8자 이상으로 정해 주세요.');
        if ($('#rpNew').value !== $('#rpNew2').value) return (err.textContent = '비밀번호 확인이 일치하지 않습니다.');
        try {
          await api(`/api/admin/users/${b.dataset.resetpw}/password`, { method: 'POST', body: { password: $('#rpNew').value } });
          d.close();
          toast('비밀번호를 재설정했습니다.');
        } catch (e) {
          err.textContent = e.message;
        }
      });
    })
  );
  $('#cleanGo').addEventListener('click', async () => {
    if (!(await confirmBox('예약 · 신청 · 문의 · 고객 · 메일 기록을 모두 삭제합니다. 되돌릴 수 없습니다.', '모두 삭제'))) return;
    await run(() => api('/api/admin/cleanup-test', { method: 'POST', body: { confirm: $('#clean').value } }), '테스트 데이터를 정리했습니다.');
    refreshCounts();
  });
};

// ── 견적 사용자 계정 (관리자가 발급 · /quote 로 로그인) ──────
PAGES.quoteusers = async () => {
  const { users } = await api('/api/admin/quote-users');
  const loginUrl = location.origin + '/quote';
  const on = users.filter((u) => u.active).length;
  main.innerHTML = `<div class="a-title"><div><h1>견적 사용자 계정</h1><p class="desc">제휴사 · 영업 담당자에게 발급하는 계정입니다. 이 계정으로는 관리자 화면과 관리자용 견적기에 들어올 수 없습니다.</p></div></div>
<div class="box box-pad" style="display:flex;flex-direction:column;gap:8px"><h2 style="font-size:16px">사용자 로그인 주소</h2>
<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input class="input" id="quLink" value="${esc(loginUrl)}" readonly style="max-width:360px" aria-label="사용자 로그인 주소"><button class="btn btn-sm" id="quCopy">주소 복사</button></div>
<p class="hint" style="margin:0">아이디 · 비밀번호와 함께 이 주소를 전달하세요.</p></div>
<div class="box"><div class="box-head"><h2>계정 목록 <span class="hint">사용 중 ${on} · 전체 ${users.length}</span></h2></div>
<div style="overflow-x:auto"><table class="a-table"><thead><tr><th>아이디</th><th>이름 · 소속</th><th>연락처</th><th>상태</th><th>최근 접속</th><th>등록일</th><th></th></tr></thead>
<tbody>${users.length ? users.map((u) => `<tr><td><strong>${esc(u.username)}</strong></td><td>${esc(u.name)}${u.company ? `<br><span class="hint">${esc(u.company)}</span>` : ''}${u.memo ? `<br><span class="hint">메모: ${esc(u.memo)}</span>` : ''}</td><td>${esc(u.phone || '-')}</td><td>${u.active ? '<span class="st st-ok">사용 중</span>' : '<span class="st st-off">사용 중지</span>'}</td><td class="hint">${u.last_login_at ? kst(u.last_login_at) : '접속 전'}</td><td class="hint">${kst(u.created_at).slice(0, 10)}</td><td style="text-align:right;white-space:nowrap"><a class="btn btn-xs" href="#quotelogs?user=${u.id}">견적 기록</a> <button class="btn btn-xs" data-qedit="${u.id}">수정</button> <button class="btn btn-xs" data-qpw="${u.id}">비밀번호 재설정</button> <button class="btn-link" data-qdel="${u.id}">삭제</button></td></tr>`).join('') : '<tr><td colspan="7" class="muted" style="padding:40px;text-align:center">아직 발급한 계정이 없습니다. 아래에서 첫 계정을 만들어 주세요.</td></tr>'}</tbody></table></div></div>
<div class="box box-pad" style="display:flex;flex-direction:column;gap:12px"><h2 style="font-size:16px">새 계정 만들기</h2>
<div class="grid2"><label class="field">아이디 (영문 · 숫자 3자 이상)<input class="input" id="qnId" autocomplete="off"></label><label class="field">비밀번호 (8자 이상)<input class="input" id="qnPw" type="text" autocomplete="off"></label>
<label class="field">이름<input class="input" id="qnName"></label><label class="field">소속 (회사 · 지점)<input class="input" id="qnCompany"></label>
<label class="field">연락처<input class="input" id="qnPhone" inputmode="tel"></label><label class="field">메모 (관리자만 보임)<input class="input" id="qnMemo"></label></div>
<p class="hint" style="margin:0">비밀번호는 전달하기 쉽게 글자가 보이도록 입력됩니다. 사용자가 처음 로그인한 뒤 '비밀번호 변경'으로 바꾸도록 안내해 주세요.</p>
<div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-sm" id="qnGen" type="button">비밀번호 자동 생성</button><button class="btn btn-red btn-sm" id="qnAdd" type="button">계정 만들기</button></div></div>`;

  const copyText = async (text, inputSel) => {
    try { await navigator.clipboard.writeText(text); toast('복사했습니다.'); } catch { $(inputSel).select(); toast('내용을 선택했습니다. Ctrl+C 로 복사하세요.'); }
  };
  $('#quCopy').addEventListener('click', () => copyText(loginUrl, '#quLink'));
  const genPw = () => {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return [...crypto.getRandomValues(new Uint32Array(10))].map((x) => c[x % c.length]).join('');
  };
  $('#qnGen').addEventListener('click', () => ($('#qnPw').value = genPw()));
  $('#qnAdd').addEventListener('click', async () => {
    const body = { username: $('#qnId').value.trim(), password: $('#qnPw').value, name: $('#qnName').value, company: $('#qnCompany').value, phone: $('#qnPhone').value, memo: $('#qnMemo').value };
    try { await run(() => api('/api/admin/quote-users', { method: 'POST', body })); } catch { return; }
    const d = $('#dlg');
    $('#dlgBody').innerHTML = `<h2 style="font-size:17px">계정을 만들었습니다</h2>
<p class="hint" style="margin:0">아래 내용을 사용자에게 전달하세요. 이 창을 닫으면 비밀번호는 다시 볼 수 없습니다.</p>
<textarea class="textarea" id="qnInfo" rows="4" readonly style="font-size:14px">로그인 주소: ${esc(loginUrl)}
아이디: ${esc(body.username)}
비밀번호: ${esc(body.password)}</textarea>
<div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-sm" type="button" id="qnCopy">복사</button><button class="btn btn-red btn-sm" value="close">닫기</button></div>`;
    d.onclose = () => { d.onclose = null; route(); };
    d.showModal();
    $('#qnCopy').addEventListener('click', () => copyText($('#qnInfo').value, '#qnInfo'));
  });

  $$('[data-qedit]').forEach((b) => b.addEventListener('click', () => {
    const u = users.find((x) => x.id === +b.dataset.qedit);
    const d = $('#dlg');
    $('#dlgBody').innerHTML = `<h2 style="font-size:17px">${esc(u.username)} 수정</h2>
<label class="field">이름<input class="input" id="qeName" value="${esc(u.name)}"></label>
<label class="field">소속<input class="input" id="qeCompany" value="${esc(u.company)}"></label>
<label class="field">연락처<input class="input" id="qePhone" value="${esc(u.phone)}"></label>
<label class="field">메모 (관리자만 보임)<input class="input" id="qeMemo" value="${esc(u.memo)}"></label>
<label class="check"><input type="checkbox" id="qeActive" ${u.active ? 'checked' : ''}> 사용 중 (해제하면 바로 로그아웃되고 다시 로그인할 수 없습니다)</label>
<p class="error-msg" id="qeErr" role="alert" style="margin:0"></p>
<div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-sm" value="close" formnovalidate>취소</button><button class="btn btn-red btn-sm" type="button" id="qeSave">저장</button></div>`;
    d.onclose = null;
    d.showModal();
    $('#qeSave').addEventListener('click', async () => {
      try {
        await api('/api/admin/quote-users/' + u.id, { method: 'PUT', body: { name: $('#qeName').value, company: $('#qeCompany').value, phone: $('#qePhone').value, memo: $('#qeMemo').value, active: $('#qeActive').checked } });
        d.close(); toast('저장했습니다.'); route();
      } catch (e) { $('#qeErr').textContent = e.message; }
    });
  }));

  $$('[data-qpw]').forEach((b) => b.addEventListener('click', () => {
    const u = users.find((x) => x.id === +b.dataset.qpw);
    const d = $('#dlg');
    $('#dlgBody').innerHTML = `<h2 style="font-size:17px">${esc(u.username)} 비밀번호 재설정</h2>
<p class="hint" style="margin:0">새 비밀번호를 사용자에게 전달해 주세요. 그 사용자가 지금 접속해 있으면 로그아웃됩니다.</p>
<label class="field">새 비밀번호 (8자 이상)<input class="input" id="qpNew" type="text" autocomplete="off" value="${genPw()}"></label>
<p class="error-msg" id="qpErr" role="alert" style="margin:0"></p>
<div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-sm" value="close" formnovalidate>취소</button><button class="btn btn-red btn-sm" type="button" id="qpSave">재설정</button></div>`;
    d.onclose = null;
    d.showModal();
    $('#qpSave').addEventListener('click', async () => {
      const pw = $('#qpNew').value;
      if (pw.length < 8) return ($('#qpErr').textContent = '비밀번호는 8자 이상으로 정해 주세요.');
      try {
        await api(`/api/admin/quote-users/${u.id}/password`, { method: 'POST', body: { password: pw } });
        d.close(); toast(`${u.username} 비밀번호를 재설정했습니다.`);
      } catch (e) { $('#qpErr').textContent = e.message; }
    });
  }));

  $$('[data-qdel]').forEach((b) => b.addEventListener('click', async () => {
    const u = users.find((x) => x.id === +b.dataset.qdel);
    if (!(await confirmBox(`${u.username} (${u.name}) 계정을 삭제할까요?\n잠시 못 쓰게 하려면 삭제 대신 '수정'에서 사용 중지를 하세요.`, '삭제'))) return;
    await run(() => api('/api/admin/quote-users/' + u.id, { method: 'DELETE' }), '삭제했습니다.');
    route();
  }));
};

// ── 견적 설정: 사용자 견적에 쓰이는 금리 · 보험료 · 자동차세 · 최대 잔가율 (사용자에게는 보이지 않음) ──
PAGES.quoteconfig = async () => {
  const { config: c, groups, terms, models, insFields } = await api('/api/admin/quote-config');
  let grades = c.insGrades.map((g) => ({ ...g }));
  const p100 = (x) => (x === null || x === undefined || x === '' ? '' : String(Math.round(x * 10000) / 100));
  const f = (k, label, v = c[k]) => `<label class="field">${label}<input class="input" data-c="${k}" value="${esc(v)}"></label>`;
  const rvRow = (key, label, arr) => `<tr data-rv="${esc(key)}"><td><strong>${esc(label)}</strong></td>${terms.map((t, i) => `<td><input class="input" style="text-align:right" data-i="${i}" value="${p100(arr?.[i])}" placeholder="-" aria-label="${esc(label)} ${t}개월"></td>`).join('')}</tr>`;
  main.innerHTML = `<div class="a-title"><div><h1>견적 설정</h1><p class="desc">견적 사용자 화면(/quote)의 렌트료 계산에 쓰입니다. 이 화면의 값은 사용자에게 보이지 않고, 사용자는 결과 금액만 봅니다.</p></div><button class="btn btn-red btn-sm" id="qcSave1">저장</button></div>
<div class="box box-pad" style="display:flex;flex-direction:column;gap:12px"><h2 style="font-size:16px">금리 · 보험료</h2>
<p class="hint" style="margin:0">렌트료 계산의 AG 수수료는 여기서 정한 관리자 AG에, 사용자가 상품별로 직접 넣는 사용자 AG를 더한 금액입니다.</p>
<div class="grid2">${f('rate', '금리 (연 %)')}${f('insurance', '보험료 (월, 원)')}${f('ag', '관리자 AG 수수료 (% 또는 원, 예: 1%) — 사용자에게 안 보임')}${f('maint', '정비료 (월, 원) — Self 는 0')}</div></div>
<div class="box box-pad" style="display:flex;flex-direction:column;gap:12px"><h2 style="font-size:16px">최대 잔가율 (%)</h2>
<p class="hint" style="margin:0">사용자는 이 값 이하로만 잔가율을 넣을 수 있고, 비워 두면 최대값이 적용됩니다. 약정거리가 기준보다 길면 아래 조정만큼 최대값이 내려갑니다. 칸을 비우면 그 기간은 견적을 낼 수 없습니다.</p>
<div class="grid2">${f('rvKm', '잔가 기준 약정거리 (km/년)')}${f('rvAdj', '5천km당 잔가 조정 (%p)')}</div>
<input class="input" id="rvFind" placeholder="잔가그룹 찾기 (예: 쏘렌토)" style="max-width:280px" aria-label="잔가그룹 찾기">
<div style="overflow-x:auto;max-height:520px;overflow-y:auto;border:1px solid var(--line)"><table class="a-table" id="rvTbl" style="min-width:560px"><thead><tr><th style="position:sticky;top:0">잔가그룹</th>${terms.map((t) => `<th style="position:sticky;top:0;text-align:right">${t}개월</th>`).join('')}</tr></thead>
<tbody>${rvRow('__default', '잔가표에 없는 차종', c.rvDefault)}${groups.map((g) => rvRow(g, g, c.rv[g])).join('')}</tbody></table></div></div>
<div class="box box-pad" style="display:flex;flex-direction:column;gap:12px"><h2 style="font-size:16px">자동차세</h2>
<label class="field" style="max-width:260px">승용 자동차세 기준<select class="select" data-c="carTax">${opts([['영업용', '영업용'], ['비영업용', '비영업용']], c.carTax)}</select></label>
<div class="split"><div class="l" style="overflow-x:auto"><table class="a-table" id="ccTbl"><thead><tr><th>승용 배기량</th><th style="text-align:right">영업용 (cc당)</th><th style="text-align:right">비영업용 (cc당)</th></tr></thead><tbody>
${c.cc.map((r, i) => `<tr><td>${i < c.cc.length - 1 ? `${won(r[0])} ~ ${won(c.cc[i + 1][0] - 1)}cc` : `${won(r[0])}cc 초과`}</td><td><input class="input" style="text-align:right" data-cc="${i}" data-j="1" value="${r[1]}"></td><td><input class="input" style="text-align:right" data-cc="${i}" data-j="2" value="${r[2]}"></td></tr>`).join('')}</tbody></table></div>
<div class="r" style="overflow-x:auto"><table class="a-table" id="fxTbl"><thead><tr><th>화물 · 승합 · 전기 (연 정액)</th><th style="text-align:right">영업용</th><th style="text-align:right">비영업용</th><th>적용</th></tr></thead><tbody>
${c.fixed.map((r, i) => `<tr><td>${esc(r[0])}</td><td><input class="input" style="text-align:right" data-fx="${i}" data-j="1" value="${r[1]}"></td><td><input class="input" style="text-align:right" data-fx="${i}" data-j="2" value="${r[2]}"></td><td><select class="select" data-fx="${i}" data-j="3">${opts([['영업용', '영업용'], ['비영업용', '비영업용']], r[3])}</select></td></tr>`).join('')}</tbody></table></div></div></div>
<div class="box box-pad" style="display:flex;flex-direction:column;gap:12px"><h2 style="font-size:16px">취득 비용 · 시공비</h2>
<div class="grid2">${f('acq', '취득세율 (%)')}${f('plate1', '보조번호판')}${f('plate2', '번호판대')}${f('stamp', '인지대')}${f('reg', '등록대행 수수료')}${f('bond', '공채 할인비용')}${f('tint', '썬팅 시공비 (VAT포함)')}${f('bb', '블랙박스 시공비 (VAT포함)')}${f('del1', '제조사 탁송료 기본값 (사용자가 바꿀 수 있음)')}</div></div>
<div class="box box-pad" style="display:flex;flex-direction:column;gap:12px"><h2 style="font-size:16px">보험 조건 (차종별 · 고객 견적서에 표시)</h2>
<p class="hint" style="margin:0">보험 등급마다 보상 한도와 면책금을 정하고, 아래 차종 표에서 차종별로 등급을 지정합니다. 견적서에는 선택한 차종의 등급 값이 나갑니다.</p>
<div class="grid2">${f('insAge', '운전가능연령 (전 차종 공통)')}</div>
<div style="overflow-x:auto"><table class="a-table" id="grTbl" style="min-width:1100px"></table></div>
<div><button class="btn btn-sm" type="button" id="grAdd">+ 보험 등급 추가</button></div>
<input class="input" id="imFind" placeholder="차종 찾기 (예: 쏘렌토, 스타리아)" style="max-width:280px" aria-label="차종 찾기">
<div style="overflow-x:auto;max-height:520px;overflow-y:auto;border:1px solid var(--line)"><table class="a-table" id="imTbl" style="min-width:520px"></table></div></div>
<div class="box box-pad" style="display:flex;flex-direction:column;gap:12px"><h2 style="font-size:16px">견적서 문구 (고객 견적서에 표시)</h2>
<div class="grid2">${f('company', '회사명')}${f('call', '사고접수 · 긴급출동 번호')}${f('maturity', '만기처리 (예: 반납형)')}${f('insNote', '보험 안내 문구 (보험 표 아래 ※ 한 줄, 비우면 표시 안 함)')}</div>
<label class="field">안내사항<textarea class="textarea" data-c="guide" rows="3">${esc(c.guide)}</textarea></label></div>
<div style="display:flex;justify-content:flex-end"><button class="btn btn-red btn-sm" id="qcSave2">저장</button></div>`;

  // 보험 등급 표 · 차종별 등급 지정
  const curMap = { ...c.insMap };
  const drawGrades = () => {
    $('#grTbl').innerHTML = `<thead><tr><th>등급명</th>${insFields.map(([, l]) => `<th>${esc(l)}</th>`).join('')}<th>차종 수</th><th></th></tr></thead><tbody>${grades.map((g, i) => `<tr><td><input class="input" data-g="${i}" data-k="name" value="${esc(g.name)}" style="min-width:90px"></td>${insFields.map(([k]) => `<td><input class="input" data-g="${i}" data-k="${k}" value="${esc(g[k] || '')}" style="min-width:100px"></td>`).join('')}<td class="hint" style="white-space:nowrap">${Object.values(curMap).filter((v) => v === g.id).length}개</td><td>${grades.length > 1 ? `<button class="btn-link" type="button" data-gdel="${i}">삭제</button>` : ''}</td></tr>`).join('')}</tbody>`;
    $$('[data-gdel]').forEach((b) => b.addEventListener('click', () => {
      const g = grades[+b.dataset.gdel];
      grades.splice(+b.dataset.gdel, 1);
      for (const k in curMap) if (curMap[k] === g.id) curMap[k] = grades[0].id;
      drawGrades(); drawMap();
    }));
  };
  const drawMap = () => {
    const q = $('#imFind').value.trim();
    $('#imTbl').innerHTML = `<thead><tr><th style="position:sticky;top:0">제조사</th><th style="position:sticky;top:0">구분</th><th style="position:sticky;top:0">모델</th><th style="position:sticky;top:0">보험 등급</th></tr></thead><tbody>${models.filter((m) => !q || m.model.includes(q) || m.cat.includes(q)).map((m) => `<tr><td>${esc(m.mk)}</td><td>${esc(m.cat)}</td><td><strong>${esc(m.model)}</strong></td><td><select class="select" data-im="${esc(m.key)}">${opts(grades.map((g) => [g.id, `${g.name} (자차 ${g.car || '-'})`]), curMap[m.key])}</select></td></tr>`).join('')}</tbody>`;
    $$('[data-im]').forEach((s) => s.addEventListener('change', () => { curMap[s.dataset.im] = s.value; drawGrades(); }));
  };
  $('#grTbl').addEventListener('input', (e) => {
    const t = e.target; if (t.dataset.g === undefined) return;
    grades[+t.dataset.g][t.dataset.k] = t.value;
    if (t.dataset.k === 'name' || t.dataset.k === 'car') drawMap();
  });
  $('#grAdd').addEventListener('click', () => {
    let n = grades.length + 1; while (grades.some((g) => g.id === 'g' + n)) n++;
    grades.push({ ...grades[grades.length - 1], id: 'g' + n, name: '새 등급' });
    drawGrades(); drawMap();
  });
  $('#imFind').addEventListener('input', drawMap);
  drawGrades(); drawMap();

  $('#rvFind').addEventListener('input', () => {
    const q = $('#rvFind').value.trim();
    $$('#rvTbl tbody tr').forEach((tr) => (tr.hidden = !!q && tr.dataset.rv !== '__default' && !tr.dataset.rv.includes(q)));
  });
  const collect = () => {
    const b = {};
    $$('[data-c]').forEach((el) => (b[el.dataset.c] = el.value));
    const rvOf = (tr) => $$('input', tr).map((i) => { const v = i.value.trim().replace('%', ''); return v === '' ? null : Number(v) / 100; });
    b.rv = {};
    for (const tr of $$('#rvTbl tbody tr')) {
      if (tr.dataset.rv === '__default') b.rvDefault = rvOf(tr);
      else b.rv[tr.dataset.rv] = rvOf(tr);
    }
    b.cc = c.cc.map((r) => [...r]);
    $$('[data-cc]').forEach((el) => (b.cc[+el.dataset.cc][+el.dataset.j] = el.value));
    b.fixed = c.fixed.map((r) => [...r]);
    $$('[data-fx]').forEach((el) => (b.fixed[+el.dataset.fx][+el.dataset.j] = el.value));
    b.insGrades = grades;
    b.insMap = curMap;
    return b;
  };
  const bad = () => {
    for (const i of $$('#rvTbl input')) { const v = i.value.trim().replace('%', ''); if (v !== '' && !(Number(v) > 0 && Number(v) < 100)) { i.focus(); return '최대 잔가율은 0보다 크고 100보다 작은 % 숫자로 넣어 주세요.'; } }
    return '';
  };
  const save = async () => {
    const msg = bad();
    if (msg) return toast(msg, true);
    await run(() => api('/api/admin/quote-config', { method: 'PUT', body: collect() }), '견적 설정을 저장했습니다. 사용자 견적에 바로 적용됩니다.');
    route();
  };
  $('#qcSave1').addEventListener('click', save);
  $('#qcSave2').addEventListener('click', save);
};

// ── 견적 발행 기록: 누가 어느 견적을 냈는지 ──
PAGES.quotelogs = async (arg) => {
  if (arg) return quoteLogDetail(+arg);
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const user = q.get('user') || '', kw = q.get('q') || '', page = +q.get('page') || 1;
  const d = await api(`/api/admin/quote-logs?user=${encodeURIComponent(user)}&q=${encodeURIComponent(kw)}&page=${page}`);
  const pages = Math.max(1, Math.ceil(d.total / d.size));
  const go = (o) => { const p = new URLSearchParams({ user, q: kw, page: 1, ...o }); location.hash = '#quotelogs?' + p.toString(); };
  main.innerHTML = `<div class="a-title"><div><h1>견적 발행 기록</h1><p class="desc">견적 사용자가 '견적서 발행'을 누를 때마다 기록됩니다. 줄을 누르면 적용된 금리 · 보험료와 계산 내역을 볼 수 있습니다.</p></div></div>
<div class="box"><div class="toolbar"><select class="select" id="lgUser" aria-label="사용자">${opts([['', '전체 사용자'], ...d.users.map((u) => [u.user_id, `${u.user_name || '(삭제된 계정)'}${u.user_company ? ' · ' + u.user_company : ''} (${u.n})`])], user)}</select>
<input class="input" id="lgQ" value="${esc(kw)}" placeholder="견적번호 · 고객 · 차량 검색" style="min-width:220px"><button class="btn btn-sm" id="lgGo">검색</button><span class="hint">${d.total}건</span></div>
<div style="overflow-x:auto"><table class="a-table"><thead><tr><th>견적번호 · 발행일시</th><th>사용자</th><th>고객</th><th>차량</th><th class="num">차량가격</th><th>월 렌트료 (VAT포함)</th></tr></thead>
<tbody>${d.logs.length ? d.logs.map((x) => `<tr class="click" data-id="${x.id}"><td><strong>${esc(x.no)}</strong><br><span class="hint">${kst(x.created_at)}</span></td><td>${esc(x.user_name)}<br><span class="hint">${esc(x.user_company || x.username)}</span></td><td>${esc(x.customer_name || '-')}<br><span class="hint">${esc(x.customer_type)}</span></td><td>${esc(x.vehicle)}</td><td class="num">${won(x.price)}</td><td>${esc(x.summary)}</td></tr>`).join('') : '<tr><td colspan="6" class="muted" style="padding:40px;text-align:center">아직 발행된 견적이 없습니다.</td></tr>'}</tbody></table></div>
${pages > 1 ? `<div class="toolbar" style="border-top:1px solid var(--line);border-bottom:0;justify-content:center">${page > 1 ? `<button class="btn btn-xs" data-pg="${page - 1}">이전</button>` : ''}<span class="hint">${page} / ${pages}</span>${page < pages ? `<button class="btn btn-xs" data-pg="${page + 1}">다음</button>` : ''}</div>` : ''}</div>`;
  $('#lgUser').addEventListener('change', () => go({ user: $('#lgUser').value }));
  $('#lgGo').addEventListener('click', () => go({ q: $('#lgQ').value.trim() }));
  $('#lgQ').addEventListener('keydown', (e) => e.key === 'Enter' && go({ q: $('#lgQ').value.trim() }));
  $$('[data-pg]').forEach((b) => b.addEventListener('click', () => go({ page: b.dataset.pg })));
  $$('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => (location.hash = '#quotelogs/' + tr.dataset.id)));
};

async function quoteLogDetail(id) {
  const { log: x } = await api('/api/admin/quote-logs/' + id);
  const r = x.result || {}, inp = x.input || {}, v = r.vehicle || {}, it = r.internal || {};
  const ps = (r.products || []).filter((o) => o.on);
  const pc = (n) => (Number.isFinite(n) ? (Math.round(n * 10000) / 100).toFixed(2) + '%' : '-');
  const row = (label, f, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}><td>${label}</td>${ps.map((o) => `<td class="num">${o.error ? (label === '월 납입금' ? `<span class="red">${esc(o.error)}</span>` : '') : f(o)}</td>`).join('')}</tr>`;
  main.innerHTML = `<div class="a-title"><div><h1>견적 ${esc(x.no)}</h1><p class="desc">${kst(x.created_at)} 발행</p></div><a class="btn btn-sm" href="#quotelogs">목록으로</a></div>
<div class="split"><div class="l box box-pad" style="display:flex;flex-direction:column;gap:10px"><h2 style="font-size:16px">발행 정보</h2>
<dl class="dl"><dt>사용자</dt><dd>${esc(x.user_name)} (${esc(x.username)})${x.user_company ? ' · ' + esc(x.user_company) : ''}</dd>
<dt>고객</dt><dd>${esc(x.customer_name || '-')} (${esc(x.customer_type)})</dd><dt>견적서 담당자</dt><dd>${esc([inp.mgr, inp.tel].filter(Boolean).join(' / ') || '-')}</dd><dt>견적일</dt><dd>${esc(inp.date || '-')}</dd></dl></div>
<div class="r box box-pad" style="display:flex;flex-direction:column;gap:10px"><h2 style="font-size:16px">차량</h2>
<dl class="dl"><dt>차량</dt><dd>${esc(x.vehicle)}</dd><dt>기본가격</dt><dd>${won(v.base)}원</dd>
<dt>옵션</dt><dd>${(v.optList || []).length ? v.optList.map((o) => `${esc(o[0])} (${won(o[1])})`).join('\n') : '없음'}</dd>
<dt>추가금</dt><dd>${won(v.extra)}원</dd><dt>차량가격</dt><dd><strong>${won(v.price)}원</strong></dd>
<dt>색상</dt><dd>외장 ${esc(inp.ext || '-')} / 내장 ${esc(inp.int || '-')}</dd>
<dt>탁송</dt><dd>제조사 ${won(inp.del1)} · 2차 ${won(inp.del2)} · 3차 ${won(inp.del3)}</dd>
<dt>보험</dt><dd>${v.ins ? `${esc(v.ins.grade)} · 자차 한도 ${esc(v.ins.car)} · 면책금 대인 ${esc(v.ins.dBi)} / 대물 ${esc(v.ins.dPd)} / 자손 ${esc(v.ins.dSelf)} / 자차 ${esc(v.ins.dCar)}` : '-'}</dd>
<dt>장착</dt><dd>썬팅 ${esc(inp.tint)} · 블랙박스 ${esc(inp.bb)}${inp.otherName ? ` · ${esc(inp.otherName)} ${won(inp.otherAmt)}원` : ''}</dd></dl></div></div>
<div class="box"><div class="box-head"><h2>상품별 계산 (관리자만 보임)</h2><span class="hint">적용 금리 ${pc(it.rate)} · 보험료 월 ${won(it.ins)}원 · 관리자 AG ${esc(it.ag)} · 연 자동차세 ${won(it.yTax)}원 · 잔가그룹 ${esc(it.rvGroup || '-')}</span></div>
<div style="overflow-x:auto"><table class="a-table"><thead><tr><th>항목</th>${ps.map((o) => `<th class="num">${o.n}개월</th>`).join('')}</tr></thead><tbody>
${row('약정거리', (o) => won(o.km) + 'km')}${row('선납금', (o) => won(o.pre))}${row('보증금', (o) => won(o.dep))}
${row('잔가율 (적용 / 최대)', (o) => `${pc(o.rv)} / ${pc(o.rvMax)}`)}${row('잔가금액 (공급가)', (o) => won(o.rvAmt))}
${row('총 취득원가', () => won(it.acqCost))}${row('AG 수수료 · 관리자', (o) => won(o.agAdmin ?? o.ag))}${row('AG 수수료 · 사용자 입력', (o) => (o.agUser !== undefined ? won(o.agUser) : '-'))}${row('AG 수수료 합계', (o) => won(o.ag))}${row('총 투입원가', (o) => won(o.invest))}
${row('월 렌트료 (금융분)', (o) => won(o.fin))}${row('자동차세 (월)', (o) => won(o.tax))}${row('보험료 (월)', (o) => won(o.ins))}${row('정비 (월)', (o) => won(o.maint))}
${row('월 렌트료 (공급가)', (o) => won(o.supply))}${row('부가세', (o) => won(o.vat))}${row('월 납입금', (o) => `<strong>${won(o.month)}</strong>`)}
${row('출고 전 납입', (o) => won(o.upfront))}${row('총 납입 (월 × 기간 + 선납)', (o) => won(o.total))}${row('실질금리 (AG 지급 후)', (o) => pc(o.irr))}
</tbody></table></div></div>`;
}


boot();
