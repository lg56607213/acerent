# rentcarerp.com 연동 API 명세

홈페이지 Worker 가 rentcarerp.com 에 요청하는 API 입니다. rentcarerp 쪽에 아래 3개를 만들면 연동됩니다.
연동 전에는 홈페이지 관리자 화면의 **단기 차량(임시 목록)** 으로 동작합니다.

## 공통

- 주소: `ERP_API_BASE` (예: `https://rentcarerp.com`) — `wrangler.jsonc` 의 `vars`
- 인증: 요청 헤더 `Authorization: Bearer {ERP_API_KEY}` — Cloudflare 비밀값(Secret)으로 등록
- 일시 형식: `YYYY-MM-DDTHH:MM` (한국시간)
- 응답: JSON, 오류 시 HTTP 4xx/5xx

## 1. 단기 예약 가능 차량 조회

`GET /api/public/short/availability?from=2026-11-14T10:00&to=2026-11-17T10:00&location=1`

해당 기간에 **배차·정비·예약이 겹치지 않는 단기용 차량**만 돌려줍니다.
(지금 대기 중인 차가 아니라, 고객이 고른 기간 전체가 비어 있는 차)

```json
{
  "vehicles": [
    { "id": "V1023", "plate": "12가3456", "model_code": "AVANTE_CN7", "model_name": "아반떼 CN7", "year": 2024 }
  ]
}
```

- `model_code` 는 홈페이지 관리자 **단기 차종 → ERP 차종코드** 칸과 같은 값이어야 묶입니다.
- 홈페이지는 차종별 대수를 세어 "잔여 N대"로 보여주고, 아직 ERP 에 반영 안 된 홈페이지 예약만큼 빼서 계산합니다.

## 2. 홈페이지 예약 → ERP 가예약 등록

`POST /api/public/short/holds`

```json
{
  "no": "S-20261114-0001",
  "model_code": "AVANTE_CN7",
  "pickup_at": "2026-11-14T10:00",
  "return_at": "2026-11-17T10:00",
  "location": "인천공항 제1터미널",
  "name": "홍길동",
  "phone": "010-1234-5678"
}
```

- 성공(2xx)하면 홈페이지 예약에 'ERP 반영'이 표시되고, 이후 가용 계산은 ERP 기준으로만 합니다.
- ERP 는 이 기간에 그 차종 1대를 '가예약'으로 잡아, 다른 경로로 중복 배차되지 않게 해 주세요.
- 실패해도 홈페이지 예약은 접수됩니다(관리자가 수동 배차).

## 3. 중장기 차량 정보 불러오기 (관리자 등록 화면)

`GET /api/public/vehicles?q=12가`

```json
{
  "vehicles": [
    { "id": "V2001", "plate": "12가3456", "name": "쏘렌토 MQ4 하이브리드 1.6 시그니처", "class": "SUV",
      "year": 2024, "first_reg": "2024년 3월", "km": 15800, "fuel": "하이브리드", "color": "스노우 화이트 펄", "seats": 5,
      "options": "파노라마 선루프, 통풍시트" }
  ]
}
```

관리자가 중장기 차량을 등록할 때 이 값으로 칸을 자동으로 채웁니다. 사진과 가격표는 관리자가 직접 넣습니다.
