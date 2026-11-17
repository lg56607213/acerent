-- 대여 장소 목록에서 서울지역은 탁송비가 따로 붙는다는 걸 이름에 표시 (2026-11-17)
UPDATE locations SET name = '서울지역 (탁송비 별도)' WHERE name = '서울지역';
