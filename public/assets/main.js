import { api, $, esc, won, nl, defaultPeriod, initLayout, classImage } from './common.js';
import { quote } from './longcalc.js';

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
  ? locs.filter((l) => l.can_pickup).map((l) => `<option value="${l.id}">${esc(l.name)}${l.fee ? ` (+${won(l.fee)}원)` : ''}</option>`).join('')
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

// 중장기 차량 4대
try {
  const { vehicles } = await api('/api/long');
  const box = $('#mainCars');
  const list = vehicles
    .map((v) => {
      // 가장 긴 계약 기간 · 무보증 · 기본 약정거리 기준 (가장 낮은 월 대여료)
      if (v.mainPlan && v.mainPlan.monthly) return { ...v, min: v.mainPlan.monthly };
      const q = v.bases.length ? quote(v, v.pricing, v.bases, { term: Math.max(...v.bases.map((b) => b.term)) }) : null;
      return { ...v, min: q ? q.monthly : 0 };
    })
    .slice(0, 4);
  box.innerHTML = list.length
    ? list
        .map(
          (v) => `<a class="car-card" href="/car.html?id=${v.id}">
<div class="photo">${v.photo ? `<img src="${esc(v.photo)}" alt="${esc(v.name)} 실차 사진" loading="lazy">` : `<img src="${classImage(v.class)}" alt="" style="object-fit:contain">`}</div>
<div><span class="meta">${esc(v.class)} · ${v.year || ''}년식 · ${won(v.km)}km</span><br><strong class="name">${esc(v.name)}</strong><br>
<span>월 <strong class="price">${v.min ? won(v.min) : '상담'}</strong>${v.min ? '원~' : ''}</span></div></a>`
        )
        .join('')
    : '<p class="empty" style="grid-column:1/-1">지금 즉시 출고 가능한 차량을 준비 중입니다. 1644-8891로 문의해 주세요.</p>';
} catch {
  $('#mainCars').innerHTML = '<p class="empty" style="grid-column:1/-1">차량 정보를 불러오지 못했습니다.</p>';
}

// 공지 3건
try {
  const { posts } = await api('/api/posts?board=notice');
  if (posts.length)
    $('#mainNotice').innerHTML = posts
      .slice(0, 3)
      .map((p) => `<li><a href="/support.html?tab=notice&id=${p.id}">${esc(p.title)}</a><span class="muted">${esc(p.created_at.slice(5, 10))}</span></li>`)
      .join('');
} catch {}

// 진행 중인 이벤트 (최대 3건)
try {
  const { events } = await api('/api/events');
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
  const [r, cfg] = await Promise.all([api('/api/reviews?size=3'), api('/api/community/config').catch(() => ({}))]);
  const star = (n) => `<span class="stars" aria-label="별점 ${n}점">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
  if (cfg.reviewNotice) $('#rvCtaText').textContent = cfg.reviewNotice;
  if (r.total) $('#rvAvg').textContent = `★ ${r.avg.toFixed(1)} · ${r.total}건`;
  $('#mainReviews').innerHTML = r.reviews.length
    ? r.reviews.map((v) => `<article>${star(v.rating)}<strong>${esc(v.title)}</strong><p>${esc(v.body)}</p><span class="small muted">${esc(v.name)}${v.car_model ? ' · ' + esc(v.car_model) : ''}</span></article>`).join('')
    : '<p class="muted small" style="grid-column:1/-1">아직 등록된 후기가 없습니다. 첫 후기를 남겨 주세요.</p>';
} catch {
  $('#mainReviews').innerHTML = '';
}
