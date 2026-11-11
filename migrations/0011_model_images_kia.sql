-- 단기 차종 이미지: K5 · 셀토스 · 스포티지 · 쏘렌토 · 카니발 (public/assets/models)
-- 관리자에서 이미 사진을 올린 차종은 그대로 둠
UPDATE short_models SET image_key = '/assets/models/k5.png'       WHERE name LIKE '%K5%'    AND (image_key IS NULL OR image_key = '');
UPDATE short_models SET image_key = '/assets/models/seltos.png'   WHERE name LIKE '%셀토스%'  AND (image_key IS NULL OR image_key = '');
UPDATE short_models SET image_key = '/assets/models/sportage.png' WHERE name LIKE '%스포티지%' AND (image_key IS NULL OR image_key = '');
UPDATE short_models SET image_key = '/assets/models/sorento.png'  WHERE name LIKE '%쏘렌토%'  AND (image_key IS NULL OR image_key = '');
UPDATE short_models SET image_key = '/assets/models/carnival.png' WHERE name LIKE '%카니발%'  AND (image_key IS NULL OR image_key = '');
