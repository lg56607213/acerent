-- 단기 차종 이미지: 그랜저 · K9 (관리자에서 이미 사진을 올렸으면 그대로 둠)
UPDATE short_models SET image_key = '/assets/models/grandeur.png' WHERE name LIKE '%그랜저%' AND (image_key IS NULL OR image_key = '');
UPDATE short_models SET image_key = '/assets/models/k9.png'       WHERE name LIKE '%K9%'    AND (image_key IS NULL OR image_key = '');
