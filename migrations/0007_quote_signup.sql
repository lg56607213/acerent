-- 견적 사용자 회원가입 (가입 신청 → 관리자 승인 후 로그인)
-- status: pending(승인 대기) / approved(승인) / rejected(거절). 관리자가 직접 만든 계정과 기존 계정은 approved.
ALTER TABLE quote_users ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE quote_users ADD COLUMN signup INTEGER NOT NULL DEFAULT 0;          -- 1 = 사용자가 직접 가입 신청
ALTER TABLE quote_users ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE quote_users ADD COLUMN signup_note TEXT NOT NULL DEFAULT '';       -- 가입 신청 시 남긴 메모
ALTER TABLE quote_users ADD COLUMN decided_at TEXT;                            -- 승인 · 거절 일시 (UTC)
ALTER TABLE quote_users ADD COLUMN decided_by TEXT NOT NULL DEFAULT '';        -- 승인 · 거절한 관리자
ALTER TABLE quote_users ADD COLUMN reject_reason TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_quote_users_status ON quote_users(status);

-- 관리자 메일 알림 항목에 '견적 회원가입' 추가 (기본으로 켬)
UPDATE settings SET value = json_insert(value, '$[#]', '견적 회원가입')
 WHERE key = 'notify_kinds' AND json_valid(value) AND value NOT LIKE '%견적 회원가입%';
