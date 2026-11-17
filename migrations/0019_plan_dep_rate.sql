-- 중장기 가격표 차량: 보증금 · 선납금 금리 7.5%
UPDATE settings SET value = json_set(value, '$.planDepRate', 7.5) WHERE key = 'quote_config' AND json_valid(value);
