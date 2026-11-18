-- 단기 요금을 예스렌터카 예약 화면과 같은 방식으로 (2026-11-16)
--   기간: 날짜 차이 = 일수, 반납 시각이 대여 시각보다 늦으면 넘는 시간(최대 10시간)은 1시간당 1일 요금의 10%
--   성수기 할증: short_peaks 기간과 겹치면 대여료 × (100 + rate)%
--   주말 추가: 기간에 토·일요일이 있으면 차종별 weekend_fee 를 예약 1건당 한 번
--   배회차비: locations.fee (예약 1건당)

-- 성수기 · 준성수기 기간 (날짜는 'YYYY-MM-DD', 시작일 ~ 종료일 포함)
CREATE TABLE short_peaks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL,
  rate       INTEGER NOT NULL DEFAULT 0,   -- 할증률 % (준성수기 9 · 성수기 18)
  active     INTEGER NOT NULL DEFAULT 1,
  sort       INTEGER NOT NULL DEFAULT 0
);
-- 예스렌터카에 등록된 준성수기 기간 (2026-11-16 확인). 예스렌터카는 종료일 0시까지 겹치면 할증하므로 종료일도 포함으로 같게 넣음
INSERT INTO short_peaks (name, start_date, end_date, rate, sort) VALUES
  ('여름 휴가 준성수기', '2026-07-15', '2026-08-15', 9, 1),
  ('추석 연휴 준성수기', '2026-09-23', '2026-09-26', 9, 2),
  ('크리스마스 준성수기', '2026-12-24', '2026-12-26', 9, 3);

-- 차종별 주말 추가요금 (예약 1건당). 예스렌터카: 승합만 10,000원
ALTER TABLE short_models ADD COLUMN weekend_fee INTEGER NOT NULL DEFAULT 0;
UPDATE short_models SET weekend_fee = 10000 WHERE class = '승합';

-- 예약에 초과 시간 · 대여료 내역 기록
ALTER TABLE reservations ADD COLUMN extra_hours INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reservations ADD COLUMN rent_detail TEXT NOT NULL DEFAULT '';

-- 배회차비: 인천공항 20,000원 · 김포공항 10,000원 · 경기도(일산) 0원 · 서울지역은 탁송비 별도
UPDATE locations SET fee = 20000 WHERE name LIKE '인천공항%';
UPDATE locations SET fee = 10000 WHERE name LIKE '김포공항%';
UPDATE locations SET fee = 0 WHERE name LIKE '경기도%' OR name LIKE '본점%';
UPDATE locations SET fee = 0, name = '서울지역 (탁송비 별도 추가)' WHERE name = '서울지역';
