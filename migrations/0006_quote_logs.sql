-- 견적 사용자가 발행한 견적서 기록 (관리자 화면 '견적 발행 기록')
-- 발행 시점의 사용자 · 고객 · 차량 · 결과와, 그때 적용된 금리 · 보험료 등 내부 값을 그대로 남긴다.
CREATE TABLE quote_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  no            TEXT NOT NULL UNIQUE,              -- Q-YYYYMMDD-0001
  user_id       INTEGER,                           -- 계정을 지워도 기록은 남김
  user_name     TEXT NOT NULL DEFAULT '',
  user_company  TEXT NOT NULL DEFAULT '',
  username      TEXT NOT NULL DEFAULT '',
  customer_type TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  vehicle       TEXT NOT NULL DEFAULT '',          -- 표시용: 브랜드 모델 라인업 트림
  price         INTEGER NOT NULL DEFAULT 0,        -- 차량가격 (VAT포함)
  summary       TEXT NOT NULL DEFAULT '',          -- 표시용: 36개월 657,800 / 48개월 ...
  input_json    TEXT NOT NULL DEFAULT '{}',        -- 사용자가 넣은 값
  result_json   TEXT NOT NULL DEFAULT '{}',        -- 계산 결과 (내부 값 포함)
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_quote_logs_user ON quote_logs(user_id, id);
CREATE INDEX idx_quote_logs_created ON quote_logs(created_at);
