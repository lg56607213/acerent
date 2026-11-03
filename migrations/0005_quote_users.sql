-- 견적 사용자 계정 (관리자가 발급 · 관리자 화면에는 들어갈 수 없음)
-- 로그인 주소: /quote  ·  관리자 계정(admin_users)과 완전히 분리
CREATE TABLE quote_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  company       TEXT NOT NULL DEFAULT '',     -- 소속 (제휴사 · 지점 등)
  phone         TEXT NOT NULL DEFAULT '',
  memo          TEXT NOT NULL DEFAULT '',     -- 관리자만 보는 메모
  active        INTEGER NOT NULL DEFAULT 1,   -- 0 이면 로그인 불가
  pw_hash       TEXT NOT NULL,
  pw_salt       TEXT NOT NULL,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE quote_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES quote_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_quote_sessions_user ON quote_sessions(user_id);
