import { api, $, $$, esc, initLayout } from './common.js';

initLayout(); // 회사 정보(전화번호 등)는 기다리지 않고 따로 채움 — 본문 데이터를 바로 불러오도록
const root = $('#evRoot');
const ST = { ongoing: '진행 중', upcoming: '진행 예정', ended: '종료' };
const d = (s) => (s ? s.replace(/-/g, '.') : '');
const period = (e) => (e.start_date || e.end_date ? `${d(e.start_date) || ''} ~ ${e.end_date ? d(e.end_date) : '상시'}` : '상시 진행');
let filter = 'ongoing';

async function list() {
  history.replaceState(null, '', '/event.html' + (filter === 'ended' ? '?tab=ended' : ''));
  root.innerHTML = '<p class="loading">불러오는 중…</p>';
  try {
    const { events } = await api('/api/events');
    const shown = events.filter((e) => (filter === 'ended' ? e.state === 'ended' : e.state !== 'ended'));
    root.innerHTML = `<div class="ev-tabs" role="tablist"><button role="tab" data-f="ongoing" class="${filter !== 'ended' ? 'on' : ''}" aria-selected="${filter !== 'ended'}">진행 중인 이벤트</button><button role="tab" data-f="ended" class="${filter === 'ended' ? 'on' : ''}" aria-selected="${filter === 'ended'}">종료된 이벤트</button></div>
<div class="ev-grid">${
      shown.length
        ? shown
            .map(
              (e) => `<a class="ev-card ${e.state}" href="/event.html?id=${e.id}">
<div class="img">${e.image ? `<img src="${esc(e.image)}" alt="" loading="lazy">` : `<span class="ph">${esc(e.title)}</span>`}</div>
<div style="display:flex;gap:8px;align-items:center"><span class="ev-st ${e.state}">${ST[e.state]}</span><span class="small muted">${period(e)}</span></div>
<strong style="font-size:17px;line-height:1.4">${esc(e.title)}</strong>${e.summary ? `<span class="small muted" style="line-height:1.6">${esc(e.summary)}</span>` : ''}</a>`
            )
            .join('')
        : `<p class="empty" style="grid-column:1/-1">${filter === 'ended' ? '종료된 이벤트가 없습니다.' : '지금 진행 중인 이벤트가 없습니다. 곧 새로운 혜택으로 찾아뵙겠습니다.'}</p>`
    }</div>`;
    $$('[data-f]', root).forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f; list(); }));
  } catch (err) {
    root.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
  }
}

async function view(id) {
  try {
    const { event: e } = await api('/api/events/' + encodeURIComponent(id));
    document.title = `${e.title} | 에이스렌터카 이벤트`;
    root.innerHTML = `<div class="ev-view"><div class="h"><div style="display:flex;gap:8px;align-items:center"><span class="ev-st ${e.state}">${ST[e.state]}</span><span class="small muted">기간 ${period(e)}</span></div><h2 style="font-size:22px;line-height:1.4">${esc(e.title)}</h2>${e.summary ? `<p class="muted" style="margin:0">${esc(e.summary)}</p>` : ''}</div>
<div class="b">${e.image ? `<img src="${esc(e.image)}" alt="${esc(e.title)}">` : ''}${e.body ? `<div class="txt">${esc(e.body)}</div>` : ''}${e.attachments.map((a) => `<img src="${esc(a)}" alt="이벤트 안내 이미지" loading="lazy">`).join('')}
${e.cta_link && e.state !== 'ended' ? `<div style="display:flex;justify-content:center;padding-top:8px"><a class="btn btn-red btn-lg" href="${esc(e.cta_link)}" style="padding:0 48px">${esc(e.cta_label || '참여하기')}</a></div>` : ''}</div></div>
<div style="padding-top:16px"><a class="btn" href="/event.html">목록</a></div>`;
  } catch (err) {
    root.innerHTML = `<p class="empty">${esc(err.message)} <a class="red" href="/event.html">이벤트 목록</a></p>`;
  }
}

const qs = new URLSearchParams(location.search);
if (qs.get('tab') === 'ended') filter = 'ended';
if (qs.get('id')) view(qs.get('id'));
else list();
