-- 중장기 차량 상세 (아마존카 중고차 상세 화면 방식)
--  · 차량 가격 구성: 신차가격 - 개소세 감면 - 감가상각 = 현재 차량가격(car_value)
--  · 월 렌트료: 기간별 기준 월 렌트료(long_prices 의 dep_pct = 0 행) 에 약정거리 · 보증금 · 선납금 · 대물 · 정비 조건을 반영해 계산
--    (계산식은 public/assets/longcalc.js — 화면과 서버가 같은 파일을 씀)
ALTER TABLE long_vehicles ADD COLUMN new_price     INTEGER NOT NULL DEFAULT 0;   -- 신차가격
ALTER TABLE long_vehicles ADD COLUMN tax_cut       INTEGER NOT NULL DEFAULT 0;   -- 신차 개소세 감면액
ALTER TABLE long_vehicles ADD COLUMN displacement  INTEGER NOT NULL DEFAULT 0;   -- 배기량 cc
ALTER TABLE long_vehicles ADD COLUMN int_color     TEXT NOT NULL DEFAULT '';     -- 내장 색상
ALTER TABLE long_vehicles ADD COLUMN show_plate    INTEGER NOT NULL DEFAULT 0;   -- 차량번호 고객 공개
ALTER TABLE long_vehicles ADD COLUMN location      TEXT NOT NULL DEFAULT '';     -- 차량 현 위치
ALTER TABLE long_vehicles ADD COLUMN avail_note    TEXT NOT NULL DEFAULT '';     -- 출고 안내 (예: 11월 중순 반납 예정)
ALTER TABLE long_vehicles ADD COLUMN spec_text     TEXT NOT NULL DEFAULT '';     -- 사양정보 (기본사양 · 선택사양 설명)
ALTER TABLE long_vehicles ADD COLUMN added_options TEXT NOT NULL DEFAULT '[]';   -- 추가 옵션 [{name, price}]
ALTER TABLE long_vehicles ADD COLUMN usage_history TEXT NOT NULL DEFAULT '[]';   -- 이용이력 [{kind, period, user}]
ALTER TABLE long_vehicles ADD COLUMN repair_history TEXT NOT NULL DEFAULT '[]';  -- 사고수리내역 [{date, detail, cost}]
ALTER TABLE long_vehicles ADD COLUMN pricing       TEXT NOT NULL DEFAULT '{}';   -- 가격 조건 (약정거리 · 보증금 · 선납금 · 보험 · 정비 · 매입옵션 · 인도지역)

-- 신청서에 남길 선택 조건
ALTER TABLE applications ADD COLUMN prepay_amt INTEGER NOT NULL DEFAULT 0;      -- 선납금
ALTER TABLE applications ADD COLUMN extra      TEXT NOT NULL DEFAULT '';         -- 대물 · 정비 · 인도지역 등 선택 내용
