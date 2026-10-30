// 중장기 월 렌트료 계산 — 고객 화면(car.js · long.js)과 서버(public.js)가 같은 파일을 사용한다.
//
// 월 렌트료 = 기간별 기준 월 렌트료 (기준 약정거리 · 무보증 · 선납 없음)
//           + (약정거리 - 기준 약정거리) ÷ 10,000km × 1만km당 월 증감액
//           - 보증금 ÷ 1,000,000 × 100만원당 월 인하액
//           - 선납금 ÷ 계약 개월 수
//           + 대물배상 한도별 월 추가금 + 정비 서비스 추가 월 요금
// (10원 단위 반올림, 부가세 포함)

export const DEFAULT_PRICING = {
  kmBase: 20000, // 기준 약정거리 (기준 월 렌트료의 거리)
  kmMin: 10000,
  kmMax: 50000,
  kmPresets: [10000, 15000, 20000, 25000, 30000, 35000, 40000],
  kmFee: 30000, // 1만km 당 월 증감액
  depRates: [0, 10, 15, 20, 25, 30, 50], // 보증금 선택지 (현재 차량가격의 %)
  depMaxPct: 50,
  depDiscount: 5000, // 보증금 100만원 당 월 인하액
  preRates: [0, 10, 15, 20, 30], // 선납금 선택지 (%)
  preMaxPct: 50,
  driverAge: '만 26세 이상',
  liability: [{ label: '1억 원', fee: 0 }, { label: '2억 원', fee: 0 }, { label: '3억 원', fee: 0 }],
  deductible: '30만 원',
  maintItems: ['교통사고 발생 시 사고 접수 · 처리 대행', '사고 대차 서비스 (피해 사고는 상대 보험 대차)', '정비 관련 전화 상담 상시 제공', '24시간 긴급출동'],
  maintAddFee: 0, // 정비 서비스 추가 월 요금 (0 이면 추가 상품 없음)
  maintAddNote: '엔진오일 · 소모품 정기 교환 포함',
  buyout: '있음',
  buyoutNote: '만기 시 정해진 금액으로 차량을 인수할 수 있습니다.',
  regions: ['수도권', '대전/세종/충남/충북', '대구/경북', '광주/전남/전북', '부산/울산/경남', '강원'],
  regionNote: '차량 위치와 상관없이 고객 주소지로 탁송해 드립니다. (탁송비 별도 안내)',
};

const num = (v, d = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : d;
};

// DB 에 저장된 pricing(JSON 문자열 또는 객체)을 기본값과 합친다
export function pricingOf(raw) {
  let p = raw;
  if (typeof raw === 'string') {
    try { p = JSON.parse(raw || '{}'); } catch { p = {}; }
  }
  p = p && typeof p === 'object' ? p : {};
  const out = { ...DEFAULT_PRICING, ...p };
  for (const k of ['kmBase', 'kmMin', 'kmMax', 'kmFee', 'depMaxPct', 'depDiscount', 'preMaxPct', 'maintAddFee']) out[k] = Math.max(0, num(out[k], DEFAULT_PRICING[k]));
  if (out.kmMax < out.kmMin) out.kmMax = out.kmMin;
  for (const k of ['kmPresets', 'depRates', 'preRates']) {
    out[k] = (Array.isArray(out[k]) ? out[k] : DEFAULT_PRICING[k]).map((x) => num(x, -1)).filter((x) => x >= 0);
    out[k] = [...new Set(out[k])].sort((a, b) => a - b);
  }
  out.kmPresets = out.kmPresets.filter((x) => x >= out.kmMin && x <= out.kmMax);
  out.depRates = out.depRates.filter((x) => x <= out.depMaxPct);
  out.preRates = out.preRates.filter((x) => x <= out.preMaxPct);
  out.liability = (Array.isArray(out.liability) ? out.liability : []).filter((x) => x && x.label).map((x) => ({ label: String(x.label), fee: num(x.fee) }));
  for (const k of ['maintItems', 'regions']) out[k] = (Array.isArray(out[k]) ? out[k] : []).map((x) => String(x).trim()).filter(Boolean);
  return out;
}

const r10 = (n) => Math.round(n / 10) * 10;
const r1000 = (n) => Math.round(n / 1000) * 1000;

export const rateAmount = (carValue, pct) => r1000(((carValue || 0) * pct) / 100);

// 선택값 정리: { term, km, dep(원), pre(원), liab(번호), maint(true/false), region }
export function normalize(v, p, bases, sel = {}) {
  const cv = v.car_value || 0;
  const terms = bases.map((b) => b.term);
  const term = terms.includes(num(sel.term)) ? num(sel.term) : terms.includes(36) ? 36 : terms[terms.length - 1] || 0;
  let km = num(sel.km, p.kmBase) || p.kmBase;
  km = Math.min(p.kmMax, Math.max(p.kmMin, Math.round(km / 1000) * 1000));
  const cap = (pct) => r1000((cv * pct) / 100);
  const dep = Math.min(cap(p.depMaxPct), Math.max(0, r1000(num(sel.dep))));
  const pre = Math.min(cap(p.preMaxPct), Math.max(0, r1000(num(sel.pre))));
  const liab = p.liability[num(sel.liab)] ? num(sel.liab) : 0;
  const maint = !!sel.maint && p.maintAddFee > 0;
  const region = p.regions.includes(sel.region) ? sel.region : p.regions[0] || '';
  return { term, km, dep, pre, liab, maint, region };
}

// 기간별 월 렌트료 목록
export function quote(v, rawPricing, bases, sel) {
  const p = pricingOf(rawPricing);
  const list = (bases || []).filter((b) => b.monthly > 0).sort((a, b) => b.term - a.term);
  const s = normalize(v, p, list, sel);
  const adj =
    ((s.km - p.kmBase) / 10000) * p.kmFee - (s.dep / 1000000) * p.depDiscount + (p.liability[s.liab] ? p.liability[s.liab].fee : 0) + (s.maint ? p.maintAddFee : 0);
  const rows = list.map((b) => ({ term: b.term, monthly: Math.max(0, r10(b.monthly + adj - s.pre / b.term)) }));
  const cur = rows.find((r) => r.term === s.term);
  return { p, sel: s, rows, monthly: cur ? cur.monthly : 0 };
}

// 선택 내용을 한 줄로 (신청서 · 메일용)
export function describe(p, s) {
  return [
    `연 ${s.km.toLocaleString('ko-KR')}km`,
    p.liability[s.liab] ? `대물 ${p.liability[s.liab].label}` : '',
    s.maint ? '정비 서비스 추가' : '',
    s.region ? `인도 ${s.region}` : '',
  ].filter(Boolean).join(' · ');
}
