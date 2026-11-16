-- 견적기 상품구분 (N 일반상품 · L 저신용자상품). 일반상품 금리 10%, 저신용자상품 14%(코드 기본값).
-- 홈페이지 중고차(중장기 견적형) 금리는 지금 금리를 그대로 usedRate 로 옮겨 둠
UPDATE settings
   SET value = json_set(value,
         '$.usedRate', COALESCE(json_extract(value, '$.usedRate'), json_extract(value, '$.rate'), 12),
         '$.rate', 10)
 WHERE key = 'quote_config' AND json_valid(value) AND json_extract(value, '$.products') IS NULL;
