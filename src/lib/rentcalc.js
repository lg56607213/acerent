// 장기렌트 렌트료 계산 (견적 사용자용 · 서버에서만 실행)
// 계산식은 엑셀 견적기(견적기 Ace rent_26.10.23F) '계산내역' 시트와 같음.
// 금리 · 보험료 · AG수수료 · 자동차세 · 최대 잔가율은 관리자 '견적 설정'(settings.quote_config)에서 가져오고,
// 사용자 화면에는 결과 금액만 내려준다 (toPublic).
import DATA from '../data/quote-data.json';

export const TERMS = [12, 24, 36, 48, 60];

// ── 차종별 보험 조건 ─────────────────────────────────────
// 보험 등급(보상 한도 · 면책금 묶음)을 만들고, 차종(제조사|구분|모델)마다 등급을 지정한다.
// 기본값: 렌트 계약서 ⑨항 (대인 무제한 · 대물 1억 · 자손 1,500만원 · 면책금 각 50만원), 자차 한도 소·중형 400만원 / 대형 700만원
export const INS_FIELDS = [
  ['bi', '대인'], ['pd', '대물'], ['self', '자기신체사고'], ['car', '자차 한도'], ['un', '무보험차상해'],
  ['dBi', '대인 면책금'], ['dPd', '대물 면책금'], ['dSelf', '자손 면책금'], ['dCar', '자차 면책금'],
];
const GRADE = (id, name, car) => ({ id, name, bi: '무제한', pd: '1억', self: '1,500만원', car, un: '가입', dBi: '50만원', dPd: '50만원', dSelf: '50만원', dCar: '50만원' });
const LARGE_MODELS = new Set([
  '그랜저', 'K8', 'K9', '싼타페', '쏘렌토', '팰리세이드(가솔린)', '팰리세이드 Hybird', '타스만', '카니발', '카니발 하이리무진',
  '스타리아', '스타리아 Hybrid', '스타리아 라운지', '스타리아 킨더', '스타리아 리무진',
  '아이오닉9', 'EV9', '디올 뉴 넥쏘', '더 뉴 스타리아 Electric', '더 뉴 스타리아 라운지 Electric', '더 뉴 스타리아 리무진 Electric',
]);
export const modelKey = (mk, cat, model) => `${mk}|${cat}|${model}`;
export function modelList() {
  const seen = new Set(), out = [];
  for (const t of DATA.T) { const k = modelKey(t[0], t[1], t[2]); if (!seen.has(k)) { seen.add(k); out.push({ key: k, mk: t[0], cat: t[1], model: t[2] }); } }
  return out;
}
const DEFAULT_INS_MAP = Object.fromEntries(modelList().map((m) => [m.key, LARGE_MODELS.has(m.model) ? 'large' : 'mid']));

export const DEFAULT_QUOTE_CONFIG = {
  rate: 12, // 연 %
  insurance: 100000, // 월 보험료 (원)
  toolAg: '5%', // 관리자용 견적기(/admin/quote)의 AG 수수료 기본값 (회원 견적과 무관)
  ag: '1%', // 관리자 AG 수수료 (사용자에게 안 보임): % 또는 원. 사용자 AG 는 상품별로 사용자가 따로 입력
  maint: 0, // 월 정비료 (Self)
  acq: 4, // 취득세율 %
  plate1: 10800, plate2: 22000, stamp: 2000, reg: 20000, bond: 0,
  tint: 110000, bb: 165000, // 썬팅 · 블랙박스 (VAT포함)
  del1: 330000, // 제조사 탁송료 기본값 (사용자가 바꿀 수 있음)
  rvKm: 30000, rvAdj: 1.4, // 잔가 기준 약정거리 · 5천km당 조정(%p)
  rv: DATA.RV, // 최대 잔가율표: { 잔가그룹: [12,24,36,48,60개월] } (0~1, null = 견적 불가)
  rvDefault: [null, null, null, null, null], // 잔가표에 없는 차종의 최대 잔가율
  carTax: '영업용', // 승용 자동차세 기준
  cc: [[0, 18, 80], [1001, 18, 140], [1601, 19, 200], [2001, 19, 200], [2501, 24, 200]], // [배기량 하한, 영업용, 비영업용] cc당
  fixed: [
    ['화물 1톤 이하', 6600, 28500, '비영업용'], ['화물 2톤 이하', 9600, 34500, '비영업용'], ['화물 3톤 이하', 13500, 48000, '비영업용'],
    ['화물 4톤 이하', 18000, 63000, '비영업용'], ['화물 5톤 이하', 22500, 79500, '비영업용'], ['승합 소형일반버스', 25000, 65000, '영업용'],
    ['승합 대형일반버스', 42000, 115000, '영업용'], ['전기 승용', 20000, 100000, '영업용'], ['특수 소형', 13500, 58500, '영업용'], ['삼륜 이하', 3300, 18000, '영업용'],
  ],
  // 견적서 문구
  company: '에이스렌트카', call: '1661-7977',
  insAge: '만 26세 이상',
  insGrades: [GRADE('mid', '소·중형', '400만원'), GRADE('large', '대형', '700만원')],
  insMap: DEFAULT_INS_MAP,
  insNote: '보험 보상 및 면책 조건의 세부 내용은 렌트 계약서 기준으로 적용됩니다.',
  maturity: '반납형',
  guide: '본 견적서는 견적일 기준 차량가격 및 금리로 산출되었으며, 차량 출고 시점의 가격·금리·심사 결과에 따라 변동될 수 있습니다. 월 렌트료에는 자동차세, 보험료가 포함되어 있습니다.',
};

// 사용자 화면에 내려줘도 되는 설정 (견적서 문구 · 기본 탁송료 · 시공비)
export const PUBLIC_CONFIG_KEYS = ['company', 'call', 'insAge', 'insNote', 'maturity', 'guide', 'del1', 'tint', 'bb'];

export async function loadQuoteConfig(db) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'quote_config'").first();
  let saved = {};
  try { saved = row ? JSON.parse(row.value) : {}; } catch { saved = {}; }
  const d = DEFAULT_QUOTE_CONFIG;
  const insGrades = Array.isArray(saved.insGrades) && saved.insGrades.length ? saved.insGrades : d.insGrades;
  return { ...d, ...saved, rv: { ...d.rv, ...(saved.rv || {}) }, insGrades, insMap: { ...d.insMap, ...(saved.insMap || {}) } };
}

// 차종의 보험 조건 (등급이 없거나 지워졌으면 첫 등급)
export function insuranceFor(cfg, mk, cat, model) {
  const id = cfg.insMap[modelKey(mk, cat, model)];
  const g = cfg.insGrades.find((x) => x.id === id) || cfg.insGrades[0] || {};
  return { grade: g.name || '', age: cfg.insAge, ...Object.fromEntries(INS_FIELDS.map(([k]) => [k, g[k] || '-'])) };
}

export function vehicleData() {
  return { T: DATA.T, C: DATA.C };
}

export function residualGroups() {
  return Object.keys(DATA.RV);
}

// ── 엑셀 함수 ─────────────────────────────────────────
const R = (x) => { if (!isFinite(x)) return 0; const s = x < 0 ? -1 : 1; return s * Math.round(Math.abs(x) / 100 + 1e-9) * 100; };
export const num = (v) => {
  if (v === null || v === undefined) return 0;
  const t = String(v).replace(/[,\s원]/g, '');
  if (t === '') return 0;
  const pct = t.endsWith('%');
  const n = parseFloat(pct ? t.slice(0, -1) : t);
  if (!isFinite(n)) return 0;
  return pct ? n / 100 : n;
};
// 1,000 이상 → 금액, 1 이상 → %, 그 외 → 비율
const amountOf = (raw, base, div = 1) => { const v = num(raw); if (v >= 1000) return R(v); if (v >= 1) return R((base * v) / 100 / div); return R((base * v) / div); };
const rateOf = (raw) => { const v = num(raw); return v >= 1 ? v / 100 : v; };
function PMT(r, n, pv, fv, t) { if (r === 0) return -(pv + fv) / n; const q = Math.pow(1 + r, n); return -(r * (fv + pv * q)) / ((1 + r * t) * (q - 1)); }
function RATE(n, pmt, pv, fv, t) {
  const f = (r) => { if (Math.abs(r) < 1e-12) return pv + pmt * n + fv; const q = Math.pow(1 + r, n); return pv * q + (pmt * (1 + r * t) * (q - 1)) / r + fv; };
  let r = 0.01;
  for (let i = 0; i < 100; i++) { const y = f(r), d = (f(r + 1e-7) - y) / 1e-7; if (!isFinite(d) || d === 0) break; const nr = r - y / d; if (Math.abs(nr - r) < 1e-12) { r = nr; break; } r = nr; if (r <= -0.99) break; }
  if (isFinite(r) && Math.abs(f(r)) < 1e-3) return r;
  let lo = -0.0099, hi = 1; if (f(lo) * f(hi) > 0) return NaN;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m; }
  return (lo + hi) / 2;
}

function findTrim(v) {
  if (!v) return null;
  return DATA.T.find((t) => t[0] === v.mk && t[1] === v.cat && t[2] === v.model && t[3] === v.line && t[4] === v.trim) || null;
}

function annualTax(tr, cfg) {
  if (!tr) return 0;
  const cc = tr[6], tax = tr[7];
  if (tax === '승용') {
    if (!(cc > 0)) return 0;
    let row = cfg.cc[0];
    for (const r of cfg.cc) if (cc >= r[0]) row = r;
    const per = cfg.carTax === '비영업용' ? row[2] : row[1];
    return 2 * Math.floor((cc * per) / 2 / 10) * 10;
  }
  const key = tr[8] === '' ? (tax === '전기' ? '전기 승용' : '') : tr[8];
  const f = cfg.fixed.find((x) => x[0] === key);
  if (!f) return 0;
  return f[3] === '비영업용' ? f[2] : f[1];
}

// 입력 정리 (사용자가 보낸 값 중 허용 항목만)
export function cleanInput(b) {
  const s = (v, n = 60) => String(v ?? '').slice(0, n);
  const P = Array.isArray(b.P) ? b.P.slice(0, 3) : [];
  return {
    v: { mk: s(b.v?.mk), cat: s(b.v?.cat), model: s(b.v?.model), line: s(b.v?.line), trim: s(b.v?.trim) },
    opts: Array.isArray(b.opts) ? b.opts.slice(0, 30).map((x) => s(x, 120)) : [],
    ext: s(b.ext), int: s(b.int), extra: s(b.extra, 20),
    del1: s(b.del1, 20), del2: s(b.del2, 20), del3: s(b.del3, 20),
    tint: b.tint === '에이스렌트카 시공' ? '에이스렌트카 시공' : '고객자체시공',
    bb: b.bb === '에이스렌트카 시공' ? '에이스렌트카 시공' : '고객자체시공',
    otherName: s(b.otherName), otherAmt: s(b.otherAmt, 20),
    ctype: s(b.ctype, 20), cname: s(b.cname, 60), mgr: s(b.mgr, 30), tel: s(b.tel, 30), date: s(b.date, 10),
    P: P.map((p) => ({
      on: !!p?.on,
      term: TERMS.includes(+p?.term) ? +p.term : 36,
      km: Math.min(100000, Math.max(5000, Math.round(num(p?.km)) || 30000)),
      pre: s(p?.pre, 20), dep: s(p?.dep, 20), rv: s(p?.rv, 10), ag: s(p?.ag, 20),
    })),
  };
}

// 전체 계산 (관리자 기록용 내부 값 포함)
export function computeQuote(input, cfg) {
  const tr = findTrim(input.v);
  if (!tr) return { ok: false, error: '차량을 트림까지 선택해 주세요.' };
  const base = tr[5];
  const optList = tr[10].filter((o) => input.opts.includes(o[0]));
  const optSum = optList.reduce((a, o) => a + o[1], 0);
  const extra = Math.max(0, num(input.extra));
  const price = base + optSum + extra;
  const del1 = Math.max(0, num(input.del1));
  const tintAmt = (input.tint === '에이스렌트카 시공' ? cfg.tint : 0) + (input.bb === '에이스렌트카 시공' ? cfg.bb : 0);
  const supply = R((price + del1) / 1.1);
  const acq = R((supply * num(cfg.acq)) / 100);
  const plates = num(cfg.plate1) + num(cfg.plate2) + num(cfg.stamp);
  const del23 = R((Math.max(0, num(input.del2)) + Math.max(0, num(input.del3))) / 1.1);
  const inst = R((tintAmt + Math.max(0, num(input.otherAmt))) / 1.1);
  const acqCost = supply + acq + plates + num(cfg.reg) + del23 + num(cfg.bond) + inst;
  const yTax = annualTax(tr, cfg);
  const mTax = R(yTax / 12);
  const rate = rateOf(cfg.rate);
  const ins = Math.max(0, num(cfg.insurance));
  const maint = Math.max(0, num(cfg.maint));
  const rvRow = cfg.rv[tr[9]] || cfg.rvDefault || [];

  const products = input.P.map((p) => {
    const o = { on: p.on, n: p.term, km: p.km };
    // AG 수수료 = 관리자 AG(고정, 비공개) + 사용자 AG(사용자가 렌트료를 맞추려고 직접 넣는 값)
    o.agAdmin = Math.max(0, amountOf(cfg.ag, price, 1.1));
    o.agUser = Math.max(0, amountOf(p.ag, price, 1.1));
    o.ag = o.agAdmin + o.agUser;
    o.invest = acqCost + o.ag;
    o.pre = amountOf(p.pre, price);
    o.pre11 = R(o.pre / 1.1);
    o.dep = amountOf(p.dep, price);
    const tableRv = +rvRow[TERMS.indexOf(o.n)] || 0;
    const kmAdj = tableRv > 0 ? ((num(cfg.rvKm) - o.km) / 5000) * num(cfg.rvAdj) / 100 : 0;
    o.rvMax = tableRv > 0 ? Math.max(0, Math.round((tableRv + kmAdj) * 10000) / 10000) : 0;
    if (!o.rvMax) { o.error = '이 차종은 ' + o.n + '개월 견적을 낼 수 없습니다.'; return o; }
    if (o.pre + o.dep >= price) { o.error = '선납금과 보증금 합계가 차량가격보다 작아야 합니다.'; return o; }
    const want = rateOf(p.rv);
    o.rvCapped = want > o.rvMax;
    o.rv = want > 0 && want <= o.rvMax ? want : o.rvMax;
    o.rvAmt = R((price / 1.1) * o.rv);
    o.rvAmtVat = R(price * o.rv);
    o.fin = R(PMT(rate / 12, o.n, -o.invest + o.pre11 + o.dep, o.rvAmt - o.dep, 0));
    o.tax = mTax; o.ins = ins; o.maint = maint;
    o.supply = o.fin + o.tax + o.ins + o.maint;
    o.vat = R(o.supply * 0.1);
    o.month = o.supply + o.vat;
    o.upfront = o.pre + o.dep;
    o.total = o.month * o.n + o.pre;
    o.irr = RATE(o.n, o.fin, -o.invest + o.pre11 + o.dep, o.rvAmt - o.dep, 0) * 12;
    return o;
  });

  return {
    ok: true,
    vehicle: { mk: tr[0], cat: tr[1], model: tr[2], line: tr[3], trim: tr[4], base, cc: tr[6], tax: tr[7], optList, optSum, extra, price, ins: insuranceFor(cfg, tr[0], tr[1], tr[2]) },
    internal: { rate, ins, maint, ag: cfg.ag, acqCost, acq, yTax, mTax, rvGroup: tr[9] },
    products,
  };
}

// 사용자 화면용: 금리 · 보험료 · 원가 · 자동차세 · IRR 은 빼고 결과 금액만
export function toPublic(r) {
  if (!r.ok) return { ok: false, error: r.error };
  const { tax, ...vehicle } = r.vehicle; // 세금 구분도 회원 화면에는 필요 없음
  return {
    ok: true,
    vehicle,
    products: r.products.map((o) =>
      o.error
        ? { on: o.on, n: o.n, km: o.km, error: o.error }
        : { on: o.on, n: o.n, km: o.km, pre: o.pre, dep: o.dep, agUser: o.agUser, rv: o.rv, rvMax: o.rvMax, rvCapped: o.rvCapped, rvAmtVat: o.rvAmtVat, supply: o.supply, vat: o.vat, month: o.month, upfront: o.upfront, total: o.total }
    ),
  };
}
