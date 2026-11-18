import { api, $, $$, initLayout, setBusy } from './common.js';

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
