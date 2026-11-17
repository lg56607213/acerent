-- 하이브리드 차종은 ERP 에서 별도 차종코드로 구분 (2026-11-17)
--   ERP 에서 하이브리드 K5 · 스포티지 차량의 차종코드를 K5_HEV · SPORTAGE_HEV 로 등록해야 홈페이지에 잡힘
UPDATE short_models SET erp_code = 'K5_HEV' WHERE name = '더뉴K5 3세대 하이브리드';
UPDATE short_models SET erp_code = 'SPORTAGE_HEV' WHERE name = '스포티지NQ5 하이브리드';
