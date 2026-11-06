-- 단기 예약: 고객이 차량(차량번호·색상·주행거리)을 직접 고르고, 자차는 건당 정액으로 선택

-- 자차 보험 정액 요금 (대여 기간과 관계없이 총요금에 한 번 더함). 요금 = per_day × 일수 + flat_fee
ALTER TABLE insurance_options ADD COLUMN flat_fee INTEGER NOT NULL DEFAULT 0;

-- 고객이 고른 ERP 차량 id (rentcarerp 가용 조회의 id). ERP 반영 전 중복 배정 방지에 쓴다
ALTER TABLE reservations ADD COLUMN erp_vehicle_id TEXT NOT NULL DEFAULT '';

-- 자차 선택지: 불포함 / 자차보험(+20,000원 정액, 자차한도 400만원)
INSERT INTO insurance_options (name, per_day, flat_fee, active, sort)
SELECT '자차 불포함', 0, 0, 1, 1 WHERE NOT EXISTS (SELECT 1 FROM insurance_options);
INSERT INTO insurance_options (name, per_day, flat_fee, active, sort)
SELECT '자차보험 (자차한도 400만원)', 0, 20000, 1, 2 WHERE (SELECT COUNT(*) FROM insurance_options) = 1;
