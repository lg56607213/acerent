-- 에이스렌터카 홈페이지 DB 구조 (Cloudflare D1 / SQLite)
-- 금액은 모두 원 단위 정수, 일시는 'YYYY-MM-DDTHH:MM' (한국시간) 문자열

-- 사이트 설정 (알림 메일 주소, 메일 보낼 항목 등)
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- 관리자 계정 / 로그인 세션
CREATE TABLE admin_users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL DEFAULT '',
  pw_hash    TEXT NOT NULL,
  pw_salt    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- 단기 예약 장소 (관리자가 추가·삭제·순서·사용 여부 설정)
CREATE TABLE locations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT '공항',      -- 공항 / 지점 / 딜리버리
  guide      TEXT NOT NULL DEFAULT '',          -- 인수 위치 안내 (확정 안내에 사용)
  hours      TEXT NOT NULL DEFAULT '',
  fee        INTEGER NOT NULL DEFAULT 0,        -- 추가 요금
  can_pickup INTEGER NOT NULL DEFAULT 1,
  can_return INTEGER NOT NULL DEFAULT 1,
  active     INTEGER NOT NULL DEFAULT 1,
  sort       INTEGER NOT NULL DEFAULT 0
);

-- 단기 차종 (차종별 일요금 + 현대·기아 대표 이미지)
CREATE TABLE short_models (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  erp_code   TEXT NOT NULL DEFAULT '',          -- rentcarerp 차종 코드 (연동 시 매칭)
  maker      TEXT NOT NULL DEFAULT '',
  name       TEXT NOT NULL,
  class      TEXT NOT NULL DEFAULT '',          -- 경차 / 준중형 / 중형 / SUV / 승합
  fuel       TEXT NOT NULL DEFAULT '',
  seats      INTEGER NOT NULL DEFAULT 5,
  features   TEXT NOT NULL DEFAULT '',
  day_rate   INTEGER NOT NULL DEFAULT 0,
  image_key  TEXT NOT NULL DEFAULT '',
  active     INTEGER NOT NULL DEFAULT 1,
  sort       INTEGER NOT NULL DEFAULT 0
);

-- 단기 차량 (rentcarerp 연동 전 임시 목록 — ERP_API_BASE 가 비어 있을 때만 사용)
CREATE TABLE short_vehicles (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id  INTEGER NOT NULL REFERENCES short_models(id) ON DELETE CASCADE,
  plate     TEXT NOT NULL DEFAULT '',
  year      INTEGER,
  active    INTEGER NOT NULL DEFAULT 1
);

-- 자차 보험 선택지
CREATE TABLE insurance_options (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL,
  per_day  INTEGER NOT NULL DEFAULT 0,
  active   INTEGER NOT NULL DEFAULT 1,
  sort     INTEGER NOT NULL DEFAULT 0
);

-- 고객 (예약·신청·문의 시 연락처 기준으로 자동 생성·연결)
CREATE TABLE customers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL DEFAULT '개인',      -- 개인 / 개인사업자 / 법인
  company    TEXT NOT NULL DEFAULT '',
  biz_no     TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  source     TEXT NOT NULL DEFAULT '',
  erp_ref    TEXT NOT NULL DEFAULT '',
  memo       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_customers_phone ON customers(phone);

-- 단기렌트 예약
CREATE TABLE reservations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  no             TEXT NOT NULL UNIQUE,          -- S-20261114-0001
  status         TEXT NOT NULL DEFAULT 'pending', -- pending 확정대기 / confirmed 확정 / done 완료 / cancelled 취소
  location_id    INTEGER,
  location_name  TEXT NOT NULL DEFAULT '',
  location_fee   INTEGER NOT NULL DEFAULT 0,
  pickup_at      TEXT NOT NULL,
  return_at      TEXT NOT NULL,
  days           INTEGER NOT NULL,
  model_id       INTEGER,
  model_name     TEXT NOT NULL DEFAULT '',
  vehicle_ref    TEXT NOT NULL DEFAULT '',      -- 배정 차량 (ERP 차량 ID 또는 차량번호)
  day_rate       INTEGER NOT NULL DEFAULT 0,
  rent_amt       INTEGER NOT NULL DEFAULT 0,
  insurance_name TEXT NOT NULL DEFAULT '',
  insurance_amt  INTEGER NOT NULL DEFAULT 0,
  options        TEXT NOT NULL DEFAULT '[]',
  total_amt      INTEGER NOT NULL DEFAULT 0,
  customer_id    INTEGER REFERENCES customers(id),
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  birth          TEXT NOT NULL DEFAULT '',
  license        TEXT NOT NULL DEFAULT '',
  flight         TEXT NOT NULL DEFAULT '',
  request        TEXT NOT NULL DEFAULT '',
  admin_memo     TEXT NOT NULL DEFAULT '',
  erp_synced     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_res_period ON reservations(pickup_at, return_at);
CREATE INDEX idx_res_status ON reservations(status);

-- 중장기 차량 (관리자가 직접 등록 · 실차 사진 · 가격표)
CREATE TABLE long_vehicles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  erp_ref     TEXT NOT NULL DEFAULT '',
  plate       TEXT NOT NULL DEFAULT '',
  name        TEXT NOT NULL,
  class       TEXT NOT NULL DEFAULT '',
  year        INTEGER,
  first_reg   TEXT NOT NULL DEFAULT '',
  km          INTEGER NOT NULL DEFAULT 0,
  fuel        TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT '',
  seats       INTEGER NOT NULL DEFAULT 5,
  accident    TEXT NOT NULL DEFAULT '',
  pickup      TEXT NOT NULL DEFAULT '',
  options     TEXT NOT NULL DEFAULT '',
  badge       TEXT NOT NULL DEFAULT '즉시출고',
  car_value   INTEGER NOT NULL DEFAULT 0,       -- 보증금 % 계산 기준 금액
  km_note     TEXT NOT NULL DEFAULT '연 2만km 기준',
  status      TEXT NOT NULL DEFAULT 'available', -- available / reserved / contracted
  visible     INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE long_prices (
  vehicle_id INTEGER NOT NULL REFERENCES long_vehicles(id) ON DELETE CASCADE,
  term       INTEGER NOT NULL,                  -- 개월
  dep_pct    INTEGER NOT NULL,                  -- 보증금 % (0 = 무보증)
  monthly    INTEGER NOT NULL,
  PRIMARY KEY (vehicle_id, term, dep_pct)
);
CREATE TABLE long_photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES long_vehicles(id) ON DELETE CASCADE,
  image_key  TEXT NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 중장기 신청 / 법인 견적
CREATE TABLE applications (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  no             TEXT NOT NULL UNIQUE,          -- L-20261029-0001
  status         TEXT NOT NULL DEFAULT 'review', -- review 심사대기 / approved 승인 / contracted 계약완료 / rejected 부결 / cancelled 취소
  applicant_type TEXT NOT NULL DEFAULT 'person', -- person / corp
  vehicle_id     INTEGER,
  vehicle_name   TEXT NOT NULL DEFAULT '',
  term           INTEGER,
  dep_pct        INTEGER,
  deposit_amt    INTEGER NOT NULL DEFAULT 0,
  monthly        INTEGER NOT NULL DEFAULT 0,
  km             TEXT NOT NULL DEFAULT '',
  company        TEXT NOT NULL DEFAULT '',
  biz_no         TEXT NOT NULL DEFAULT '',
  qty            TEXT NOT NULL DEFAULT '',
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  wish_date      TEXT NOT NULL DEFAULT '',
  request        TEXT NOT NULL DEFAULT '',
  admin_memo     TEXT NOT NULL DEFAULT '',
  customer_id    INTEGER REFERENCES customers(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 1:1 문의 (Q&A)
CREATE TABLE inquiries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  no          TEXT NOT NULL UNIQUE,             -- Q-20261029-0001
  type        TEXT NOT NULL DEFAULT '기타',
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  is_secret   INTEGER NOT NULL DEFAULT 1,
  pw_hash     TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '[]',       -- R2 이미지 키 목록
  status      TEXT NOT NULL DEFAULT 'wait',     -- wait 답변대기 / done 답변완료
  answer      TEXT NOT NULL DEFAULT '',
  answered_at TEXT,
  customer_id INTEGER REFERENCES customers(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 공지사항 · 이벤트 · 자주 묻는 질문
CREATE TABLE posts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  board       TEXT NOT NULL,                    -- notice / event / faq
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  pinned      INTEGER NOT NULL DEFAULT 0,
  visible     INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0,
  attachments TEXT NOT NULL DEFAULT '[]',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 메인 배너
CREATE TABLE banners (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  image_key TEXT NOT NULL DEFAULT '',
  text      TEXT NOT NULL DEFAULT '',
  sub_text  TEXT NOT NULL DEFAULT '',
  link      TEXT NOT NULL DEFAULT '',
  visible   INTEGER NOT NULL DEFAULT 1,
  sort      INTEGER NOT NULL DEFAULT 0
);

-- 알림 메일 발송 기록 (수신 주소별 1행)
CREATE TABLE mail_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,                     -- 단기 예약 / 중장기 신청 / 법인 견적 / 1:1 문의 / 테스트
  ref_no     TEXT NOT NULL DEFAULT '',
  recipient  TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body_html  TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',   -- sent / failed
  error      TEXT NOT NULL DEFAULT '',
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at    TEXT
);
CREATE INDEX idx_mail_status ON mail_log(status);

-- 기본 설정값
INSERT INTO settings (key, value) VALUES
  ('notify_email_1', ''),
  ('notify_email_2', ''),
  ('notify_kinds', '["단기 예약","중장기 신청","법인 견적","1:1 문의"]'),
  ('site_phone', '1644-8891'),
  ('site_messenger', 'ace16448891'),
  ('company_address', '경기도 고양시 일산서구 주화로 210 우리프라자 9층'),
  ('company_biz_no', ''),
  ('company_ceo', ''),
  ('min_rent_hours', '24'),
  ('short_min_age_note', '만 21세 이상, 운전경력 1년 이상');
