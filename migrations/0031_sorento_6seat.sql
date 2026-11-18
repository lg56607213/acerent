-- 쏘렌토 6인승 차종을 홈페이지에 노출 (2026-11-17)
--   ERP 는 5 · 6인승을 같은 차종코드(SORENTO)로 보내므로, 홈페이지 전용 코드 SORENTO_6S 를 주고
--   ERP 차량 정보의 인승(seats)이 6 이면 6인승 차종에 담음 (src/lib/erp.js)
ALTER TABLE erp_vehicle_fuel ADD COLUMN seats INTEGER;
ALTER TABLE erp_vehicle_fuel ADD COLUMN name TEXT NOT NULL DEFAULT '';
UPDATE short_models SET erp_code = 'SORENTO_6S', seats = '6', month_price = 1400000 WHERE name = '쏘렌토 6인승';
UPDATE short_models SET seats = '5' WHERE name = '쏘렌토 5인승';
