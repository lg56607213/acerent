// 에이스렌터카 홈페이지 관리자
import { api, $, $$, esc, won, classImage } from '/assets/common.js';
import { shrink } from '/assets/shrink.js';
import { quote, rateAmount, DEFAULT_PRICING } from '/assets/longcalc.js';
import { OPTION_GROUPS, MAKERS, STATUS as LONG_STATUS_ALL, MAINT as MAINT_MAP, MAINT_DEFAULT as MAINT_DEF, AGE as AGE_MAP, DRIVER_DEFAULT as DRIVER_DEF } from '/assets/longopts.js';

const main = $('#main');
const RES_ST = { pending: ['확정 대기', 'st-wait'], confirmed: ['확정', 'st-ok'], done: ['반납 완료', 'st-off'], cancelled: ['취소', 'st-off'] };
const REV_ST = { pending: '확인 대기', published: '게시 중', hidden: '숨김' };
const APP_ST = { review: ['심사 대기', 'st-wait'], approved: ['승인', 'st-ok'], contracted: ['계약 완료', 'st-off'], rejected: ['부결', 'st-off'], cancelled: ['취소', 'st-off'] };
const LONG_ST = LONG_STATUS_ALL;
const LONG_STATUS = LONG_STATUS_ALL;
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
    if ($('#cntReview')) $('#cntReview').textContent = d.reviewTodo || '';
    if ($('#cntQuote')) $('#cntQuote').textContent = d.pendingQuoteUsers || '';
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
  const mk = sessionStorage.getItem('cusMk') || '';
  const r = await api(`/api/admin/customers?q=${encodeURIComponent(q)}&kind=${encodeURIComponent(kind)}&mk=${encodeURIComponent(mk)}`);
  main.innerHTML = `
<div class="a-title"><div><h1>고객 관리</h1><p class="desc">예약 · 신청 · 문의를 남긴 고객이 연락처 기준으로 자동 등록됩니다.</p></div><a class="btn btn-sm" href="/api/admin/export/customers">엑셀(CSV) 다운로드</a></div>
<div class="box"><div class="toolbar">
<input class="input" id="fQ" type="search" placeholder="이름 · 연락처 · 법인명" value="${esc(q)}" aria-label="검색">
<select class="select" id="fKind" aria-label="구분">${opts([['', '전체'], ['개인', '개인'], ['개인사업자', '개인사업자'], ['법인', '법인']], kind)}</select>
<select class="select" id="fMk" aria-label="마케팅 수신">${opts([['', '마케팅 수신 전체'], ['agree', '수신 동의 고객'], ['renew', '2년 재안내 대상']], mk)}</select>
<button class="btn btn-sm btn-black" id="fGo">검색</button></div>
${mk === 'renew' ? '<p class="hint" style="margin:0;padding:10px 16px;border-bottom:1px solid var(--line)">수신 동의 후 2년이 되기 전에 "수신 동의 상태와 동의 일자" 를 문자로 안내해야 합니다 (정보통신망법). 안내 후 고객 화면에서 동의 상태를 다시 저장하면 날짜가 갱신됩니다.</p>' : ''}
<div class="scroll-x"><table class="a-table" style="min-width:760px"><thead><tr><th>고객</th><th>구분</th><th>연락처</th><th class="num">단기 예약</th><th class="num">중장기 신청</th><th class="num">문의</th><th class="num">후기</th><th>마케팅</th><th>최근 활동</th></tr></thead>
<tbody>${r.customers.length ? r.customers.map((c) => `<tr class="click" data-id="${c.id}"><td><strong>${esc(c.company || c.name)}</strong>${c.company ? `<br><span class="hint">${esc(c.name)}</span>` : ''}</td><td>${esc(c.kind)}</td><td>${esc(c.phone)}</td><td class="num">${c.res_n}</td><td class="num">${c.app_n}</td><td class="num">${c.inq_n}</td><td class="num">${c.rev_n}</td><td>${c.marketing_agree ? '<span class="st st-ok">동의</span>' : '<span class="hint">-</span>'}</td><td class="hint">${kst(c.updated_at)}</td></tr>`).join('') : '<tr><td colspan="9" class="muted" style="padding:40px;text-align:center">고객이 없습니다.</td></tr>'}</tbody></table></div></div>
<div id="detail"></div>`;
  const go = () => { sessionStorage.setItem('cusQ', $('#fQ').value); sessionStorage.setItem('cusKind', $('#fKind').value); sessionStorage.setItem('cusMk', $('#fMk').value); route(); };
  $('#fGo').addEventListener('click', go);
  $('#fQ').addEventListener('keydown', (e) => e.key === 'Enter' && go());
  $('#fKind').addEventListener('change', go);
  $('#fMk').addEventListener('change', go);
  const open = async (id) => {
    $$('tr[data-id]').forEach((t) => t.classList.toggle('sel', +t.dataset.id === id));
    const d = await run(() => api('/api/admin/customers/' + id));
    const c = d.customer;
    const hist = [
      ...d.reservations.map((x) => [x.created_at, '단기 예약', `${x.no} · ${x.model_name} · ${dt(x.pickup_at)} ~ ${dt(x.return_at)} · ${x.location_name} · ${won(x.total_amt)}원`, RES_ST[x.status]?.[0]]),
      ...d.applications.map((x) => [x.created_at, x.applicant_type === 'corp' ? '법인 견적' : '중장기 신청', `${x.no} · ${x.vehicle_name || ''}${x.term ? ` · ${x.term}개월` : ''}${x.monthly ? ` · 월 ${won(x.monthly)}원` : ''}`, APP_ST[x.status]?.[0]]),
      ...d.inquiries.map((x) => [x.created_at, '1:1 문의', `${x.type} · ${x.title}`, x.status === 'done' ? '답변완료' : '답변대기']),
      ...(d.reviews || []).map((x) => [x.created_at, '이용후기', `${'★'.repeat(x.rating)} ${x.title}`, x.coupon === 'sent' ? '쿠폰 발송' : REV_ST[x.status]]),
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
<dl class="dl"><dt>연락처</dt><dd><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>${c.phone_verified_at ? ' <span class="hint">(문자 인증 ' + kst(c.phone_verified_at).slice(0, 10) + ')</span>' : ''}</dd><dt>처음 경로</dt><dd>${esc(c.source || '-')}</dd><dt>등록일</dt><dd>${kst(c.created_at)}</dd><dt>개인정보 동의</dt><dd>${c.privacy_agreed_at ? kst(c.privacy_agreed_at) : '-'}</dd></dl>
<label class="field">마케팅 정보 수신<select class="select" id="cMk">${opts([[1, '동의'], [0, '미동의 · 철회']], c.marketing_agree ? 1 : 0)}</select><span class="hint">${c.marketing_agreed_at ? '마지막 변경 ' + kst(c.marketing_agreed_at) : '기록 없음'} · 고객이 전화로 수신 거부하면 '철회'로 바꿔 저장하세요.</span></label>
<label class="field">상담 메모 (직원만 보임)<textarea class="textarea" id="cMemo" rows="4">${esc(c.memo)}</textarea></label>
<div style="display:flex;justify-content:flex-end"><button class="btn btn-black btn-sm" id="cSave">저장</button></div></div>
<div class="r box box-pad"><h2 style="font-size:16px;margin-bottom:10px">이력</h2>
<ol style="margin:0;padding:0;list-style:none;border-top:1px solid var(--ink)">${hist.length ? hist.map((h) => `<li style="display:flex;gap:12px;padding:11px 4px;border-bottom:1px solid var(--line-soft);font-size:14px;flex-wrap:wrap"><span class="hint" style="flex:0 0 110px">${kst(h[0])}</span><strong style="flex:0 0 84px">${esc(h[1])}</strong><span style="flex:1 1 220px">${esc(h[2])}</span><span class="hint">${esc(h[3] || '')}</span></li>`).join('') : '<li class="muted" style="padding:16px 0">이력이 없습니다.</li>'}</ol></div></div>`;
    $('#cSave').addEventListener('click', () =>
      run(() => api('/api/admin/customers/' + id, { method: 'PATCH', body: { name: $('#cName').value, kind: $('#cKind').value, company: $('#cCompany').value, biz_no: $('#cBiz').value, email: $('#cEmail').value, erp_ref: $('#cErp').value, memo: $('#cMemo').value, marketing_agree: $('#cMk').value === '1' } }), '저장했습니다.')
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


// ── 이용후기 · 커피 쿠폰 ───────────────────────────
PAGES.reviews = async () => {
  const tab = sessionStorage.getItem('revTab') || 'todo';
  const [{ items, counts }, { settings: s }] = await Promise.all([api('/api/admin/reviews'), api('/api/admin/settings')]);
  const todo = (x) => x.status === 'pending' || (x.status === 'published' && x.coupon === 'none');
  const TABS = [['todo', '처리할 후기'], ['pending', '확인 대기'], ['published', '게시 중'], ['hidden', '숨김'], ['all', '전체']];
  const shown = items.filter((x) => (tab === 'all' ? true : tab === 'todo' ? todo(x) : x.status === tab));
  const n = { todo: items.filter(todo).length, all: items.length, ...counts };
  const COUPON = { none: '<span class="st st-wait">미발송</span>', sent: '<span class="st st-ok">발송 완료</span>', skip: '<span class="st st-off">대상 아님</span>' };
  main.innerHTML = `<div class="a-title"><div><h1>이용후기 · 커피 쿠폰</h1><p class="desc">링크 · 연락처 · 금칙어가 들어간 글은 자동으로 '확인 대기'가 됩니다. 쿠폰을 보낸 뒤 '발송 완료'를 눌러 기록하세요 (같은 번호로 이전에 받은 쿠폰 수가 함께 보입니다).</p></div><a class="btn btn-sm" href="/support.html?tab=review" target="_blank" rel="noopener">홈페이지에서 보기</a></div>
<div class="tabs-line" role="tablist">${TABS.map(([k, v]) => `<button role="tab" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}" data-t="${k}">${v} ${n[k] ? `<span class="hint">${n[k]}</span>` : ''}</button>`).join('')}</div>
<div class="box scroll-x"><table class="a-table" style="min-width:980px"><thead><tr><th>접수</th><th>고객</th><th style="width:40%">후기</th><th>게시</th><th>커피 쿠폰</th><th></th></tr></thead><tbody>
${shown.length ? shown.map((x) => `<tr data-id="${x.id}">
<td><strong>${esc(x.no)}</strong><br><span class="hint">${kst(x.created_at)}</span></td>
<td><strong>${esc(x.name)}</strong><br><a href="tel:${esc(x.phone)}">${esc(x.phone)}</a><br><span class="hint">${x.phone_verified ? '문자 인증 ✓' : '인증 없음'} · 마케팅 ${x.marketing_agree ? '<strong class="red">동의</strong>' : '미동의'}</span>${x.res_n ? `<br><span class="hint">홈페이지 예약 ${x.res_n}건</span>` : ''}</td>
<td><span style="color:var(--red)">${'★'.repeat(x.rating)}<span style="color:#ccc">${'★'.repeat(5 - x.rating)}</span></span> <strong>${esc(x.title)}</strong>${x.flag ? ` <span class="st st-wait">자동 차단: ${esc(x.flag)}</span>` : ''}<br><span class="hint">${[x.car_model, x.use_month].filter(Boolean).map(esc).join(' · ')}</span>
<div style="white-space:pre-line;font-size:13px;line-height:1.7;margin-top:4px;max-height:120px;overflow:auto">${esc(x.body)}</div>
${x.photos.length ? `<div style="display:flex;gap:4px;margin-top:6px">${x.photos.map((p) => `<a href="${esc(p)}" target="_blank" rel="noopener"><img src="${esc(p)}" alt="" style="width:64px;height:48px;object-fit:cover"></a>`).join('')}</div>` : ''}
<input class="input" data-memo value="${esc(x.admin_memo)}" placeholder="직원 메모 (쿠폰 번호 등)" style="height:34px;margin-top:6px;font-size:13px"></td>
<td><select class="select" data-st style="height:36px;min-width:110px">${opts(Object.entries(REV_ST), x.status)}</select></td>
<td>${COUPON[x.coupon] || ''}${x.coupon_at ? `<br><span class="hint">${kst(x.coupon_at)}</span>` : ''}${x.prev_coupons ? `<br><strong class="red small">이 번호 이전 쿠폰 ${x.prev_coupons}회</strong>` : ''}
<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">${x.coupon !== 'sent' ? '<button class="btn btn-xs btn-red" data-cp="sent">발송 완료 처리</button>' : '<button class="btn btn-xs" data-cp="none">발송 취소</button>'}${x.coupon === 'none' ? '<button class="btn btn-xs" data-cp="skip">대상 아님</button>' : ''}</div></td>
<td style="white-space:nowrap"><button class="btn btn-xs" data-save>메모 저장</button><br><button class="btn-link" data-del style="margin-top:6px">삭제</button></td></tr>`).join('') : '<tr><td colspan="6" class="muted" style="padding:40px;text-align:center">해당하는 후기가 없습니다.</td></tr>'}
</tbody></table></div>
<div class="box box-pad" style="display:flex;flex-direction:column;gap:12px;margin-top:16px">
<h2 style="font-size:16px">후기 이벤트 · 차단 설정</h2>
<label class="field">후기 이벤트 안내 문구 (후기 목록 · 쓰기 화면 · 메인에 표시)<textarea class="textarea" id="rvNotice" rows="2">${esc(s.review_notice || '')}</textarea></label>
<label class="field">금칙어 (쉼표로 구분 — 들어간 글은 '확인 대기')<textarea class="textarea" id="rvBan" rows="3">${esc(s.review_banned_words || '')}</textarea></label>
<label class="check"><input type="checkbox" id="rvAll" ${s.review_approve_all === '1' ? 'checked' : ''}>모든 후기를 관리자 확인 후 게시 (평소에는 차단 규칙에 걸린 글만 확인 대기)</label>
<p class="hint" style="margin:0">문자 인증 · 사람 확인(Turnstile) 은 Cloudflare 설정값을 넣으면 자동으로 켜집니다. 지금 상태: 문자 인증 <strong id="smsSt">확인 중</strong> · 사람 확인 <strong id="tsSt">확인 중</strong></p>
<div style="display:flex;justify-content:flex-end"><button class="btn btn-red btn-sm" id="rvSave">설정 저장</button></div></div>`;
  api('/api/community/config').then((c) => { $('#smsSt').textContent = c.sms ? '켜짐' : '꺼짐'; $('#tsSt').textContent = c.turnstileKey ? '켜짐' : '꺼짐'; }).catch(() => {});
  $$('[data-t]').forEach((b) => b.addEventListener('click', () => { sessionStorage.setItem('revTab', b.dataset.t); route(); }));
  const patch = async (tr, body, msg) => { await run(() => api('/api/admin/reviews/' + tr.dataset.id, { method: 'PATCH', body }), msg); route(); refreshCounts(); };
  $$('tr[data-id]').forEach((tr) => {
    $('[data-st]', tr)?.addEventListener('change', (e) => patch(tr, { status: e.target.value }, '게시 상태를 바꿨습니다.'));
    $$('[data-cp]', tr).forEach((b) => b.addEventListener('click', () => patch(tr, { coupon: b.dataset.cp, admin_memo: $('[data-memo]', tr).value }, '쿠폰 상태를 저장했습니다.')));
    $('[data-save]', tr)?.addEventListener('click', () => patch(tr, { admin_memo: $('[data-memo]', tr).value }, '메모를 저장했습니다.'));
    $('[data-del]', tr)?.addEventListener('click', async () => {
      if (!(await confirmBox('이 후기와 사진을 삭제할까요? 되돌릴 수 없습니다. (광고 글이 아니면 \'숨김\'을 권장합니다)', '삭제'))) return;
      await run(() => api('/api/admin/reviews/' + tr.dataset.id, { method: 'DELETE' }), '삭제했습니다.');
      route(); refreshCounts();
    });
  });
  $('#rvSave').addEventListener('click', () =>
    run(() => api('/api/admin/settings', { method: 'PUT', body: { review_notice: $('#rvNotice').value, review_banned_words: $('#rvBan').value, review_approve_all: $('#rvAll').checked ? '1' : '0' } }), '설정을 저장했습니다.')
  );
};

// ── 공지 · 이벤트 · FAQ ─────────────────────────────
PAGES.posts = async () => {
  const { items } = await api('/api/admin/posts');
  const board = sessionStorage.getItem('postBoard') || 'notice';
  const NAME = { notice: '공지사항', event: '이벤트', faq: '자주 묻는 질문' };
  const list = items.filter((p) => p.board === board);
  main.innerHTML = `<div class="a-title"><div><h1>공지 · 이벤트 · FAQ</h1><p class="desc">공지 · FAQ 는 고객센터에, 이벤트는 이벤트 페이지와 메인 화면에 바로 반영됩니다.</p></div><button class="btn btn-black btn-sm" id="newPost">새 글 쓰기</button></div>
<div class="tabs-line" role="tablist">${Object.entries(NAME).map(([k, v]) => `<button role="tab" aria-selected="${k === board}" class="${k === board ? 'on' : ''}" data-b="${k}">${v}</button>`).join('')}</div>
<div class="box"><table class="a-table"><thead><tr><th>${board === 'faq' ? '순서' : '구분'}</th><th>제목</th><th>노출</th><th>등록일</th><th></th></tr></thead>
<tbody>${list.length ? list.map((p) => `<tr><td>${board === 'faq' ? p.sort : p.pinned ? '<strong class="red">고정</strong>' : NAME[p.board]}</td><td>${esc(p.title)}${p.board === 'event' ? `<br><span class="hint">${p.start_date || p.end_date ? `${esc(p.start_date || '')} ~ ${esc(p.end_date || '상시')}` : '상시'}${!p.image_key ? ' · 대표 이미지 없음' : ''}</span>` : ''}</td><td>${p.visible ? '노출' : '<span class="muted">숨김</span>'}</td><td class="hint">${kst(p.created_at).slice(0, 10)}</td><td style="text-align:right"><button class="btn btn-xs" data-edit="${p.id}">수정</button> <button class="btn-link" data-del="${p.id}">삭제</button></td></tr>`).join('') : '<tr><td colspan="5" class="muted" style="padding:30px;text-align:center">글이 없습니다.</td></tr>'}</tbody></table></div>
<div id="editor"></div>`;
  $$('[data-b]').forEach((b) => b.addEventListener('click', () => { sessionStorage.setItem('postBoard', b.dataset.b); route(); }));
  const edit = (p) => {
    p = p || { board, title: '', body: '', pinned: 0, visible: 1, sort: list.length + 1, attachments: '[]', start_date: '', end_date: '', image_key: '', summary: '', cta_label: '', cta_link: '' };
    let mainImg = p.image_key || '';
    let att = JSON.parse(p.attachments || '[]');
    const drawAtt = () => ($('#pAtt').innerHTML = att.map((k, i) => `<figure><div class="photo"><img src="/img/${esc(k)}" alt=""></div><div class="acts"><span></span><button type="button" class="btn-link" data-rm="${i}">삭제</button></div></figure>`).join(''));
    $('#editor').innerHTML = `<div class="box box-pad" style="display:flex;flex-direction:column;gap:12px"><h2 style="font-size:16px">${p.id ? '글 수정' : '새 글 쓰기'}</h2>
<div class="grid2"><label class="field">게시판<select class="select" id="pBoard">${opts(Object.entries(NAME), p.board)}</select></label><label class="field">${board === 'faq' ? '질문' : '제목'}<input class="input" id="pTitle" value="${esc(p.title)}"></label></div>
<div id="evFields" style="display:flex;flex-direction:column;gap:12px" ${p.board === 'event' ? '' : 'hidden'}>
<div class="grid2"><label class="field">시작일<input class="input" id="pStart" type="date" value="${esc(p.start_date || '')}"></label><label class="field">종료일 (비우면 상시)<input class="input" id="pEnd" type="date" value="${esc(p.end_date || '')}"></label></div>
<label class="field">한 줄 소개 (목록 · 메인에 표시)<input class="input" id="pSummary" value="${esc(p.summary || '')}" maxlength="200" placeholder="예: 후기 남기면 스타벅스 아메리카노 쿠폰 증정"></label>
<div class="field">대표 이미지 (목록 · 메인 · 상세 맨 위, 가로 16:9 권장)<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><div id="pMainImg" style="width:200px;aspect-ratio:16/9;background:var(--bg-soft);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;overflow:hidden" class="hint">없음</div><label class="btn btn-sm" style="cursor:pointer">이미지 선택<input type="file" id="pMainFile" accept="image/*" hidden></label><button type="button" class="btn-link" id="pMainDel">삭제</button></div></div>
<div class="grid2"><label class="field">참여 버튼 문구<input class="input" id="pCtaL" value="${esc(p.cta_label || '')}" placeholder="예: 후기 쓰러 가기"></label><label class="field">참여 버튼 링크 (사이트 안 주소)<input class="input" id="pCtaH" value="${esc(p.cta_link || '')}" placeholder="/support.html?tab=review"></label></div>
</div>
<label class="field">${board === 'faq' ? '답변' : '내용'}<textarea class="textarea" id="pBody" rows="8">${esc(p.body)}</textarea></label>
<div class="field">이미지 첨부<label class="drop" style="min-height:80px"><strong>+ 이미지 추가</strong><span class="hint">눌러서 선택</span><input type="file" id="pFile" accept="image/*" multiple></label><div class="photos" id="pAtt"></div></div>
<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center"><label class="check"><input type="checkbox" id="pPin" ${p.pinned ? 'checked' : ''}>목록 맨 위에 고정</label><label class="check"><input type="checkbox" id="pVis" ${p.visible ? 'checked' : ''}>노출</label><label class="field" style="flex-direction:row;align-items:center">순서<input class="input" id="pSort" type="number" value="${p.sort}" style="width:80px;height:38px"></label></div>
<div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-sm" id="pCancel">취소</button><button class="btn btn-red btn-sm" id="pSave">저장</button></div></div>`;
    drawAtt();
    const drawMain = () => ($('#pMainImg').innerHTML = mainImg ? `<img src="/img/${esc(mainImg)}" alt="" style="width:100%;height:100%;object-fit:cover">` : '없음');
    drawMain();
    $('#pBoard').addEventListener('change', (e) => ($('#evFields').hidden = e.target.value !== 'event'));
    $('#pMainDel').addEventListener('click', () => { mainImg = ''; drawMain(); });
    $('#pMainFile').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const fd = new FormData();
      fd.append('folder', 'post');
      fd.append('file', await shrink(f));
      const r = await run(() => api('/api/admin/upload', { method: 'POST', body: fd }));
      mainImg = r.key;
      e.target.value = '';
      drawMain();
    });
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
      const body = { board: $('#pBoard').value, title: $('#pTitle').value, body: $('#pBody').value, pinned: $('#pPin').checked, visible: $('#pVis').checked, sort: +$('#pSort').value, attachments: att,
        start_date: $('#pStart').value, end_date: $('#pEnd').value, summary: $('#pSummary').value, image_key: mainImg, cta_label: $('#pCtaL').value, cta_link: $('#pCtaH').value.trim() };
      if (body.cta_link && !/^\/[^/]/.test(body.cta_link)) return toast('참여 버튼 링크는 / 로 시작하는 사이트 안 주소로 넣어 주세요.', true);
      if (body.start_date && body.end_date && body.end_date < body.start_date) return toast('종료일이 시작일보다 빠릅니다.', true);
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
  main.innerHTML = `<div class="a-title"><div><h1>중장기 차량</h1><p class="desc">'차량 등록'을 누르고 차량번호를 넣으면 차량이 만들어집니다. 사진 · 이용금액 · 옵션을 넣고 '홈페이지 노출'을 켜면 중장기 목록에 나옵니다.</p></div><button class="btn btn-red btn-sm" id="newCar">+ 차량 등록</button></div>
<div class="box scroll-x"><table class="a-table" style="min-width:860px"><thead><tr><th>사진</th><th>차량</th><th>차량번호</th><th class="num">사진</th><th class="num">대표 월 렌트료</th><th>출고여부</th><th>노출</th></tr></thead>
<tbody>${items.length ? items.map((v) => `<tr class="click ${+arg === v.id ? 'sel' : ''}" data-id="${v.id}"><td>${v.photo ? `<img class="thumb" src="${esc(v.photo)}" alt="">` : '<span class="thumb empty">사진 없음</span>'}</td>
<td><strong>${esc(v.name)}</strong><br><span class="hint">${[v.maker, v.model_group, v.year ? v.year + '년식' : '', v.km ? won(v.km) + 'km' : ''].filter(Boolean).map(esc).join(' · ')}</span></td>
<td>${esc(v.plate || '-')}</td><td class="num">${v.photo_n}</td><td class="num">${v.price_mode === 'quote' ? (v.acq_cost ? '견적형' : '<span class="red">견적형 · 취득원가 미입력</span>') : v.main_monthly ? won(v.main_monthly) + '원' : v.plan_n ? '-' : '<span class="red">미입력</span>'}</td>
<td>${esc(LONG_STATUS[v.status] || v.status)}</td><td>${v.visible ? '<span class="st st-ok">노출</span>' : '<span class="st st-off">숨김</span>'}</td></tr>`).join('') : '<tr><td colspan="7" class="muted" style="padding:40px;text-align:center">등록된 차량이 없습니다. \'+ 차량 등록\'을 눌러 시작하세요.</td></tr>'}</tbody></table></div>
<div id="detail"></div>`;
  $('#newCar').addEventListener('click', registerByPlate);
  $$('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => (location.hash = '#long/' + tr.dataset.id)));
  if (arg) carEditor(+arg);
};

// 차량번호로 등록 시작
function registerByPlate() {
  const wrap = document.createElement('div');
  wrap.className = 'modal-back';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="rpT" style="max-width:420px">
<h2 id="rpT" style="font-size:17px">차량 등록</h2>
<label class="field">차량번호<input class="input" id="rpPlate" placeholder="예: 109허7586" autocomplete="off" style="font-size:18px;height:48px"></label>
<p class="hint" style="margin:0">이미 등록된 번호면 그 차량이 열립니다. rentcarerp 연동 중이면 차량 정보를 불러와 채웁니다.</p>
<p class="error-msg" id="rpErr" style="margin:0"></p>
<div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-sm" type="button" id="rpCancel">취소</button><button class="btn btn-red btn-sm" type="button" id="rpGo">등록</button></div></div>`;
  document.body.append(wrap);
  const close = () => wrap.remove();
  $('#rpPlate', wrap).focus();
  $('#rpCancel', wrap).addEventListener('click', close);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  const go = async () => {
    const plate = $('#rpPlate', wrap).value.replace(/\s+/g, '');
    if (!/^\d{2,3}[가-힣]\d{4}$/.test(plate)) return ($('#rpErr', wrap).textContent = '차량번호를 확인해 주세요. (예: 109허7586)');
    try {
      const r = await api('/api/admin/long/by-plate', { method: 'POST', body: { plate } });
      close();
      toast(r.existed ? '이미 등록된 차량입니다. 차량 정보를 엽니다.' : r.fromErp ? 'rentcarerp 정보로 차량을 만들었습니다. 나머지를 채워 주세요.' : '차량을 만들었습니다. 차량 정보를 채워 주세요.');
      const target = '#long/' + r.id;
      if (location.hash === target) route();
      else location.hash = target; // hashchange 가 화면을 다시 그림
    } catch (e) {
      $('#rpErr', wrap).textContent = e.message;
    }
  };
  $('#rpGo', wrap).addEventListener('click', go);
  $('#rpPlate', wrap).addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') close(); });
}

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
  const radio = (n) => ($(`input[name="${n}"]:checked`, box) || {}).value || '';
  const num = (sel) => +($(sel, box).value || '').replace(/\D/g, '') || 0;
  const d = await api('/api/admin/long/' + id);
  const v = d.vehicle, photos = d.photos, t = v.terms || {};
  const opts2 = new Set(v.option_list || []);
  const [ry, rm] = String(v.first_reg || '').split('-');
  const nowY = new Date().getFullYear();
  const radios = (name, map, cur) => Object.entries(map).map(([k, l]) => `<label class="rd"><input type="radio" name="${name}" value="${esc(k)}" ${String(k) === String(cur) ? 'checked' : ''}>${esc(l)}</label>`).join('');
  const inp = (id2, val, ph = '', extra = '') => `<input class="input" id="${id2}" value="${esc(val ?? '')}" placeholder="${esc(ph)}" ${extra}>`;
  const man = (n) => (n ? String(Math.round(n / 10000)) : ''); // 원 → 만원
  const plans = d.plans.length ? d.plans : [12, 24, 36, 48, 60].map((term, i) => ({ term, deposit: 0, monthly: 0, km_year: 30000, buyout: 0, is_main: i === 2 ? 1 : 0 }));
  const planRow = (p = {}, i = 0) => `<tr><td style="text-align:center"><input type="radio" name="pMain" ${p.is_main ? 'checked' : ''} aria-label="메인 가격"></td>
<td><div class="u"><input class="input" data-k="deposit" inputmode="numeric" value="${man(p.deposit)}" placeholder="250"><span>만원</span></div></td>
<td><div class="u"><input class="input" data-k="term" inputmode="numeric" value="${p.term || ''}" placeholder="36"><span>개월</span></div></td>
<td><div class="u"><input class="input" data-k="monthly" inputmode="numeric" value="${p.monthly ? won(p.monthly) : ''}" placeholder="800,000"><span>원</span></div></td>
<td><div class="u"><input class="input" data-k="km_year" inputmode="decimal" value="${p.km_year ? p.km_year / 10000 : ''}" placeholder="3"><span>만km</span></div></td>
<td><div class="u"><input class="input" data-k="buyout" inputmode="numeric" value="${man(p.buyout)}" placeholder="만기 인수가"><span>만원</span></div></td>
<td><button type="button" class="btn-link" data-prm>삭제</button></td></tr>`;
  box.innerHTML = `<div class="box reg" style="margin-top:16px">
<div class="a-title" style="padding:16px 18px;margin:0;border-bottom:2px solid var(--ink)"><h2 style="font-size:17px">${esc(v.plate || '')}${v.name && v.name !== v.plate ? ' · ' + esc(v.name) : ' · 새 차량'}</h2><a class="btn btn-sm" href="/car.html?id=${id}" target="_blank" rel="noopener">홈페이지에서 보기</a></div>

<h3>차량정보</h3>
<table class="regt"><tbody>
<tr><th>분류</th><td><div style="display:flex;gap:6px;flex-wrap:wrap"><select class="select" id="v_maker" style="max-width:160px"><option value="">제조사</option>${opts(MAKERS.map((x) => [x, x]), v.maker)}</select>${inp('v_model_group', v.model_group, '모델 (예: 레이)', 'style="max-width:200px"')}
<select class="select" id="v_class" style="max-width:140px">${opts([['', '차종'], ...['경차', '준중형', '중형', '대형', 'SUV', '승합', '화물'].map((x) => [x, x])], v.class)}</select></div></td>
<th>출고여부</th><td>${radios('v_status', LONG_STATUS, v.status || 'available')}</td></tr>
<tr><th>차량명 / 등급</th><td colspan="3">${inp('v_name', v.name, '예: 더 뉴 기아 레이 프레스티지')}</td></tr>
<tr><th>추가옵션</th><td colspan="3">${inp('v_options', v.options, '예: 드라이브와이즈, 내비게이션')}</td></tr>
</tbody></table>

<h3>주요정보</h3>
<table class="regt"><tbody>
<tr><th>차량연식 / 월</th><td><div style="display:flex;gap:6px"><select class="select" id="v_y" style="max-width:110px">${opts([['', '연식'], ...Array.from({ length: 12 }, (_, i) => [nowY + 1 - i, nowY + 1 - i + '년'])], ry || v.year || '')}</select><select class="select" id="v_m" style="max-width:90px">${opts([['', '월'], ...Array.from({ length: 12 }, (_, i) => [String(i + 1).padStart(2, '0'), i + 1 + '월'])], rm || '')}</select></div></td>
<th>색상</th><td>${inp('v_color', v.color, '예: 흰색')}</td></tr>
<tr><th>주행거리</th><td><div class="u">${inp('v_km', v.km ? won(v.km) : '', '예: 8,000', 'inputmode="numeric"')}<span>km</span></div></td>
<th>차량번호</th><td>${inp('v_plate', v.plate, '109허7586')}</td></tr>
<tr><th>연료</th><td>${radios('v_fuel', { LPG: 'LPG', 휘발유: '휘발유', 경유: '경유', 전기: '전기', 하이브리드: '하이브리드' }, { 가솔린: '휘발유', 디젤: '경유' }[v.fuel] || v.fuel)}</td>
<th>승차 인원</th><td><div class="u">${inp('v_seats', v.seats || '', '5', 'inputmode="numeric"')}<span>인승</span></div></td></tr>
</tbody></table>

<h3>가격 방식</h3>
<div style="padding:0 18px">${radios('v_price_mode', { quote: '견적형 — 취득원가 · 잔가로 고객이 직접 견적 (내 견적 만들기)', table: '고정 가격표 — 이용금액 줄을 직접 입력' }, v.price_mode === 'table' ? 'table' : 'quote')}</div>

<div id="qBlock">
<h3>견적 조건 <span class="hint" style="font-weight:400">고객이 계약기간 · 보증금/선납금(0·10·20·30% 또는 직접입력) · 자차 포함 여부를 골라 월 렌트료를 봅니다. 금리 · 보험료 · 정비료 · 자차 추가금은 '견적 설정' 값을 씁니다.</span></h3>
<table class="regt"><tbody>
<tr><th>취득원가</th><td colspan="3"><div class="u">${inp('v_acq_cost', v.acq_cost ? won(v.acq_cost) : '', '예: 15,000,000', 'inputmode="numeric" style="max-width:200px"')}<span>원</span></div><span class="hint">보증금 · 선납금 % 와 잔가 금액의 기준입니다.</span></td></tr>
<tr><th>기간별 잔가율</th><td colspan="3"><div class="tri">${[12, 24, 36, 48, 60].map((n) => `<label>${n}개월 <span class="u"><input class="input" data-rv="${n}" inputmode="decimal" value="${v.rv_rates && v.rv_rates[n] ? Math.round(v.rv_rates[n] * 1000) / 10 : ''}" placeholder="%" style="max-width:80px"><span>%</span></span></label>`).join('')}</div><span class="hint">비워 둔 기간은 고객 화면에 나오지 않습니다. 잔가 금액 = 취득원가 × 잔가율 (만기 인수가는 부가세 포함으로 표시)</span></td></tr>
</tbody></table>
<div style="padding:8px 18px 0"><button type="button" class="btn btn-sm" id="qPrev">미리 계산</button> <span class="hint">보증금 0 · 선납금 0 기준</span><div id="qPrevOut" style="margin-top:8px"></div></div>
</div>

<div id="pBlock">
<h3>이용금액 <span class="hint" style="font-weight:400">메인 가격으로 고른 줄이 목록에 대표 가격으로 나옵니다. 월 렌트료는 부가세 포함.</span></h3>
<div class="scroll-x" style="padding:0 18px"><table class="a-table plans" style="min-width:860px"><thead><tr><th style="width:60px">메인</th><th>보증금</th><th>계약 기간</th><th>월 렌트료</th><th>연간 주행거리</th><th>만기 인수가 (선택)</th><th></th></tr></thead><tbody id="planBody">${plans.map(planRow).join('')}</tbody></table>
<button type="button" class="btn btn-xs" id="planAdd" style="margin:8px 0 0">+ 줄 추가</button></div>
</div>

<h3>차량옵션</h3>
<table class="regt"><tbody>${OPTION_GROUPS.map(([g, list]) => `<tr><th>${esc(g)}</th><td colspan="3"><div class="optgrid">${list.map((o) => `<label class="ck"><input type="checkbox" data-opt="${esc(o)}" ${opts2.has(o) ? 'checked' : ''}>${esc(o)}</label>`).join('')}</div></td></tr>`).join('')}</tbody></table>

<h3>계약조건</h3>
<table class="regt"><tbody>
<tr><th>최소 운전연령</th><td colspan="3">${radios('t_minAge', AGE_MAP, t.minAge || '26')}</td></tr>
<tr><th>운전경력</th><td><div class="u">${inp('t_career', t.career, '예: 1', 'inputmode="numeric"')}<span>년 이상</span></div><span class="hint">비우면 경력 무관</span></td>
<th>신용등급</th><td><div class="u">${inp('t_credit', t.credit, '예: 6', 'inputmode="numeric"')}<span>등급 이상</span></div><span class="hint">비우면 신용등급 무관</span></td></tr>
<tr><th>위약금</th><td><div class="u">${inp('t_penalty', t.penalty, '예: 30', 'inputmode="numeric"')}<span>%</span></div><span class="hint">비우면 위약금 없음</span></td>
<th>주행거리 초과 위약금</th><td><div class="u"><span>km당</span>${inp('t_overKm', t.overKm, '100', 'inputmode="numeric"')}<span>원</span></div><span class="hint">비우면 km당 100원</span></td></tr>
<tr><th>만기 인수</th><td colspan="3">${radios('t_buyout', { yes: '가능', no: '불가능' }, t.buyout === 'no' ? 'no' : 'yes')}</td></tr>
<tr><th>정비 서비스</th><td colspan="3">${radios('t_maint', MAINT_MAP, t.maint || 'none')}<textarea class="textarea" id="t_maintDesc" rows="2" style="margin-top:6px" placeholder="비우면 기본 문구">${esc(t.maintDesc || '')}</textarea></td></tr>
</tbody></table>

<h3>보험조건</h3>
<table class="regt"><tbody>
<tr><th>책임한도</th><td colspan="3"><div class="tri"><label>대인 ${inp('t_liabPerson', t.liabPerson, '무한')}</label><label>대물 ${inp('t_liabProperty', t.liabProperty, '1억원')}</label><label>자손 ${inp('t_liabSelf', t.liabSelf, '1,500만원')}</label></div></td></tr>
<tr><th>면책금</th><td colspan="3"><div class="tri"><label>자차 ${inp('t_dedCar', t.dedCar, '50만원')}</label><label>대물 ${inp('t_dedProperty', t.dedProperty, '30만원')}</label><label>대인 ${inp('t_dedPerson', t.dedPerson, '30만원')}</label><label>자손 ${inp('t_dedSelf', t.dedSelf, '30만원')}</label></div>
${inp('t_dedNote', t.dedNote, '예: 수입차 및 렌트비 100만원 이상 차량 자차 100만원', 'style="margin-top:6px"')}</td></tr>
</tbody></table>

<h3>추가운전자 범위</h3>
<table class="regt"><tbody>
<tr><th>개인 계약자</th><td colspan="3">${inp('t_driverPerson', t.driverPerson, DRIVER_DEF.person)}<span class="hint">비우면 위 예시 문구로 표시</span></td></tr>
<tr><th>법인 계약자</th><td colspan="3">${inp('t_driverCorp', t.driverCorp, DRIVER_DEF.corp)}<span class="hint">비우면 위 예시 문구로 표시</span></td></tr>
</tbody></table>

<details class="more" style="margin:16px 18px 0"><summary>추가 정보 (선택) — 차량가격 · 사고이력 · 이용이력 · 사양 설명</summary>
<div class="grid2" style="margin-top:12px">
<label class="field">현재 차량가격 (원)<input class="input money" id="v_car_value" inputmode="numeric" value="${v.car_value ? won(v.car_value) : ''}"></label>
<label class="field">신차가격 (원)<input class="input money" id="v_new_price" inputmode="numeric" value="${v.new_price ? won(v.new_price) : ''}"></label>
<label class="field">사고 이력 요약${inp('v_accident', v.accident, '무사고')}</label>
<label class="field">차량 현 위치 · 인수${inp('v_pickup', v.pickup, '본점 · 탁송 가능')}</label>
<label class="field">출고 안내${inp('v_avail_note', v.avail_note, '예: 11월 중순 반납 예정')}</label>
<label class="field">차량번호 고객 공개<select class="select" id="v_show_plate">${opts([[0, '숨김'], [1, '공개']], v.show_plate ? 1 : 0)}</select></label>
</div>
<label class="field" style="margin-top:10px">사양 설명<textarea class="textarea" id="v_spec_text" rows="3">${esc(v.spec_text || '')}</textarea></label>
<div style="margin-top:10px"><strong style="font-size:14px">이용이력</strong><div id="rUsage" style="margin-top:6px"></div></div>
<div style="margin-top:10px"><strong style="font-size:14px">사고수리내역</strong><div id="rRepair" style="margin-top:6px"></div></div>
</details>

<h3>사진 (${photos.length}/20) <span class="hint" style="font-weight:400">첫 번째 사진이 대표 사진입니다. 휴대폰 사진은 자동으로 줄여서 올라갑니다.</span></h3>
<div style="padding:0 18px">
<label class="drop" id="drop"><strong>사진을 끌어다 놓거나 눌러서 올리세요</strong><span class="hint">여러 장 가능 · 휴대폰에서는 바로 촬영 가능</span><input type="file" id="photoIn" accept="image/*" multiple></label>
<div class="photos" style="margin-top:10px">${photos.map((p, i) => `<figure><div class="photo"><img src="${esc(p.url)}" alt="실차 사진 ${i + 1}" loading="lazy">${i === 0 ? '<span class="main-tag">대표</span>' : ''}</div><div class="acts"><span class="order-btns"><button type="button" data-mv="${i}" data-dir="-1" aria-label="앞으로">◀</button> <button type="button" data-mv="${i}" data-dir="1" aria-label="뒤로">▶</button></span>${i ? `<button type="button" class="btn-link" data-main="${i}" style="color:var(--ink)">대표로</button>` : ''}<button type="button" class="btn-link" data-delp="${p.id}">삭제</button></div></figure>`).join('')}</div></div>

<div class="savebar"><label class="check" style="margin:0"><input type="checkbox" id="v_visible" ${v.visible ? 'checked' : ''}>홈페이지 중장기 목록에 노출</label>
<div style="display:flex;gap:8px;align-items:center"><button class="btn-link" id="vDel">차량 삭제</button><button class="btn btn-red" id="vSave" style="min-width:160px">저장하기</button></div></div>
</div>`;

  const getUsage = rowsEditor($('#rUsage'), [{ key: 'kind', label: '구분', ph: '장기렌트' }, { key: 'period', label: '기간', w: 200, ph: '2024-02-21 ~ 2026-07-01' }, { key: 'user', label: '이용자', ph: '법인' }], v.usage_history || []);
  const getRepair = rowsEditor($('#rRepair'), [{ key: 'date', label: '일자', ph: '2025-05-10' }, { key: 'detail', label: '수리 내용', w: 260, ph: '앞범퍼 교환' }, { key: 'cost', label: '수리비 (원)', num: true }], v.repair_history || []);
  const bindPlans = () => {
    $$('[data-prm]', box).forEach((b) => (b.onclick = () => b.closest('tr').remove()));
    $$('#planBody input[data-k="monthly"]', box).forEach((i) => (i.onblur = () => { const n = +i.value.replace(/\D/g, ''); i.value = n ? won(n) : ''; }));
  };
  const modeSync = () => { const q = radio('v_price_mode') !== 'table'; $('#qBlock').hidden = !q; $('#pBlock').hidden = q; };
  $$('input[name="v_price_mode"]', box).forEach((r) => r.addEventListener('change', modeSync));
  const rvRates = () => Object.fromEntries($$('[data-rv]', box).map((i) => [i.dataset.rv, (+i.value.replace(/[^\d.]/g, '') || 0) / 100]).filter(([, r]) => r > 0 && r < 1));
  $('#v_acq_cost').addEventListener('blur', (e) => { const x = +e.target.value.replace(/\D/g, ''); e.target.value = x ? won(x) : ''; });
  $('#qPrev').addEventListener('click', async () => {
    const r = await run(() => api('/api/admin/long/used-preview', { method: 'POST', body: { acq_cost: num('#v_acq_cost'), rv_rates: rvRates(), displacement: v.displacement, fuel: radio('v_fuel'), class: $('#v_class').value } }));
    if (!r.zero.ok) return ($('#qPrevOut').innerHTML = `<p class="red small" style="margin:0">${esc(r.zero.error)}</p>`);
    $('#qPrevOut').innerHTML = `<table class="a-table" style="max-width:640px"><thead><tr><th>기간</th><th class="num">만기 인수가</th><th class="num">월 렌트료 (자차 불포함)</th><th class="num">자차 포함 (+${won(r.selfIns)}원)</th></tr></thead><tbody>${r.zero.rows.map((x, i) => `<tr><td>${x.term}개월</td><td class="num">${won(x.buyout)}</td><td class="num"><strong>${won(x.month)}</strong></td><td class="num">${won(r.self.rows[i].month)}</td></tr>`).join('')}</tbody></table><p class="hint" style="margin:4px 0 0">금리 ${r.rate}% · 견적 설정 기준</p>`;
  });
  $('#planAdd').addEventListener('click', () => { $('#planBody').insertAdjacentHTML('beforeend', planRow({ km_year: 30000 })); bindPlans(); });
  bindPlans();
  modeSync();
  $$('.money', box).forEach((i) => i.addEventListener('blur', () => { const x = +i.value.replace(/\D/g, ''); i.value = x ? won(x) : ''; }));
  $('#v_km').addEventListener('blur', (e) => { const x = +e.target.value.replace(/\D/g, ''); e.target.value = x ? won(x) : ''; });

  $$('input[name="t_maint"]', box).forEach((r) => r.addEventListener('change', () => ($('#t_maintDesc').placeholder = '비우면: ' + MAINT_DEF[r.value])));
  $('#t_maintDesc').placeholder = '비우면: ' + MAINT_DEF[radio('t_maint') || 'none'];

  const collectPlans = () =>
    $$('#planBody tr', box)
      .map((tr) => {
        const g = (k) => ($(`[data-k="${k}"]`, tr).value || '').replace(/,/g, '').trim();
        return { deposit: Math.round(+g('deposit') * 10000) || 0, term: +g('term') || 0, monthly: +g('monthly') || 0, km_year: Math.round(+g('km_year') * 10000) || 0, buyout: Math.round(+g('buyout') * 10000) || 0, is_main: $('input[name="pMain"]', tr).checked };
      })
      .filter((p) => p.term || p.monthly);

  $('#vSave').addEventListener('click', async () => {
    const plansNow = collectPlans();
    const badRow = radio('v_price_mode') === 'table' && plansNow.find((p) => !p.term || !p.monthly);
    if (badRow) return toast('이용금액 줄마다 계약 기간과 월 렌트료를 넣어 주세요. (빈 줄은 삭제)', true);
    const name = $('#v_name').value.trim();
    if (!name) return toast('차량명 / 등급을 입력해 주세요.', true);
    const visible = $('#v_visible').checked;
    const quoteMode = radio('v_price_mode') !== 'table';
    if (visible && quoteMode && (!num('#v_acq_cost') || !Object.keys(rvRates()).length)) return toast('견적형으로 노출하려면 취득원가와 잔가율(한 기간 이상)을 넣어 주세요.', true);
    if (visible && !quoteMode && !plansNow.length) return toast('홈페이지에 노출하려면 이용금액을 한 줄 이상 넣어 주세요.', true);
    const y = $('#v_y').value, m = $('#v_m').value;
    const body = {
      maker: $('#v_maker').value, model_group: $('#v_model_group').value, class: $('#v_class').value, status: radio('v_status') || 'available',
      name, options: $('#v_options').value, year: +y || 0, first_reg: y && m ? `${y}-${m}` : y || '', color: $('#v_color').value, km: num('#v_km'),
      plate: $('#v_plate').value.replace(/\s+/g, ''), fuel: radio('v_fuel'), seats: num('#v_seats'),
      option_list: $$('[data-opt]', box).filter((c) => c.checked).map((c) => c.dataset.opt),
      terms: {
        minAge: radio('t_minAge'), career: $('#t_career').value, credit: $('#t_credit').value, penalty: $('#t_penalty').value, overKm: $('#t_overKm').value,
        buyout: radio('t_buyout'), maint: radio('t_maint'), maintDesc: $('#t_maintDesc').value,
        liabPerson: $('#t_liabPerson').value, liabProperty: $('#t_liabProperty').value, liabSelf: $('#t_liabSelf').value,
        dedCar: $('#t_dedCar').value, dedProperty: $('#t_dedProperty').value, dedPerson: $('#t_dedPerson').value, dedSelf: $('#t_dedSelf').value, dedNote: $('#t_dedNote').value,
        driverPerson: $('#t_driverPerson').value, driverCorp: $('#t_driverCorp').value,
      },
      car_value: num('#v_car_value'), new_price: num('#v_new_price'), accident: $('#v_accident').value, pickup: $('#v_pickup').value, avail_note: $('#v_avail_note').value,
      show_plate: $('#v_show_plate').value === '1', spec_text: $('#v_spec_text').value, usage_history: getUsage(), repair_history: getRepair(),
      visible, badge: v.badge || '즉시출고',
      price_mode: quoteMode ? 'quote' : 'table', acq_cost: num('#v_acq_cost'), rv_rates: rvRates(),
    };
    await run(async () => {
      await api('/api/admin/long/' + id, { method: 'PATCH', body });
      if (!quoteMode) await api(`/api/admin/long/${id}/plans`, { method: 'PUT', body: { plans: plansNow } }); // 견적형은 이용금액 줄을 쓰지 않음
    }, '저장했습니다.');
    route();
  });
  $('#vDel').addEventListener('click', async () => {
    if (!(await confirmBox('이 차량과 사진 · 이용금액을 모두 삭제할까요? 되돌릴 수 없습니다.', '삭제'))) return;
    await run(() => api('/api/admin/long/' + id, { method: 'DELETE' }), '삭제했습니다.');
    location.hash = '#long';
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
    target: '#ins', endpoint: 'insurance', title: '자차 보험 선택지', desc: '보험료 = 1일 요금 × 대여 일수 + 정액(예약 1건당 한 번).',
    columns: [{ key: 'name', label: '보험 이름', w: 240 }, { key: 'per_day', label: '1일 요금', type: 'number', w: 100 }, { key: 'flat_fee', label: '정액 (건당)', type: 'number', w: 100 }, { key: 'active', label: '사용', type: 'check' }],
    blank: { name: '새 보험', per_day: 0, flat_fee: 0, active: 0 },
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
  const ALL = ['단기 예약', '중장기 신청', '법인 견적', '1:1 문의', '이용후기', '견적 회원가입'];
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
  const { users: all } = await api('/api/admin/quote-users');
  const loginUrl = location.origin + '/quote';
  const pending = all.filter((u) => u.status === 'pending');
  const users = all.filter((u) => u.status !== 'pending');
  const on = users.filter((u) => u.active && u.status === 'approved').length;
  const stBadge = (u) => (u.status === 'rejected' ? '<span class="st st-off">가입 거절</span>' : u.active ? '<span class="st st-ok">사용 중</span>' : '<span class="st st-off">사용 중지</span>');
  main.innerHTML = `<div class="a-title"><div><h1>견적 사용자 계정</h1><p class="desc">제휴사 · 영업 담당자에게 발급하는 계정입니다. 이 계정으로는 관리자 화면과 관리자용 견적기에 들어올 수 없습니다.</p></div></div>
<div class="box box-pad" style="display:flex;flex-direction:column;gap:8px"><h2 style="font-size:16px">사용자 로그인 주소</h2>
<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input class="input" id="quLink" value="${esc(loginUrl)}" readonly style="max-width:360px" aria-label="사용자 로그인 주소"><button class="btn btn-sm" id="quCopy">주소 복사</button></div>
<p class="hint" style="margin:0">이 주소에서 사용자가 직접 회원가입을 신청할 수 있습니다. 신청은 아래 '가입 신청'에 쌓이고, 승인해야 로그인할 수 있습니다.</p></div>
<div class="box" style="${pending.length ? 'border-color:var(--red)' : ''}"><div class="box-head"><h2>가입 신청 <span class="hint">승인 대기 ${pending.length}건</span></h2></div>
<div style="overflow-x:auto"><table class="a-table"><thead><tr><th>신청일시</th><th>아이디</th><th>이름 · 소속</th><th>연락처 · 이메일</th><th>남긴 말씀</th><th></th></tr></thead>
<tbody>${pending.length ? pending.map((u) => `<tr><td class="hint">${kst(u.created_at)}</td><td><strong>${esc(u.username)}</strong></td><td>${esc(u.name)}${u.company ? `<br><span class="hint">${esc(u.company)}</span>` : ''}</td><td>${esc(u.phone || '-')}${u.email ? `<br><span class="hint">${esc(u.email)}</span>` : ''}</td><td style="max-width:260px;white-space:pre-line">${esc(u.signup_note || '-')}</td><td style="text-align:right;white-space:nowrap"><button class="btn btn-red btn-xs" data-qok="${u.id}">승인</button> <button class="btn btn-xs" data-qno="${u.id}">거절</button></td></tr>`).join('') : '<tr><td colspan="6" class="muted" style="padding:28px;text-align:center">승인을 기다리는 가입 신청이 없습니다.</td></tr>'}</tbody></table></div></div>
<div class="box"><div class="box-head"><h2>계정 목록 <span class="hint">사용 중 ${on} · 전체 ${users.length}</span></h2></div>
<div style="overflow-x:auto"><table class="a-table"><thead><tr><th>아이디</th><th>이름 · 소속</th><th>연락처</th><th>상태</th><th>최근 접속</th><th>등록일</th><th></th></tr></thead>
<tbody>${users.length ? users.map((u) => `<tr><td><strong>${esc(u.username)}</strong></td><td>${esc(u.name)}${u.company ? `<br><span class="hint">${esc(u.company)}</span>` : ''}${u.memo ? `<br><span class="hint">메모: ${esc(u.memo)}</span>` : ''}</td><td>${esc(u.phone || '-')}${u.email ? `<br><span class="hint">${esc(u.email)}</span>` : ''}</td><td>${stBadge(u)}${u.signup ? `<br><span class="hint">회원가입${u.decided_at ? ' · ' + (u.status === 'rejected' ? '거절 ' : '승인 ') + kst(u.decided_at).slice(0, 10) + (u.decided_by ? ' ' + esc(u.decided_by) : '') : ''}</span>` : ''}${u.reject_reason ? `<br><span class="hint">사유: ${esc(u.reject_reason)}</span>` : ''}</td><td class="hint" style="white-space:nowrap">${u.last_login_at ? kst(u.last_login_at) : '접속 전'}</td><td class="hint" style="white-space:nowrap">${kst(u.created_at).slice(0, 10)}</td><td style="text-align:right;white-space:nowrap">${u.status === 'rejected' ? `<button class="btn btn-red btn-xs" data-qok="${u.id}">승인</button> ` : ''}<a class="btn btn-xs" href="#quotelogs?user=${u.id}">견적 기록</a> <button class="btn btn-xs" data-qedit="${u.id}">수정</button> <button class="btn btn-xs" data-qpw="${u.id}">비밀번호 재설정</button> <button class="btn-link" data-qdel="${u.id}">삭제</button></td></tr>`).join('') : '<tr><td colspan="7" class="muted" style="padding:40px;text-align:center">아직 발급한 계정이 없습니다. 아래에서 첫 계정을 만들어 주세요.</td></tr>'}</tbody></table></div></div>
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

  $$('[data-qok]').forEach((b) => b.addEventListener('click', async () => {
    const u = all.find((x) => x.id === +b.dataset.qok);
    if (!(await confirmBox(`${u.name}${u.company ? ' (' + u.company + ')' : ''} · 아이디 ${u.username}\n가입을 승인할까요? 승인하면 바로 견적 사이트에 로그인할 수 있습니다.`, '승인'))) return;
    await run(() => api(`/api/admin/quote-users/${u.id}/approve`, { method: 'POST' }), `${u.username} 가입을 승인했습니다.`);
    refreshCounts(); route();
  }));
  $$('[data-qno]').forEach((b) => b.addEventListener('click', () => {
    const u = all.find((x) => x.id === +b.dataset.qno);
    const d = $('#dlg');
    $('#dlgBody').innerHTML = `<h2 style="font-size:17px">${esc(u.username)} 가입 거절</h2>
<p class="hint" style="margin:0">${esc(u.name)}${u.company ? ' · ' + esc(u.company) : ''} · ${esc(u.phone)}<br>거절하면 로그인할 수 없고, 계정 목록에 '가입 거절'로 남습니다. 나중에 승인으로 바꿀 수 있습니다.</p>
<label class="field">거절 사유 (관리자만 보임, 선택)<input class="input" id="qrReason"></label>
<div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-sm" value="close" formnovalidate>취소</button><button class="btn btn-red btn-sm" type="button" id="qrSave">거절</button></div>`;
    d.onclose = null;
    d.showModal();
    $('#qrSave').addEventListener('click', async () => {
      try {
        await api(`/api/admin/quote-users/${u.id}/reject`, { method: 'POST', body: { reason: $('#qrReason').value } });
        d.close(); toast(`${u.username} 가입을 거절했습니다.`); refreshCounts(); route();
      } catch (e) { toast(e.message, true); }
    });
  }));

  $$('[data-qedit]').forEach((b) => b.addEventListener('click', () => {
    const u = all.find((x) => x.id === +b.dataset.qedit);
    const d = $('#dlg');
    $('#dlgBody').innerHTML = `<h2 style="font-size:17px">${esc(u.username)} 수정</h2>
<label class="field">이름<input class="input" id="qeName" value="${esc(u.name)}"></label>
<label class="field">소속<input class="input" id="qeCompany" value="${esc(u.company)}"></label>
<label class="field">연락처<input class="input" id="qePhone" value="${esc(u.phone)}"></label>
<label class="field">이메일<input class="input" id="qeEmail" value="${esc(u.email || '')}"></label>
<label class="field">메모 (관리자만 보임)<input class="input" id="qeMemo" value="${esc(u.memo)}"></label>
<label class="check"><input type="checkbox" id="qeActive" ${u.active ? 'checked' : ''}> 사용 중 (해제하면 바로 로그아웃되고 다시 로그인할 수 없습니다)</label>
<p class="error-msg" id="qeErr" role="alert" style="margin:0"></p>
<div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-sm" value="close" formnovalidate>취소</button><button class="btn btn-red btn-sm" type="button" id="qeSave">저장</button></div>`;
    d.onclose = null;
    d.showModal();
    $('#qeSave').addEventListener('click', async () => {
      try {
        await api('/api/admin/quote-users/' + u.id, { method: 'PUT', body: { name: $('#qeName').value, company: $('#qeCompany').value, phone: $('#qePhone').value, email: $('#qeEmail').value, memo: $('#qeMemo').value, active: $('#qeActive').checked } });
        d.close(); toast('저장했습니다.'); route();
      } catch (e) { $('#qeErr').textContent = e.message; }
    });
  }));

  $$('[data-qpw]').forEach((b) => b.addEventListener('click', () => {
    const u = all.find((x) => x.id === +b.dataset.qpw);
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
    const u = all.find((x) => x.id === +b.dataset.qdel);
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
  main.innerHTML = `<div class="a-title"><div><h1>견적 설정</h1><p class="desc">회원 견적 화면(/quote)의 렌트료 계산과 견적서에 쓰입니다. 금리 · 보험료 · 자동차세 · 관리자 AG는 회원에게 보이지 않고, 회원은 결과 금액만 봅니다. 보험 조건(보상 한도 · 면책금)은 고객 견적서에 표시됩니다.</p></div><button class="btn btn-red btn-sm" id="qcSave1">저장</button></div>
<div class="box box-pad" style="display:flex;flex-direction:column;gap:12px"><h2 style="font-size:16px">금리 · 보험료 · AG</h2>
<p class="hint" style="margin:0">렌트료 계산의 AG 수수료는 여기서 정한 관리자 AG에, 사용자가 상품별로 직접 넣는 사용자 AG를 더한 금액입니다.</p>
<div class="grid2">${f('rate', '금리 (연 %)')}${f('insurance', '보험료 (월, 원)')}${f('ag', '관리자 AG 수수료 (% 또는 원, 예: 1%) — 사용자에게 안 보임')}${f('maint', '정비료 (월, 원) — Self 는 0')}</div></div>
<div class="box box-pad" style="display:flex;flex-direction:column;gap:12px"><h2 style="font-size:16px">보험 조건 (차종별 · 고객 견적서에 표시)</h2>
<p class="hint" style="margin:0">보험 등급마다 보상 한도와 면책금을 정하고, 아래 차종 표에서 차종별로 등급을 지정합니다. 견적서에는 선택한 차종의 등급 값이 나갑니다.</p>
<div class="grid2">${f('insAge', '운전가능연령 (전 차종 공통)')}</div>
<div style="overflow-x:auto"><table class="a-table" id="grTbl" style="min-width:1100px"></table></div>
<div><button class="btn btn-sm" type="button" id="grAdd">+ 보험 등급 추가</button></div>
<input class="input" id="imFind" placeholder="차종 찾기 (예: 쏘렌토, 스타리아)" style="max-width:280px" aria-label="차종 찾기">
<div style="overflow-x:auto;max-height:520px;overflow-y:auto;border:1px solid var(--line)"><table class="a-table" id="imTbl" style="min-width:520px"></table></div></div>
<div class="box box-pad" style="display:flex;flex-direction:column;gap:12px"><h2 style="font-size:16px">중장기 견적형 (중고차 내 견적 만들기)</h2><p class="hint" style="margin:0">금리 · 월 보험료 · 정비료는 위 견적 설정 값을 같이 씁니다. 차량별 취득원가 · 잔가율은 '중장기 차량'에서 넣습니다.</p>
${f('usedSelfIns', '자차 포함 시 월 렌트료 추가금 (원, 부가세 포함 최종 금액 기준)')}</div>
<div class="box box-pad" style="display:flex;flex-direction:column;gap:12px"><h2 style="font-size:16px">자차 한도 올리기 (화물차)</h2>
<p class="hint" style="margin:0">견적서에서 자차 한도를 기본(차종 등급 한도) 대신 고를 수 있게 합니다. 고르면 월 보험료(공급가)에 추가금이 더해지고 견적서 '자차 한도' 칸이 바뀝니다. 회원에게는 한도 이름만 보이고 추가 보험료는 보이지 않습니다.</p>
${f('carLimitModels', '변경 가능한 모델 (모델명에 들어간 글자, 쉼표 구분 — 비우면 아무 차종도 변경 불가)')}
<table class="a-table" style="max-width:560px"><thead><tr><th>한도 이름 (견적서 표기)</th><th style="text-align:right">월 보험료 추가 (원)</th><th></th></tr></thead><tbody id="clBody">
${(c.carLimits || []).map((x) => `<tr data-cl="${esc(x.id)}"><td><input class="input" data-cll value="${esc(x.label)}"></td><td><input class="input" style="text-align:right" data-cla value="${won(x.add)}"></td><td><button type="button" class="btn-link" data-clrm>삭제</button></td></tr>`).join('')}
</tbody></table><div><button class="btn btn-sm" type="button" id="clAdd">+ 한도 추가</button></div></div>
<div class="box box-pad" style="display:flex;flex-direction:column;gap:12px"><h2 style="font-size:16px">자동차세</h2>
<label class="field" style="max-width:260px">승용 자동차세 기준<select class="select" data-c="carTax">${opts([['영업용', '영업용'], ['비영업용', '비영업용']], c.carTax)}</select></label>
<div class="split"><div class="l" style="overflow-x:auto"><table class="a-table" id="ccTbl"><thead><tr><th>승용 배기량</th><th style="text-align:right">영업용 (cc당)</th><th style="text-align:right">비영업용 (cc당)</th></tr></thead><tbody>
${c.cc.map((r, i) => `<tr><td>${i < c.cc.length - 1 ? `${won(r[0])} ~ ${won(c.cc[i + 1][0] - 1)}cc` : `${won(r[0])}cc 초과`}</td><td><input class="input" style="text-align:right" data-cc="${i}" data-j="1" value="${r[1]}"></td><td><input class="input" style="text-align:right" data-cc="${i}" data-j="2" value="${r[2]}"></td></tr>`).join('')}</tbody></table></div>
<div class="r" style="overflow-x:auto"><table class="a-table" id="fxTbl"><thead><tr><th>화물 · 승합 · 전기 (연 정액)</th><th style="text-align:right">영업용</th><th style="text-align:right">비영업용</th><th>적용</th></tr></thead><tbody>
${c.fixed.map((r, i) => `<tr><td>${esc(r[0])}</td><td><input class="input" style="text-align:right" data-fx="${i}" data-j="1" value="${r[1]}"></td><td><input class="input" style="text-align:right" data-fx="${i}" data-j="2" value="${r[2]}"></td><td><select class="select" data-fx="${i}" data-j="3">${opts([['영업용', '영업용'], ['비영업용', '비영업용']], r[3])}</select></td></tr>`).join('')}</tbody></table></div></div></div>
<div class="box box-pad" style="display:flex;flex-direction:column;gap:12px"><h2 style="font-size:16px">최대 잔가율 (%)</h2>
<p class="hint" style="margin:0">사용자는 이 값 이하로만 잔가율을 넣을 수 있고, 비워 두면 최대값이 적용됩니다. 약정거리가 기준보다 길면 아래 조정만큼 최대값이 내려갑니다. 칸을 비우면 그 기간은 견적을 낼 수 없습니다.</p>
<div class="grid2">${f('rvKm', '잔가 기준 약정거리 (km/년)')}${f('rvAdj', '5천km당 잔가 조정 (%p)')}</div>
<input class="input" id="rvFind" placeholder="잔가그룹 찾기 (예: 쏘렌토)" style="max-width:280px" aria-label="잔가그룹 찾기">
<div style="overflow-x:auto;max-height:520px;overflow-y:auto;border:1px solid var(--line)"><table class="a-table" id="rvTbl" style="min-width:560px"><thead><tr><th style="position:sticky;top:0">잔가그룹</th>${terms.map((t) => `<th style="position:sticky;top:0;text-align:right">${t}개월</th>`).join('')}</tr></thead>
<tbody>${rvRow('__default', '잔가표에 없는 차종', c.rvDefault)}${groups.map((g) => rvRow(g, g, c.rv[g])).join('')}</tbody></table></div></div>
<div class="box box-pad" style="display:flex;flex-direction:column;gap:12px"><h2 style="font-size:16px">취득 비용 · 시공비</h2>
<div class="grid2">${f('acq', '취득세율 (%)')}${f('plate1', '보조번호판')}${f('plate2', '번호판대')}${f('stamp', '인지대')}${f('reg', '등록대행 수수료')}${f('bond', '공채 할인비용')}${f('tint', '썬팅 시공비 (VAT포함)')}${f('bb', '블랙박스 시공비 (VAT포함)')}${f('del1', '제조사 탁송료 기본값 (사용자가 바꿀 수 있음)')}</div></div>
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
  const bindCl = () => $$('[data-clrm]').forEach((x) => (x.onclick = () => x.closest('tr').remove()));
  bindCl();
  $('#clAdd').addEventListener('click', () => { $('#clBody').insertAdjacentHTML('beforeend', `<tr data-cl=""><td><input class="input" data-cll placeholder="예: 2,000만원"></td><td><input class="input" style="text-align:right" data-cla value="0"></td><td><button type="button" class="btn-link" data-clrm>삭제</button></td></tr>`); bindCl(); });
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
    b.carLimits = $$('#clBody tr').map((tr, i) => ({ id: tr.dataset.cl || 'l' + (i + 1) + Date.now().toString(36).slice(-3), label: $('[data-cll]', tr).value.trim(), add: +$('[data-cla]', tr).value.replace(/\D/g, '') || 0 })).filter((x) => x.label);
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
