-- ERP 차량별 연료 기록 (2026-11-17)
--   ERP 빈 차량 응답에 연료가 없어서, K5 · 스포티지처럼 하이브리드 차종(_HEV)이 따로 있는 차종은
--   ERP 차량 정보(/api/public/vehicles)에서 연료를 확인해 7일 보관 (src/lib/erp.js)
CREATE TABLE erp_vehicle_fuel (
  vehicle_id TEXT PRIMARY KEY,
  plate      TEXT NOT NULL DEFAULT '',
  fuel       TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
