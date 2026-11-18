-- 단기 차종 목록에 연료 · 인승 표시 (레이처럼 '경차 · 가솔린 · 5인승') (2026-11-17)
--   하이브리드: K8, 쏘렌토, 카니발 / 나머지 승용 · SUV 는 가솔린
--   쏘렌토는 '5~6인승' (seats 는 관리자 화면에서 글자로 입력 가능)
UPDATE short_models SET fuel = '하이브리드' WHERE name LIKE '%K8%' OR name LIKE '%쏘렌토%' OR name LIKE '%카니발%';
UPDATE short_models SET fuel = '가솔린' WHERE (fuel IS NULL OR fuel = '')
  AND (name LIKE '%K3%' OR name LIKE '%K5%' OR name LIKE '%그랜저%' OR name LIKE '%K9%' OR name LIKE '%셀토스%' OR name LIKE '%스포티지%');
UPDATE short_models SET seats = '5~6' WHERE name LIKE '%쏘렌토%';
