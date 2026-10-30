-- 테스트용 데이터 (onlycartalk.com 테스트 시에만 넣기)
-- 단기 차종 · 요금(기존 홈페이지 요금표)과 예약 장소는 migrations/0002 에서 자동으로 들어갑니다.
-- 아래 보험료 · 중장기 가격은 화면 확인용 예시입니다. 실제 운영 전 관리자 화면에서 수정하세요.
-- 실행: D1 → acerentcar-db → 콘솔에 붙여넣기  (또는 npx wrangler d1 execute acerentcar-db --remote --file=seed/sample.sql)

INSERT INTO insurance_options (name, per_day, active, sort) VALUES
  ('미가입 (사고 시 본인 부담)', 0, 1, 1),
  ('일반 자차 (면책금 있음)', 15000, 1, 2),
  ('완전 자차 (면책금 없음)', 25000, 1, 3);

-- rentcarerp 연동 전 임시 단기 차량 (차종마다 1~2대)
INSERT INTO short_vehicles (model_id, plate, year)
SELECT id, '테스트' || id || '-1', 2024 FROM short_models;
INSERT INTO short_vehicles (model_id, plate, year)
SELECT id, '테스트' || id || '-2', 2024 FROM short_models WHERE class IN ('준중형', '중형', 'SUV');

INSERT INTO long_vehicles (plate, show_plate, name, class, year, first_reg, km, fuel, color, int_color, seats, displacement, accident, pickup, location, options, badge,
  new_price, tax_cut, car_value, spec_text, added_options, usage_history, repair_history, visible, sort)
VALUES ('12가 3456', 0, '쏘렌토 MQ4 하이브리드 1.6 시그니처 (예시)', 'SUV', 2024, '2024-03-15', 15800, '하이브리드', '스노우 화이트 펄', '블랙', 5, 1598, '무사고', '본점 · 탁송 가능', '수도권',
  '파노라마 선루프, 통풍·열선 시트, 스마트 크루즈, 서라운드 뷰', '즉시출고',
  45000000, 1300000, 33500000,
  '기본사양: 스마트 크루즈 컨트롤, 차로 유지 보조, 후측방 충돌방지 보조, 서라운드 뷰 모니터, 앞좌석 통풍 · 열선 시트, 12.3인치 내비게이션' || char(10) || '선택사양: 파노라마 선루프, 헤드업 디스플레이',
  '[{"name":"파노라마 선루프","price":1190000},{"name":"헤드업 디스플레이","price":690000}]',
  '[{"kind":"장기렌트","period":"2024-03-15 ~ 2026-09-30","user":"법인"}]',
  '[]', 1, 1);

-- 기간별 기준 월 대여료 (연 2만km · 보증금 0 · 선납금 0 기준)
INSERT INTO long_prices (vehicle_id, term, dep_pct, monthly) VALUES
  ((SELECT id FROM long_vehicles WHERE name LIKE '%(예시)' LIMIT 1), 48, 0, 812000),
  ((SELECT id FROM long_vehicles WHERE name LIKE '%(예시)' LIMIT 1), 36, 0, 850000),
  ((SELECT id FROM long_vehicles WHERE name LIKE '%(예시)' LIMIT 1), 24, 0, 901000),
  ((SELECT id FROM long_vehicles WHERE name LIKE '%(예시)' LIMIT 1), 12, 0, 978000);

INSERT INTO posts (board, title, body, sort) VALUES
  ('faq', '예약금 없이 예약이 가능한가요?', '네. 홈페이지에서 예약 신청만 하시면 담당자가 배차를 확인한 뒤 확정 문자를 보내드립니다. 요금은 차량 인수 시 결제합니다.', 1),
  ('faq', '인천공항에서는 어디서 차량을 받나요?', '[인수 장소 안내 문구 — 터미널별 인도 위치]', 2),
  ('faq', '운전자 나이 · 경력 제한이 있나요?', '[운전자 자격 기준 문구]', 3),
  ('faq', '중장기렌트는 신용 심사가 있나요?', '[심사 절차 및 필요 서류 안내 문구]', 4),
  ('faq', '사고가 나면 어떻게 하나요?', '1644-8891로 24시간 사고 접수가 가능합니다.', 5),
  ('faq', '사고로 차량 수리가 필요하면 추가 비용이 있나요?', '대여 중 임차인 과실 사고로 수리가 필요한 경우, 수리비와 함께 수리 기간 동안 표준대여료의 50%가 휴차 보상료로 청구됩니다. 수리는 에이스렌터카가 지정한 업체에서 진행합니다.', 6),
  ('faq', '연료는 어떻게 반납하나요?', '모든 차량은 기본 주유량이 있으며, 반납 시 같은 상태로 반납해 주셔야 합니다. 부족하면 실비로 정산합니다.', 7);

INSERT INTO banners (image_key, text, sub_text, link, visible, sort) VALUES
  ('', '공항 렌터카,' || char(10) || '예약금 없이 바로 예약', '인천·김포공항 인수 · 반납', '/short.html', 1, 1);
