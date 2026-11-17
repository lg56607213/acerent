import { api, $, initLayout, setBusy } from './common.js';

initLayout();

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
