// 에이스렌터카 홈페이지 Worker
//  - /api/*  : 고객용·관리자용 API
//  - /img/*  : R2 에 저장된 사진
//  - 그 외   : public 폴더의 화면 (Cloudflare 가 바로 제공)
import { Router } from './lib/router.js';
import { HttpError, json } from './lib/util.js';
import { requireAdmin, currentAdmin } from './lib/auth.js';
import QUOTE_HTML from './pages/quote.html';
import { retryFailed } from './lib/mail.js';
import { registerPublic } from './routes/public.js';
import { registerAdmin } from './routes/admin.js';
import { serveImage } from './routes/upload.js';

const router = new Router();
registerPublic(router);
registerAdmin(router);

const OPEN_ADMIN = new Set(['/api/admin/me', '/api/admin/setup', '/api/admin/login', '/api/admin/logout']);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/img/')) {
        return await serveImage(env, decodeURIComponent(url.pathname.slice(5)));
      }
      // 장기렌트 견적기: 원가·AG수수료·금리가 들어 있어 관리자 로그인한 사람만
      if (url.pathname === '/admin/quote' || url.pathname === '/admin/quote/') {
        const admin = await currentAdmin(request, env.DB);
        if (!admin) return Response.redirect(url.origin + '/admin/?next=quote', 302);
        return new Response(QUOTE_HTML, {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'x-robots-tag': 'noindex, nofollow',
            'x-frame-options': 'DENY',
            'referrer-policy': 'same-origin',
          },
        });
      }
      if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

      const found = router.match(request.method, url.pathname);
      if (!found) throw new HttpError(404, '없는 주소입니다.');

      let admin = null;
      if (url.pathname.startsWith('/api/admin/')) {
        // 다른 사이트에서 관리자 기능을 호출하지 못하도록 출처 확인
        if (request.method !== 'GET') {
          const origin = request.headers.get('origin');
          if (origin && origin !== url.origin) throw new HttpError(403, '허용되지 않은 요청입니다.');
        }
        if (!OPEN_ADMIN.has(url.pathname)) admin = await requireAdmin(request, env.DB);
      }
      return await found.handler({ request, env, ctx, url, params: found.params, admin });
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도하거나 1644-8891로 연락해 주세요.' }, 500);
    }
  },

  // 10분마다 실패한 알림 메일 재발송
  async scheduled(event, env, ctx) {
    ctx.waitUntil(retryFailed(env));
  },
};
