// 옛 홈페이지(그누보드) 주소 → 새 페이지로 영구 이동(301), robots.txt · sitemap.xml
// 네이버 · 구글 검색 결과와 블로그에 걸린 옛 링크가 404 가 되지 않도록

const BOARD = {
  ga001: '/short', ga003: '/short', price001: '/short', res001: '/short', // 보유차량 · 차량안내 · 대여요금 · 온라인 예약
  ga002: '/long', res002: '/long', res003: '/long#corp', // 월간 · 장기 차량과 요금, 월간렌트 신청, 장기렌트 견적
  comm001: '/event', comm002: '/event', // 진행 중 이벤트 · 할인차량 이벤트
  comm003: '/support?tab=review', comm005: '/support?tab=notice', comm006: '/support?tab=faq',
};
const PAGE = {
  '/html/sub01_03.html': '/short', '/html/sub01_04.html': '/short', // 부가서비스 · 대여가이드
  '/html/sub02_01.html': '/long', '/html/sub03_01.html': '/long', // 월간 · 장기렌터카 안내
  '/search_res001.php': '/short', '/search_res002.php': '/long', '/search_res003.php': '/long#corp', '/search.php': '/support?tab=qna',
};

export function legacyRedirect(url) {
  const p = url.pathname;
  let to = PAGE[p];
  if (!to && p.startsWith('/bbs/')) to = BOARD[url.searchParams.get('bo_table')] || '/support';
  if (!to && (p.startsWith('/html/') || p.startsWith('/adm/') || p.startsWith('/theme/') || /\.php$/.test(p))) to = '/';
  return to ? Response.redirect(url.origin + to, 301) : null;
}

export function robotsTxt(url) {
  return new Response(`User-agent: *\nDisallow: /admin/\nDisallow: /api/\nDisallow: /quote\n\nSitemap: ${url.origin}/sitemap.xml\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}

export async function sitemapXml(env, url) {
  const o = url.origin;
  const [cars, events] = await Promise.all([
    env.DB.prepare(`SELECT id, updated_at FROM long_vehicles WHERE visible = 1 AND status <> 'contracted'`).all(),
    env.DB.prepare(`SELECT id, created_at FROM posts WHERE board = 'event' AND visible = 1`).all(),
  ]);
  const day = (s) => (s ? String(s).slice(0, 10) : '');
  const rows = [
    [o + '/', 'daily'], [o + '/short', 'daily'], [o + '/long', 'daily'], [o + '/event', 'weekly'], [o + '/support', 'weekly'],
    ...cars.results.map((c) => [`${o}/car?id=${c.id}`, 'weekly', day(c.updated_at)]),
    ...events.results.map((e) => [`${o}/event?id=${e.id}`, 'monthly', day(e.created_at)]),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows
    .map(([loc, f, lm]) => `<url><loc>${loc.replace(/&/g, '&amp;')}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}<changefreq>${f}</changefreq></url>`)
    .join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
