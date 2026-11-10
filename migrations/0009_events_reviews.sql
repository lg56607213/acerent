-- 이벤트 페이지 · 이용후기 게시판 · 고객 동의 기록 · 문자 인증

-- 이벤트: 기간 · 대표 이미지 · 한 줄 소개 (posts.board = 'event')
ALTER TABLE posts ADD COLUMN start_date TEXT NOT NULL DEFAULT '';   -- 'YYYY-MM-DD'
ALTER TABLE posts ADD COLUMN end_date   TEXT NOT NULL DEFAULT '';   -- 비우면 상시
ALTER TABLE posts ADD COLUMN image_key  TEXT NOT NULL DEFAULT '';   -- 목록 · 메인에 나오는 대표 이미지
ALTER TABLE posts ADD COLUMN summary    TEXT NOT NULL DEFAULT '';
ALTER TABLE posts ADD COLUMN cta_label  TEXT NOT NULL DEFAULT '';   -- 버튼 (예: 후기 쓰러 가기)
ALTER TABLE posts ADD COLUMN cta_link   TEXT NOT NULL DEFAULT '';   -- 버튼 링크 (예: /support.html?tab=review)

-- 고객 동의 기록 (휴대폰 번호 기준 고객)
ALTER TABLE customers ADD COLUMN privacy_agreed_at   TEXT NOT NULL DEFAULT '';  -- [필수] 개인정보 수집 · 이용 동의 (UTC)
ALTER TABLE customers ADD COLUMN marketing_agree     INTEGER NOT NULL DEFAULT 0; -- [선택] 마케팅 수신 동의
ALTER TABLE customers ADD COLUMN marketing_agreed_at TEXT NOT NULL DEFAULT '';  -- 마지막 동의 · 철회 시각 (UTC)
ALTER TABLE customers ADD COLUMN phone_verified_at   TEXT NOT NULL DEFAULT '';  -- 마지막 문자 인증 (UTC)

-- 이용후기
CREATE TABLE reviews (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  no             TEXT NOT NULL UNIQUE,              -- R-20261110-0001
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  customer_id    INTEGER REFERENCES customers(id),
  rating         INTEGER NOT NULL DEFAULT 5,        -- 1~5
  car_model      TEXT NOT NULL DEFAULT '',          -- 이용 차종
  use_month      TEXT NOT NULL DEFAULT '',          -- 이용 시기 'YYYY-MM'
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  photos         TEXT NOT NULL DEFAULT '[]',        -- R2 키 목록
  status         TEXT NOT NULL DEFAULT 'pending',   -- published 게시 / pending 확인 대기 / hidden 숨김
  flag           TEXT NOT NULL DEFAULT '',          -- 확인 대기로 보낸 이유 (자동 차단 규칙)
  phone_verified INTEGER NOT NULL DEFAULT 0,
  coupon         TEXT NOT NULL DEFAULT 'none',      -- none 미발송 / sent 발송 완료 / skip 대상 아님
  coupon_at      TEXT,
  admin_memo     TEXT NOT NULL DEFAULT '',
  ip_hash        TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reviews_status ON reviews(status, id);
CREATE INDEX idx_reviews_phone ON reviews(phone);
CREATE INDEX idx_reviews_ip ON reviews(ip_hash, created_at);

-- 휴대폰 문자 인증번호 (문자 발송 서비스를 연결했을 때만 사용)
CREATE TABLE phone_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  phone      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  tries      INTEGER NOT NULL DEFAULT 0,
  used       INTEGER NOT NULL DEFAULT 0,
  ip_hash    TEXT NOT NULL DEFAULT '',
  token_hash TEXT NOT NULL DEFAULT '',             -- 인증 성공 후 발급한 확인 토큰 (30분)
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_phone_codes ON phone_codes(phone, created_at);

-- 이용후기 기본 설정 (관리자 '이용후기'에서 수정) — review_approve_all = 1 이면 모든 후기를 관리자 확인 후 게시
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('review_notice', '단기렌트 이용 후 후기를 남겨주시면 확인 후 커피 쿠폰을 보내드립니다. (휴대폰 번호 1개당 이용 1건 기준)'),
  ('review_approve_all', '0'),
  ('review_banned_words', '카지노,바카라,토토,슬롯,도박,먹튀,대출,급전,작업대출,텔레그램,오픈채팅,부업,재택알바,수익보장,코인리딩,성인,출장,홀덤');
