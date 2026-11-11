# 에이스렌터카 홈페이지 — 작업 메모

- Cloudflare Workers(정적 화면 + API) · D1(SQLite) · R2(사진) · Email Routing(관리자 알림 메일). 빌드 단계 없음.
- 화면은 `public/` 의 순수 HTML/CSS/JS(ES 모듈). 디자인: 빨강 #C8102E · 검정 · 흰색, 각진 버튼(2px), 표 형식 폼.
- API 는 `src/routes/public.js`(고객), `src/routes/admin.js`(관리자, `/api/admin/*` 는 로그인 필요).
- 금액은 원 단위 정수. 대여 일시는 'YYYY-MM-DDTHH:MM' 한국시간 문자열. DB created_at 은 UTC(datetime('now')).
- 요금 · 가용 대수는 항상 서버에서 다시 계산한다(화면 값 믿지 않음).
- DB 구조 변경은 `migrations/000N_*.sql` 새 파일로 추가(기존 파일 수정 금지).
- 로컬: `npx wrangler d1 migrations apply acerentcar-db --local && npx wrangler dev`
- rentcarerp 연동 명세: docs/rentcarerp-api.md
- 중장기 월 대여료 계산식은 public/assets/longcalc.js 하나(화면 · 서버 공용). 기간별 기준 월 대여료는 long_prices 의 dep_pct = 0 행.
- 계정 2종류: 관리자(admin_users · 쿠키 ace_admin · /admin) / 견적 사용자(quote_users · 쿠키 ace_quote · /quote, src/lib/quoteAuth.js · src/routes/quote.js). 견적 사용자에게 원가 · AG수수료 · 금리가 보이면 안 됨 — 관리자용 견적기(src/pages/quote.html)는 /admin/quote 에서 관리자에게만 제공.
- 견적 사용자 렌트료 계산은 src/lib/rentcalc.js (서버 전용, 엑셀 견적기와 같은 식). 설정은 settings.quote_config(JSON). 사용자 응답은 toPublic() 으로 결과 금액만 — 금리 · 보험료 · 원가 · 금융분 · IRR 을 응답에 넣지 말 것. 차량 가격표 데이터는 src/data/quote-data.json.
- 이벤트 · 이용후기: src/routes/community.js, 광고 차단(Turnstile · 문자 인증 · 차단 규칙)은 src/lib/guard.js — 설정값이 비어 있으면 꺼진 채로 동작. 마케팅 수신 동의는 선택(필수로 묶지 말 것), customers.marketing_agree/marketing_agreed_at, 기록은 util.recordConsent().
- 중장기 차량: 관리자 '+ 차량 등록'(차량번호) → 이용금액 줄(long_plans: 보증금 · 개월 · 월렌트료 · 연간km · 만기인수가, is_main 대표) · 옵션(option_list, public/assets/longopts.js) · 계약/보험 조건(terms). 이용금액 줄이 있으면 고객 화면은 줄 선택 방식, 없으면 예전 자동계산(longcalc.js).
- 중장기 견적형(price_mode=quote): 취득원가(acq_cost, 비공개) · 신차가격(new_price, 고객 표시 · 보증금/선납금 % 기준) · 기간별 잔가율(rv_rates, quote_config.usedRvKm 기준) → rentcalc.computeUsed() 서버 계산. 고객은 기간 · 약정거리(연 1/2/3만km, 5천km당 usedRvAdj %p 잔가 조정) · 보증금 · 선납금 · 자차(usedSelfIns 추가)만 고름. 고객에게 취득원가 · 잔가율 · 금리를 내려주지 않음 (used.base = 신차가격).
