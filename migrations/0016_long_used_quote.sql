-- 중장기 '견적형' 차량: 취득원가 · 기간별 잔가율로 고객이 직접 견적(계약기간 · 보증금 · 선납금 · 자차 포함 여부)
ALTER TABLE long_vehicles ADD COLUMN price_mode TEXT NOT NULL DEFAULT 'table'; -- quote 견적형 / table 고정 가격표(이용금액 줄)
ALTER TABLE long_vehicles ADD COLUMN acq_cost   INTEGER NOT NULL DEFAULT 0;     -- 취득원가 (원)
ALTER TABLE long_vehicles ADD COLUMN rv_rates   TEXT NOT NULL DEFAULT '{}';     -- 기간별 잔가율 {"12":0.7,"24":0.6,...} (취득원가 대비, 0 이면 그 기간 없음)
ALTER TABLE applications ADD COLUMN quote_json TEXT NOT NULL DEFAULT '';        -- 견적형 신청 시 계산 내역
