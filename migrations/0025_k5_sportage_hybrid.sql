-- K5 · 스포티지를 가솔린 / 하이브리드 차종으로 나눔 (2026-11-17)
--   기존 차종 = 가솔린, 하이브리드 차종을 하나씩 새로 추가 (요금 · 사진 · ERP 차종코드는 기존 차종과 같게 복사)
--   같은 ERP 차종코드의 차량은 ERP 가 보내는 연료(fuel)로 가솔린 / 하이브리드 차종에 나눠 담김 (src/lib/erp.js)
UPDATE short_models SET fuel = '가솔린' WHERE name = '스포티지NQ5';

INSERT INTO short_models (erp_code, maker, name, class, fuel, seats, features, day_rate, image_key, active, sort, rate_3_4, rate_5_6, rate_7, rate_table, weekend_fee)
SELECT erp_code, maker, name || ' 하이브리드', class, '하이브리드', seats, features, day_rate, image_key, active, sort, rate_3_4, rate_5_6, rate_7, rate_table, weekend_fee
FROM short_models WHERE name IN ('더뉴K5 3세대', '스포티지NQ5');
