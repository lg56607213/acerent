# 에이스렌터카 홈페이지

Cloudflare 무료 플랜(Workers · D1 · R2 · Email Routing)으로 돌아가는 에이스렌터카 홈페이지입니다.

- **운영 주소**: acerentcar.co.kr (www 포함) · 예전 테스트 주소 onlycartalk.com 은 같은 경로의 새 주소로 넘어감
- 고객 화면: 메인, 단기렌트 실시간 예약, 중장기 차량 목록 · 상세 · 신청, 법인 견적, 고객센터(공지 · FAQ · 1:1 문의)
- 관리자(`/admin/`): 단기 예약, 중장기 신청, 고객, 1:1 문의 답변, 게시판, 중장기 차량 · 실차 사진 · 가격표, 단기 차종 · 요금 · 보험, 예약 장소, 메인 배너, 메일 알림 · 발송 기록, 회사 정보 · 관리자 계정
- 견적 사용자(`/quote`): 관리자가 '견적 사용자 계정' 메뉴에서 발급하거나, 사용자가 `/quote` 에서 회원가입 신청 → 관리자가 승인하면 로그인. 관리자 계정과 테이블 · 쿠키가 따로라 관리자 화면 · `/admin/quote` 에는 들어갈 수 없음
  - 사용자는 차량 · 색상 · 탁송 · 장착 · 고객 정보와 기간 · 약정거리 · 선납금 · 보증금 · 잔가율만 넣고, 렌트료는 서버가 계산해 결과 금액만 돌려줌
  - 금리 · 보험료 · 관리자 AG수수료 · 자동차세 · 최대 잔가율은 관리자 '견적 설정'에서 정함 (사용자에게 보이지 않음)
  - AG수수료 = 관리자 AG(고정, 예: 1%) + 사용자 AG(사용자가 상품별로 % 또는 원으로 넣어 렌트료를 맞춤)
  - 보험 조건(대인 · 대물 · 자손 보상 한도, 자차 한도, 각 면책금)은 '견적 설정'의 보험 등급(예: 소·중형 / 대형)을 차종마다 지정해 견적서에 표시 — 관리자용 견적기도 같은 설정을 씀
  - '견적서 발행'을 누르면 견적번호(Q-YYYYMMDD-0001)가 붙고 관리자 '견적 발행 기록'에 남음
- 예약 · 신청 · 문의가 들어오면 관리자 메일 2곳으로 발송하고 모든 발송을 기록합니다. 실패한 메일은 10분마다 최대 3번 다시 보냅니다.
- 단기 예약 가능 차량은 rentcarerp.com 연동으로 계산합니다(연동 전에는 관리자 '단기 차량(임시 목록)'). 명세: [docs/rentcarerp-api.md](docs/rentcarerp-api.md)

## 폴더 구성

```
public/            화면 (HTML · CSS · JS) — Cloudflare 가 그대로 제공
  admin/           관리자 화면
  assets/          로고, 공항 이미지, 공통 스타일·스크립트
src/               Worker (API)
  pages/quote.html 장기렌트 견적기 — /admin/quote, 관리자 로그인한 사람에게만 Worker 가 내려줌
  routes/public.js 고객용 API
  routes/admin.js  관리자 API
  lib/             메일, rentcarerp 연동, 로그인, 공통 도우미
migrations/        DB 구조
seed/sample.sql    테스트용 기본 데이터 (금액은 예시)
docs/              rentcarerp 연동 명세
```

## 처음 배포하기 (Cloudflare 대시보드)

1. **DB 만들기**: 저장소 및 데이터베이스 → D1 → 데이터베이스 만들기 → 이름 `acerentcar-db`
   → 만들어진 **데이터베이스 ID** 를 `wrangler.jsonc` 의 `database_id` 에 넣고 커밋
2. **사진 저장소 만들기**: R2 → 버킷 만들기 → 이름 `acerentcar-images`
   (R2 를 처음 켤 때 결제 수단 등록을 요구할 수 있습니다. 무료 한도 안에서는 요금이 나오지 않습니다.)
3. **Worker 연결**: 컴퓨트(Workers) → 만들기 → Git 리포지토리 가져오기 → `lg56607213/acerent`
   - 빌드 명령: 비워둠
   - 배포 명령: `npx wrangler d1 migrations apply acerentcar-db --remote && npx wrangler deploy`
   → 이후 GitHub `main` 에 올릴 때마다 자동 배포됩니다.
4. **테스트 데이터 넣기 (처음 테스트할 때만)**: D1 → `acerentcar-db` → 콘솔에 `seed/sample.sql` 내용을 붙여넣고 실행 (단기 차종 14종 · 요금과 예약 장소는 배포 때 자동으로 들어가고, 이 파일은 보험 · 임시 차량 · 중장기 예시 · FAQ 용)
5. **도메인 연결**: Worker → 설정 → 도메인 및 경로 → 사용자 지정 도메인 → `onlycartalk.com`, `www.onlycartalk.com`
6. **알림 메일 켜기**: 도메인 `onlycartalk.com` → 이메일 → Email Routing 사용 → **대상 주소**에 관리자 메일 2곳 추가 → 각 메일함에서 인증 링크 클릭
7. **관리자 계정 만들기**: `https://onlycartalk.com/admin/` 접속 → 처음 한 번 계정 생성 화면이 나옵니다
8. 관리자 → 메일 알림에서 수신 이메일 2곳 저장 → **테스트 메일 보내기**로 확인

## rentcarerp 연동 켜기

1. rentcarerp 쪽에 [docs/rentcarerp-api.md](docs/rentcarerp-api.md) 의 API 3개 구현
2. `wrangler.jsonc` → `vars.ERP_API_BASE` 에 `https://rentcarerp.com` 입력 후 커밋
3. Worker → 설정 → 변수 및 비밀 → 비밀 `ERP_API_KEY` 추가
4. 관리자 → 단기 차종에서 각 차종의 **ERP 차종코드** 입력

## acerentcar.co.kr 로 최종 전환

같은 Worker · DB · 사진 저장소를 그대로 쓰므로 예약 · 가격표 · 견적 설정 · 견적 회원 · 견적 기록이 모두 이어집니다.
**주의: acerentcar.co.kr 은 다우오피스 회사 메일이 쓰는 도메인입니다. 메일 레코드(MX · TXT)를 빠뜨리면 메일이 끊깁니다.**

1. **현재 레코드 기록**: 카페24 → 도메인 관리 → acerentcar.co.kr → DNS 관리에서 모든 레코드(A · CNAME · MX · TXT)를 캡처
2. **Cloudflare 에 도메인 추가**: Cloudflare → 도메인 추가 → `acerentcar.co.kr` → Free 플랜
   - 자동으로 가져온 레코드를 1의 캡처와 한 줄씩 비교하고, 빠진 MX · TXT(SPF · DKIM · DMARC) · CNAME 을 추가
   - 메일 관련 레코드는 반드시 **DNS 전용(회색 구름)**
   - 루트(@)와 www 에 예전 홈페이지(카페24 호스팅)를 가리키는 A · CNAME 이 있으면 지움 (4에서 Worker 가 대신 붙음)
3. **네임서버 변경**: 카페24 → 도메인 관리 → 네임서버 변경 → Cloudflare 가 알려준 네임서버 2개 입력. 활성화까지 몇 시간 ~ 최대 48시간
4. **Worker 에 도메인 붙이기**: Worker `acerentcar` → 설정 → 도메인 및 경로 → 사용자 지정 도메인 → `acerentcar.co.kr`, `www.acerentcar.co.kr` 추가 (`onlycartalk.com` 은 지우지 말고 둠 — 예전 링크를 새 주소로 넘겨줌)
5. **코드 반영**: `domain-acerentcar` 브랜치를 `main` 에 합치면 자동 배포 (`SITE_URL` 변경, 예전 주소 → 새 주소 넘기기)
6. **Email Routing 은 acerentcar.co.kr 에 켜지 않음** — 켜면 MX 가 Cloudflare 로 바뀌어 다우오피스 메일이 끊김. 관리자 알림 메일은 지금처럼 `noti@onlycartalk.com` 으로 발송
7. **확인**: 회사 메일 받기 · 보내기, `https://acerentcar.co.kr/admin/` 로그인(주소가 바뀌어 한 번 다시 로그인), `/quote` 회원 로그인, 예전 주소 `onlycartalk.com/quote` 가 새 주소로 넘어가는지
8. 관리자 → 회사 정보 → **테스트 데이터 정리** (필요할 때만 — 예약 · 신청 · 문의 · 고객 · 메일 기록 삭제)

## 데이터 백업 · 다른 계정으로 옮기기

```bash
npx wrangler d1 export acerentcar-db --remote --output=backup/acerentcar-db.sql   # DB 내보내기
npx wrangler d1 execute acerentcar-db --remote --file=backup/acerentcar-db.sql    # 새 계정에서 가져오기
```

사진(R2)은 Cloudflare 대시보드의 R2 버킷에서 내려받거나 `rclone` 으로 복사합니다.

## PC 에서 실행해 보기

```bash
npm install
npx wrangler d1 migrations apply acerentcar-db --local
npx wrangler d1 execute acerentcar-db --local --file=seed/sample.sql
npx wrangler dev          # http://localhost:8787 , 관리자 http://localhost:8787/admin/
```
