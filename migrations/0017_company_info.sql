-- 사업자등록증 기준 회사 정보 (홈페이지 하단 표기). 관리자가 이미 바꾼 값은 건드리지 않음
UPDATE settings SET value = '393-81-01841' WHERE key = 'company_biz_no' AND value = '';
UPDATE settings SET value = '백은영' WHERE key = 'company_ceo' AND value = '';
UPDATE settings SET value = '경기도 고양시 일산서구 주화로 210, 901호(대화동, 우리프라자)'
 WHERE key = 'company_address' AND value IN ('', '경기도 고양시 일산서구 주화로 210 우리프라자 9층');
INSERT OR IGNORE INTO settings (key, value) VALUES ('company_name', '주식회사 에이스렌터카');
