// 글쓰기 보호: 휴대폰 문자 인증 + 사람 확인(Turnstile). 서버 설정이 없으면 해당 칸은 나오지 않음
import { api, $, esc } from './common.js';

let cfgPromise;
export const communityConfig = () => (cfgPromise ||= api('/api/community/config').catch(() => ({ sms: false, turnstileKey: '', reviewNotice: '' })));

let tsLoad;
function loadTurnstile() {
  return (tsLoad ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => res(window.turnstile);
    s.onerror = rej;
    document.head.append(s);
  }));
}

// phoneInput: 휴대폰 입력칸, slot: 인증 칸을 넣을 자리 (form-row 의 td 안)
export async function setupGuard({ phoneInput, slot, tsSlot }) {
  const cfg = await communityConfig();
  const st = { token: '', verifiedPhone: '', ts: '', widget: null };
  const digits = () => phoneInput.value.replace(/\D/g, '');

  if (cfg.turnstileKey && tsSlot) {
    try {
      const ts = await loadTurnstile();
      st.widget = ts.render(tsSlot, { sitekey: cfg.turnstileKey, language: 'ko', callback: (t) => (st.ts = t), 'expired-callback': () => (st.ts = ''), 'error-callback': () => (st.ts = '') });
    } catch {
      tsSlot.innerHTML = '<span class="small error-msg">사람 확인을 불러오지 못했습니다. 새로고침해 주세요.</span>';
    }
  }
  const resetTs = () => { st.ts = ''; if (st.widget !== null && window.turnstile) window.turnstile.reset(st.widget); };

  if (cfg.sms && slot) {
    slot.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;width:100%">
<button type="button" class="btn" id="gSend" style="height:44px;padding:0 14px">인증번호 받기</button>
<input class="input" id="gCode" inputmode="numeric" maxlength="6" placeholder="인증번호 6자리" style="max-width:150px" hidden>
<button type="button" class="btn btn-black" id="gCheck" style="height:44px;padding:0 14px" hidden>확인</button>
<span class="small" id="gMsg" role="status"></span></div>`;
    const msg = (t, ok) => { $('#gMsg', slot).textContent = t; $('#gMsg', slot).className = 'small ' + (ok ? 'red' : 'muted'); };
    $('#gSend', slot).addEventListener('click', async () => {
      if (!/^010\d{7,8}$/.test(digits())) return msg('휴대폰 번호(010)를 먼저 입력해 주세요.');
      if (cfg.turnstileKey && !st.ts) return msg('아래 사람 확인을 먼저 완료해 주세요.');
      const b = $('#gSend', slot);
      b.disabled = true;
      try {
        await api('/api/phone/send', { method: 'POST', body: { phone: phoneInput.value, turnstile: st.ts } });
        msg('인증번호를 보냈습니다. 5분 안에 입력해 주세요.');
        $('#gCode', slot).hidden = false; $('#gCheck', slot).hidden = false; $('#gCode', slot).focus();
        b.textContent = '다시 받기';
      } catch (e) {
        msg(e.message);
      } finally {
        b.disabled = false;
        resetTs();
      }
    });
    $('#gCheck', slot).addEventListener('click', async () => {
      try {
        const r = await api('/api/phone/verify', { method: 'POST', body: { phone: phoneInput.value, code: $('#gCode', slot).value } });
        st.token = r.token; st.verifiedPhone = digits();
        phoneInput.readOnly = true;
        slot.innerHTML = '<strong class="small red">✓ 휴대폰 인증 완료</strong>';
      } catch (e) {
        msg(e.message);
      }
    });
  }

  return {
    cfg,
    // 등록 전에 확인: 문제가 있으면 안내 문구, 없으면 ''
    check() {
      if (cfg.sms) return st.token && st.verifiedPhone === digits() ? '' : '휴대폰 문자 인증을 완료해 주세요.';
      if (cfg.turnstileKey && !st.ts) return '사람 확인을 완료해 주세요.';
      return '';
    },
    fields: () => ({ verifyToken: st.token, turnstile: st.ts }),
    afterFail: () => { if (!cfg.sms) resetTs(); },
  };
}

export const stars = (n) => `<span class="stars" aria-label="별점 ${n}점">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
export const escHtml = esc;
