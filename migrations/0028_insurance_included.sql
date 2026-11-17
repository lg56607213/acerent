-- 단기 · 주단위 · 월렌트: 모든 차량 자차보험 기본 포함, 0원 (2026-11-17)
--   '자차 불포함' 선택지는 숨기고, 자차보험은 추가 요금 없이 포함
UPDATE insurance_options SET active = 0 WHERE name = '자차 불포함';
UPDATE insurance_options SET name = '자차보험 포함 (자차한도 400만원)', per_day = 0, flat_fee = 0, active = 1 WHERE name LIKE '자차보험%';
