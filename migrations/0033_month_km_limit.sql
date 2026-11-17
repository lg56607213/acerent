-- 월렌트 주행거리 제한 (2026-11-17)
--   전 차종 30일 2,500km 제한, 초과 1km당: 레이 · 셀토스 100원 / K5 · 스포티지 · 쏘렌토 · 카니발 · K8 200원
ALTER TABLE short_models ADD COLUMN month_km INTEGER NOT NULL DEFAULT 0;
ALTER TABLE short_models ADD COLUMN over_km_fee INTEGER NOT NULL DEFAULT 0;
UPDATE short_models SET month_km = 2500;
UPDATE short_models SET over_km_fee = 100 WHERE name LIKE '%레이%' OR name LIKE '%셀토스%';
UPDATE short_models SET over_km_fee = 200 WHERE name LIKE '%K5%' OR name LIKE '%스포티지%' OR name LIKE '%쏘렌토%' OR name LIKE '%카니발%' OR name LIKE '%K8%';
