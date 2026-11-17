-- 주단위렌트(7일) 확정 가격 · 주행거리 제한 (2026-11-17)
--   7일 대여는 week_price 그대로 (성수기 할증 · 주말 추가 · 배회차비 없음), 전 차종 1,200km 제한
--   초과 1km당 요금은 월렌트와 같은 over_km_fee (레이 · 셀토스 100원 / 그 외 200원)
ALTER TABLE short_models ADD COLUMN week_price INTEGER NOT NULL DEFAULT 0;
ALTER TABLE short_models ADD COLUMN week_km INTEGER NOT NULL DEFAULT 0;
UPDATE short_models SET week_km = 1200;
UPDATE short_models SET week_price = 320000 WHERE name = '레이';
UPDATE short_models SET week_price = 440000 WHERE name = '셀토스';
UPDATE short_models SET week_price = 490000 WHERE name IN ('K5 3세대', '더뉴K5 3세대');
UPDATE short_models SET week_price = 520000 WHERE name = '더뉴K5 3세대 하이브리드';
UPDATE short_models SET week_price = 560000 WHERE name = '스포티지NQ5';
UPDATE short_models SET week_price = 660000 WHERE name = '스포티지NQ5 하이브리드';
UPDATE short_models SET week_price = 700000 WHERE name IN ('쏘렌토 5인승', '쏘렌토 6인승');
UPDATE short_models SET week_price = 800000 WHERE name = '4세대카니발 9인승';
