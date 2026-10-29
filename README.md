# 에이스렌터카 홈페이지

Cloudflare 무료 플랜(Workers · D1 · R2 · Email Routing)으로 돌아가는 에이스렌터카 홈페이지입니다.

- **테스트**: onlycartalk.co.kr → **최종**: acerentcar.co.kr
- 고객 화면: 메인, 단기렌트 실시간 예약, 중장기 차량 목록 · 상세 · 신청, 법인 견적, 고객센터(공지 · FAQ · 1:1 문의)
- 관리자(`/admin/`): 단기 예약, 중장기 신청, 고객, 1:1 문의 답변, 게시판, 중장기 차량 · 실차 사진 · 가격표, 단기 차종 · 요금 · 보험, 예약 장소, 메인 배너, 메일 알림 · 발송 기록, 회사 정보 · 관리자 계정
- 예약 · 신청 · 문의가 들어오면 관리자 메일 2곳으로 발송하고 모든 발송을 기록합니다. 실패한 메일은 10분마다 최대 3번 다시 보냅니다.
- 단기 예약 가능 차량은 rentcarerp.com 연동으로 계산합니다(연동 전에는 관리자 '단기 차량(임시 목록)'). 명세: [docs/rentcarerp-api.md](docs/rentcarerp-api.md)

## 폴더 구성

```
public/            화면 (HTML · CSS · JS) — Cloudflare 가 그대로 제공
  admin/           관리자 화면
  assets/          로고, 공항 이미지, 공통 스타일·스크립트
src/               Worker (API)
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
4. **테스트 데이터 넣기 (테스트 도메인만)**: D1 → `acerentcar-db` → 콘솔에 `seed/sample.sql` 내용을 붙여넣고 실행
5. **도메인 연결**: Worker → 설정 → 도메인 및 경로 → 사용자 지정 도메인 → `onlycartalk.co.kr`, `www.onlycartalk.co.kr`
6. **알림 메일 켜기**: 도메인 `onlycartalk.co.kr` → 이메일 → Email Routing 사용 → **대상 주소**에 관리자 메일 2곳 추가 → 각 메일함에서 인증 링크 클릭
7. **관리자 계정 만들기**: `https://onlycartalk.co.kr/admin/` 접속 → 처음 한 번 계정 생성 화면이 나옵니다
8. 관리자 → 메일 알림에서 수신 이메일 2곳 저장 → **테스트 메일 보내기**로 확인

## rentcarerp 연동 켜기

1. rentcarerp 쪽에 [docs/rentcarerp-api.md](docs/rentcarerp-api.md) 의 API 3개 구현
2. `wrangler.jsonc` → `vars.ERP_API_BASE` 에 `https://rentcarerp.com` 입력 후 커밋
3. Worker → 설정 → 변수 및 비밀 → 비밀 `ERP_API_KEY` 추가
4. 관리자 → 단기 차종에서 각 차종의 **ERP 차종코드** 입력

## acerentcar.co.kr 로 최종 전환

같은 Cloudflare 계정에서 도메인만 바꾸면 사진 · 가격표 · 장소 · 게시글이 그대로 이어집니다.

1. 관리자 → 회사 정보 → **테스트 데이터 정리** (예약 · 신청 · 문의 · 고객 · 메일 기록 삭제)
2. Cloudflare 에 `acerentcar.co.kr` 추가 → **카페24 DNS 의 다우오피스 메일 레코드(MX · SPF · DKIM 등)를 빠짐없이 옮긴 뒤** 카페24에서 네임서버 변경
3. 외부 메일로 회사 주소에 보내서 다우오피스 수신 확인
4. 알림 메일은 **하위 도메인**(예: `noti.acerentcar.co.kr`)에만 Email Routing 사용 — 본 도메인 MX 는 건드리지 않음
5. `wrangler.jsonc` 의 `SITE_URL`, `MAIL_FROM` 을 새 도메인으로 바꿔 커밋
6. Worker 사용자 지정 도메인에 `acerentcar.co.kr`, `www.acerentcar.co.kr` 추가 (기존 카페24 홈페이지 레코드는 이때 교체)

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
