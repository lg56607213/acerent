import { api, $, esc, won, nl, defaultPeriod, initLayout, classImage } from './common.js';

// 필요한 데이터를 한꺼번에 요청 (하나씩 기다리면 화면이 늦게 채워짐)
const pre = (u) => { const p = api(u); p.catch(() => {}); return p; };
const P_NOTICE = pre('/api/posts?board=notice'), P_EVENTS = pre('/api/events'), P_REVIEWS = pre('/api/reviews?size=3'), P_CFG = pre('/api/community/config');
const site = await initLayout();

// 배너
if (site && site.banners && site.banners.length) {
  const b = site.banners[0];
  if (b.image) $('#heroImg').src = b.image;
  if (b.text) $('#heroText').textContent = nl(b.text);
  if (b.sub_text) $('#heroSub').textContent = b.sub_text;
}

// 예약 장소
const sel = $('#mLoc');
const locs = (site && site.locations) || [];
sel.innerHTML = locs.length
  ? locs.filter((l) => l.can_pickup).map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('')
  : '<option value="">예약 장소 준비 중</option>';

const [f, t] = defaultPeriod();
$('#mFrom').value = f;
$('#mTo').value = t;
$('#mFrom').min = f.slice(0, 10) + 'T00:00';

// 탭
const tabs = [$('#tabShort'), $('#tabLong')];
const panels = [$('#formShort'), $('#formLong')];
tabs.forEach((tab, i) =>
  tab.addEventListener('click', () => {
    tabs.forEach((x, j) => x.setAttribute('aria-selected', String(i === j)));
    panels.forEach((p, j) => (p.hidden = i !== j));
  })
);

// 공지 3건
try {
  const { posts } = await P_NOTICE;
  if (posts.length)
    $('#mainNotice').innerHTML = posts
      .slice(0, 3)
      .map((p) => `<li><a href="/support.html?tab=notice&id=${p.id}">${esc(p.title)}</a><span class="muted">${esc(p.created_at.slice(5, 10))}</span></li>`)
      .join('');
} catch {}

// 진행 중인 이벤트 (최대 3건)
try {
  const { events } = await P_EVENTS;
  const on = events.filter((e) => e.state === 'ongoing').slice(0, 3);
  if (on.length) {
    $('#mainEvSec').hidden = false;
    $('#mainEvents').innerHTML = on
      .map((e) => `<a href="/event.html?id=${e.id}"><div class="img">${e.image ? `<img src="${esc(e.image)}" alt="" loading="lazy">` : `<span>${esc(e.title)}</span>`}</div><strong style="font-size:16px">${esc(e.title)}</strong>${e.summary ? `<span class="small muted">${esc(e.summary)}</span>` : ''}</a>`)
      .join('');
  }
} catch {}

// 최근 이용후기 3건
try {
  const [r, cfg] = await Promise.all([P_REVIEWS, P_CFG.catch(() => ({}))]);
  const star = (n) => `<span class="stars" aria-label="별점 ${n}점">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
  if (cfg.reviewNotice) $('#rvCtaText').textContent = cfg.reviewNotice;
  if (r.total) $('#rvAvg').textContent = `★ ${r.avg.toFixed(1)} · ${r.total}건`;
  $('#mainReviews').innerHTML = r.reviews.length
    ? r.reviews.map((v) => `<article>${star(v.rating)}<strong>${esc(v.title)}</strong><p>${esc(v.body)}</p><span class="small muted">${esc(v.name)}${v.car_model ? ' · ' + esc(v.car_model) : ''}</span></article>`).join('')
    : '<p class="muted small" style="grid-column:1/-1">아직 등록된 후기가 없습니다. 첫 후기를 남겨 주세요.</p>';
} catch {
  $('#mainReviews').innerHTML = '';
}
