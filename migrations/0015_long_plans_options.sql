-- 중장기 차량 등록 개편: 차량번호로 등록, 이용금액(보증금 · 개월 · 월렌트료 · 연간주행거리 · 만기인수가) 여러 줄,
-- 차량 옵션 체크, 계약조건 · 보험조건
ALTER TABLE long_vehicles ADD COLUMN maker       TEXT NOT NULL DEFAULT '';    -- 제조사 (현대 · 기아 …)
ALTER TABLE long_vehicles ADD COLUMN model_group TEXT NOT NULL DEFAULT '';    -- 모델 (레이 · 쏘렌토 …)
ALTER TABLE long_vehicles ADD COLUMN option_list TEXT NOT NULL DEFAULT '[]';  -- 체크한 차량 옵션 (public/assets/longopts.js 목록)
ALTER TABLE long_vehicles ADD COLUMN terms       TEXT NOT NULL DEFAULT '{}';  -- 계약 · 보험 조건

-- 이용금액: 차량별로 여러 줄, 그중 하나가 목록에 나오는 대표 가격(is_main)
CREATE TABLE long_plans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES long_vehicles(id),
  deposit    INTEGER NOT NULL DEFAULT 0,   -- 보증금 (원)
  term       INTEGER NOT NULL,             -- 계약 개월
  monthly    INTEGER NOT NULL,             -- 월 렌트료 (원, VAT 포함)
  km_year    INTEGER NOT NULL DEFAULT 0,   -- 연간 약정 주행거리 (km)
  buyout     INTEGER NOT NULL DEFAULT 0,   -- 만기 인수(잔존) 가격 (원, 0 = 미기재)
  is_main    INTEGER NOT NULL DEFAULT 0,
  sort       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_long_plans_vehicle ON long_plans(vehicle_id, sort);

-- 신청서에 고른 이용금액 줄
ALTER TABLE applications ADD COLUMN plan_id INTEGER;
