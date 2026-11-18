-- 차종별 자차보험 한도 (만원) (2026-11-17) — 0 이면 보험 이름의 한도(400만원) 그대로
ALTER TABLE short_models ADD COLUMN self_ins_limit INTEGER NOT NULL DEFAULT 0;
UPDATE short_models SET self_ins_limit = 700 WHERE name LIKE '%카니발%';
