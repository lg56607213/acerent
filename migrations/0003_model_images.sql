-- 단기 차종 대표 이미지 (mytruck 저장소에서 가져온 이미지, public/assets/models)
UPDATE short_models SET image_key = '/assets/models/ray.png' WHERE name = '레이' AND image_key = '';
UPDATE short_models SET image_key = '/assets/models/staria.png' WHERE name LIKE '스타리아%' AND image_key = '';
