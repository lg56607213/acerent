# 에이스렌터카 홈페이지 — 작업 메모

- Cloudflare Workers(정적 화면 + API) · D1(SQLite) · R2(사진) · Email Routing(관리자 알림 메일). 빌드 단계 없음.
- 화면은 `public/` 의 순수 HTML/CSS/JS(ES 모듈). 디자인: 빨강 #C8102E · 검정 · 흰색, 각진 버튼(2px), 표 형식 폼.
- API 는 `src/routes/public.js`(고객), `src/routes/admin.js`(관리자, `/api/admin/*` 는 로그인 필요).
- 금액은 원 단위 정수. 대여 일시는 'YYYY-MM-DDTHH:MM' 한국시간 문자열. DB created_at 은 UTC(datetime('now')).
- 요금 · 가용 대수는 항상 서버에서 다시 계산한다(화면 값 믿지 않음).
- DB 구조 변경은 `migrations/000N_*.sql` 새 파일로 추가(기존 파일 수정 금지).
- 로컬: `npx wrangler d1 migrations apply acerentcar-db --local && npx wrangler dev`
- rentcarerp 연동 명세: docs/rentcarerp-api.md
