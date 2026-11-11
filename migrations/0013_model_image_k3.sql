-- 단기 차종 이미지: K3 (올뉴K3 · 더뉴K3, 관리자에서 이미 사진을 올렸으면 그대로 둠)
UPDATE short_models SET image_key = '/assets/models/k3.png' WHERE name LIKE '%K3%' AND (image_key IS NULL OR image_key = '');
