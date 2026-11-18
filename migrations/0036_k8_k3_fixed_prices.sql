-- K8 하이브리드 = 쏘렌토, 더뉴K3 = 셀토스 (주단위 · 월렌트 확정 가격 · 주행거리 제한 · 초과 km 요금) (2026-11-17)
UPDATE short_models SET week_price = 700000, week_km = 1200, month_price = 1400000, month_km = 2500, over_km_fee = 200 WHERE name = 'K8';
UPDATE short_models SET week_price = 440000, week_km = 1200, month_price = 700000, month_km = 2500, over_km_fee = 100 WHERE name = '더뉴K3';
