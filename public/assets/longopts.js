// 중장기 차량 옵션 목록 · 계약조건 기본 문구 — 관리자 화면 · 고객 화면 · 서버가 같이 사용
export const OPTION_GROUPS = [
  ['외장/내장', ['선루프', 'HID헤드램프', 'LED헤드램프', 'DRL주간주행등', '파워전동트렁크', '전동접이 사이드미러', '알루미늄 휠', '루프랙', '열선 스티어링 휠', '전동 조절 스티어링 휠', 'ECM룸미러', '하이패스']],
  ['안전장치', ['운전석에어백', '동승석에어백', '사이드에어백', '커튼에어백', '브레이크 잠김 방지(ABS)', '차체자세 제어장치(VDC)', '타이어 공기압센서(TPMS)', '차선이탈 경보 시스템(LDWS)', '전방감지센서', '후방감지센서', '후측방 경보 시스템', '전방카메라', '후방카메라', '어라운드뷰']],
  ['편의장치', ['크루즈 컨트롤', '스마트 크루즈 컨트롤', '헤드업 디스플레이(HUD)', '전자식 주차브레이크(EPB)', '풀오토에어컨', '스마트키', '오토 라이트', '커튼/블라인드', '순정네비게이션', '사제네비게이션', '앞좌석 AV 모니터', '뒷좌석 AV 모니터', '블루투스', '무선충전', 'USB / AUX 단자']],
  ['시트', ['가죽시트', '운전석전동시트', '동승석전동시트', '앞좌석열선시트', '뒷좌석열선시트', '메모리시트', '운전석 통풍시트', '동승석 통풍시트']],
];
export const ALL_OPTIONS = OPTION_GROUPS.flatMap(([, list]) => list);

export const MAKERS = ['현대', '기아', '제네시스', '쉐보레', '르노코리아', 'KG모빌리티', '수입'];

export const STATUS = { available: '출고가능', soon: '출고예정', reserved: '계약중', rented: '월렌트 대여중', accident: '사고대차', contracted: '출고완료' };
// 고객 목록에 보이는 상태 (월렌트 대여중 · 사고대차 · 출고완료는 숨김)
export const PUBLIC_STATUS = ['available', 'soon', 'reserved'];

export const MAINT = { none: '불포함', tour: '순회정비서비스', full: '완전정비포함', basic: '기본정비포함' };
export const MAINT_DEFAULT = {
  none: '정비는 고객이 직접 진행합니다.',
  tour: '전문 정비 기사가 정기적으로 방문해 차량 상태를 점검하고 소모품을 교환합니다.',
  full: '엔진오일 · 소모품 교환과 일반 정비를 모두 포함합니다. (사고 수리 제외)',
  basic: '엔진오일 등 기본 소모품 교환을 포함합니다.',
};
export const AGE = { '26': '만 26세 이상', '21': '만 21세 이상', all: '전연령 이용가능' };
export const DRIVER_DEFAULT = { person: '계약자 외 1인 (등본 또는 가족관계증명서에 기재된 1인)', corp: '법인 대표자 외 1인 / 4대보험 가입 직원' };

// 계약 · 보험 조건을 고객에게 보여 줄 문장으로 (비운 칸은 기본 문구)
export function termRows(t = {}) {
  const d = (v, def) => (String(v ?? '').trim() ? String(v).trim() : def);
  const m = t.maint in MAINT ? t.maint : 'none';
  return {
    contract: [
      ['최소 운전연령', AGE[t.minAge] || AGE['26']],
      ['운전경력', t.career ? `${t.career}년 이상` : '경력 무관'],
      ['신용등급', t.credit ? `${t.credit}등급 이상` : '신용등급 무관'],
      ['중도해지 위약금', t.penalty ? `잔여 렌트료의 ${t.penalty}%` : '없음'],
      ['주행거리 초과', `km당 ${d(t.overKm, '100')}원`],
      ['만기 인수', t.buyout === false || t.buyout === 'no' ? '불가능' : '가능'],
      ['정비 서비스', MAINT[m] + ' — ' + d(t.maintDesc, MAINT_DEFAULT[m])],
    ],
    insurance: [
      ['책임한도', [`대인 ${d(t.liabPerson, '무한')}`, `대물 ${d(t.liabProperty, '1억원')}`, `자손 ${d(t.liabSelf, '1,500만원')}`].join(' · ')],
      ['면책금', [`자차 ${d(t.dedCar, '50만원')}`, `대물 ${d(t.dedProperty, '30만원')}`, `대인 ${d(t.dedPerson, '30만원')}`, `자손 ${d(t.dedSelf, '30만원')}`].join(' · ') + (t.dedNote ? `\n${t.dedNote}` : '')],
      ['추가운전자 (개인)', d(t.driverPerson, DRIVER_DEFAULT.person)],
      ['추가운전자 (법인)', d(t.driverCorp, DRIVER_DEFAULT.corp)],
    ],
  };
}
