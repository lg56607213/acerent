// rentcarerp.com 연동
// ERP_API_BASE 가 설정되면 ERP 에서 '해당 기간 배차 없는 단기 차량'을 받아오고,
// 비어 있으면 관리자 화면의 '단기 차량(임시)' 목록으로 계산합니다.
// ERP 쪽에 필요한 API 명세: docs/rentcarerp-api.md

const ACTIVE_RES = `('pending','confirmed')`;

function erpEnabled(env) {
  return !!(env.ERP_API_BASE && env.ERP_API_BASE.trim());
}

async function erpFetch(env, path, init = {}) {
  const url = env.ERP_API_BASE.replace(/\/$/, '') + path;
  const res = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${env.ERP_API_KEY || ''}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`rentcarerp 응답 오류 ${res.status}`);
  return res.json();
}

const isHybrid = (f) => /하이브리드|hybrid|hev/i.test(String(f || ''));
const normPlate = (p) => String(p || '').replace(/s+/g, '');
// 홈페이지 전용 하이브리드 차종코드: ERP 차종코드 뒤에 _HEV (예: K5 → K5_HEV)
//   ERP 는 가솔린 · 하이브리드를 같은 차종코드로 보내므로, 차량 연료를 확인해 하이브리드는 _HEV 차종에 담는다
const HEV = '_HEV';
// 6인승 차종코드: ERP 차종코드 뒤에 _6S (예: SORENTO → SORENTO_6S). 하이브리드와 같이 쓰면 _6S_HEV 순서
const SIX = '_6S';
const baseCode = (code) => String(code || '').replace(/(_6S)?(_HEV)?$/, '');

// 차량별 연료 · 인승 확인: ERP 응답 값 → 차종명(model_name) → ERP 차량 정보(/api/public/vehicles, D1 에 7일 보관)
async function vehicleInfo(env, list) {
  const out = new Map();
  const ask = [];
  for (const v of list) {
    const id = String(v.id);
    const fuel = v.fuel || (isHybrid(v.model_name) ? '하이브리드' : '');
    const seats = parseInt(v.seats, 10) || (/6s*인승/.test(v.model_name || '') ? 6 : 0);
    if (fuel && seats) out.set(id, { fuel, seats });
    else ask.push(v);
  }
  if (!ask.length) return out;
  const { results: cached } = await env.DB.prepare(
    `SELECT vehicle_id, fuel, seats, checked_at FROM erp_vehicle_fuel WHERE vehicle_id IN (${ask.map(() => '?').join(',')})`
  ).bind(...ask.map((v) => String(v.id))).all();
  const now = Date.now();
  const fresh = new Map(
    cached
      .filter((c) => c.seats !== null && now - Date.parse(c.checked_at.replace(' ', 'T') + 'Z') < (c.fuel ? 7 : 1) * 86400000)
      .map((c) => [c.vehicle_id, { fuel: c.fuel, seats: c.seats }])
  );
  const miss = ask.filter((v) => !fresh.has(String(v.id)));
  for (const [id, f] of fresh) out.set(id, f);
  await Promise.all(
    miss.slice(0, 30).map(async (v) => {
      const id = String(v.id);
      try {
        const r = await erpFetch(env, `/api/public/vehicles?q=${encodeURIComponent(v.plate || id)}`);
        const hit = (r.vehicles || []).find((x) => String(x.id) === id || normPlate(x.plate) === normPlate(v.plate));
        const fuel = hit ? hit.fuel || (isHybrid(hit.name) ? '하이브리드' : '') : '';
        const seats = hit ? parseInt(hit.seats, 10) || (/6s*인승/.test(hit.name || '') ? 6 : 0) : 0;
        out.set(id, { fuel, seats });
        await env.DB.prepare(
          `INSERT INTO erp_vehicle_fuel (vehicle_id, plate, fuel, seats, name, checked_at) VALUES (?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(vehicle_id) DO UPDATE SET plate = excluded.plate, fuel = excluded.fuel, seats = excluded.seats, name = excluded.name, checked_at = excluded.checked_at`
        ).bind(id, v.plate || '', fuel, seats, hit ? String(hit.name || '') : '').run();
      } catch {}
    })
  );
  return out;
}

// 반환: { counts: Map<model_id, 남은 대수>, vehicles: Map<model_id, 고를 수 있는 차량[]> }
// vehicles 는 ERP 연동일 때만 채워진다 (임시 모드는 차종만 고름)
export async function availableByModel(env, { from, to, locationId }) {
  const db = env.DB;
  const { results: models } = await db.prepare('SELECT id, erp_code, fuel FROM short_models WHERE active = 1 ORDER BY sort, id').all();
  const counts = new Map(models.map((m) => [m.id, 0]));
  const vehicles = new Map(models.map((m) => [m.id, []]));

  if (erpEnabled(env)) {
    // ERP 가 그 기간에 비어 있는 차량 목록을 돌려줌
    const data = await erpFetch(
      env,
      `/api/public/short/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&location=${encodeURIComponent(locationId || '')}`
    );
    const byCode = new Map(models.filter((m) => m.erp_code).map((m) => [m.erp_code, m.id]));
    // 같은 ERP 차종코드라도 홈페이지에 6인승(_6S) · 하이브리드(_HEV) 차종이 따로 있으면 차량 정보로 나눔
    const split = (c) => byCode.has(c + SIX) || byCode.has(c + HEV) || byCode.has(c + SIX + HEV);
    // 관리자 '단기 차량 예외' : 차량번호별 인승 지정 · 단기 목록에서 숨김(장기로 나간 차 등)
    const { results: rules } = await db.prepare('SELECT plate, seats, hidden FROM erp_vehicle_rules WHERE active = 1').all().catch(() => ({ results: [] }));
    const rule = new Map(rules.map((r) => [normPlate(r.plate), r]));
    const shown = (data.vehicles || []).filter((v) => !(rule.get(normPlate(v.plate)) || {}).hidden);
    const info = await vehicleInfo(env, shown.filter((v) => split(String(v.model_code)))).catch(() => new Map());
    for (const v of shown) {
      let code = String(v.model_code);
      const vi = { ...(info.get(String(v.id)) || {}) };
      const ru = rule.get(normPlate(v.plate));
      if (ru && ru.seats > 0) vi.seats = ru.seats;
      if (vi.seats === 6 && (byCode.has(code + SIX) || byCode.has(code + SIX + HEV))) code += SIX;
      if (byCode.has(code + HEV) && isHybrid(vi.fuel)) code += HEV;
      const mid = byCode.get(code);
      if (mid) vehicles.get(mid).push({ id: String(v.id), plate: v.plate, color: v.color || '', mileage: v.mileage || null, year: v.year || null });
    }
    // 아직 ERP 에 반영되지 않은 홈페이지 예약: 고른 차량은 그 차를, 아니면 그 차종에서 한 대를 뺀다
    const { results: pend } = await db
      .prepare(
        `SELECT model_id, erp_vehicle_id FROM reservations WHERE status IN ${ACTIVE_RES} AND erp_synced = 0 AND pickup_at < ? AND return_at > ?`
      )
      .bind(to, from)
      .all();
    for (const p of pend) {
      const list = vehicles.get(p.model_id);
      if (!list || !list.length) continue;
      const i = p.erp_vehicle_id ? list.findIndex((v) => v.id === p.erp_vehicle_id) : list.length - 1;
      if (i >= 0) list.splice(i, 1);
    }
    for (const [mid, list] of vehicles) counts.set(mid, list.length);
    return { counts, vehicles };
  }

  // 임시 모드: 등록된 단기 차량 수 - 기간이 겹치는 예약 수
  const { results: fleet } = await db
    .prepare('SELECT model_id, COUNT(*) AS n FROM short_vehicles WHERE active = 1 GROUP BY model_id')
    .all();
  for (const f of fleet) if (counts.has(f.model_id)) counts.set(f.model_id, f.n);
  const { results: busy } = await db
    .prepare(
      `SELECT model_id, COUNT(*) AS n FROM reservations WHERE status IN ${ACTIVE_RES} AND pickup_at < ? AND return_at > ? GROUP BY model_id`
    )
    .bind(to, from)
    .all();
  for (const b of busy) if (counts.has(b.model_id)) counts.set(b.model_id, Math.max(0, counts.get(b.model_id) - b.n));
  return { counts, vehicles };
}

// 홈페이지 예약을 ERP 에 '가예약'으로 전달 (실패해도 예약은 접수됨)
export async function pushHold(env, reservation, model) {
  if (!erpEnabled(env)) return false;
  try {
    const hold = await erpFetch(env, '/api/public/short/holds', {
      method: 'POST',
      body: JSON.stringify({
        no: reservation.no,
        model_code: baseCode(model.erp_code),
        fuel: model.fuel || undefined,
        pickup_at: reservation.pickup_at,
        return_at: reservation.return_at,
        vehicle_id: reservation.erp_vehicle_id || undefined,
        location: reservation.location_name,
        name: reservation.name,
        phone: reservation.phone,
      }),
    });
    // ERP 가 잡은 차량번호(외장색상)를 '배정 차량'에 넣는다 (관리자가 이미 적어 둔 값은 그대로)
    const vehicle = hold?.plate ? (hold.color ? `${hold.plate} (${hold.color})` : hold.plate) : '';
    await env.DB.prepare(
      `UPDATE reservations SET erp_synced = 1, vehicle_ref = CASE WHEN vehicle_ref = '' THEN ? ELSE vehicle_ref END WHERE no = ?`
    )
      .bind(vehicle, reservation.no)
      .run();
    return true;
  } catch {
    return false;
  }
}

// 중장기 차량 등록 시 ERP 차량 정보 자동 채우기
export async function searchErpVehicles(env, q) {
  if (!erpEnabled(env)) return { enabled: false, vehicles: [] };
  const data = await erpFetch(env, `/api/public/vehicles?q=${encodeURIComponent(q || '')}`);
  return { enabled: true, vehicles: data.vehicles || [] };
}
