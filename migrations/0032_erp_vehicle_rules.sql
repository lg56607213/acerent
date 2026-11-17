-- 단기 차량 예외 (차량번호별) (2026-11-17)
--   seats: ERP 에 인승 정보가 없을 때 지정 (6 → 홈페이지 _6S 차종) / hidden: 단기 · 주단위 · 월렌트 목록에서 숨김
CREATE TABLE erp_vehicle_rules (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  plate  TEXT NOT NULL DEFAULT '',
  seats  INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  memo   TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  sort   INTEGER NOT NULL DEFAULT 0
);
INSERT INTO erp_vehicle_rules (plate, seats, hidden, memo) VALUES
  ('109하7605', 5, 0, '쏘렌토 5인승'),
  ('109허7542', 6, 0, '쏘렌토 6인승'),
  ('109허7650', 6, 0, '쏘렌토 6인승'),
  ('109하7796', 0, 1, '쏘렌토 · 장기로 나감 (단기 목록 숨김)');
