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

// 반환: { counts: Map<model_id, 남은 대수>, vehicles: Map<model_id, 고를 수 있는 차량[]> }
// vehicles 는 ERP 연동일 때만 채워진다 (임시 모드는 차종만 고름)
export async function availableByModel(env, { from, to, locationId }) {
  const db = env.DB;
  const { results: models } = await db.prepare('SELECT id, erp_code FROM short_models WHERE active = 1').all();
  const counts = new Map(models.map((m) => [m.id, 0]));
  const vehicles = new Map(models.map((m) => [m.id, []]));

  if (erpEnabled(env)) {
    // ERP 가 그 기간에 비어 있는 차량 목록을 돌려줌
    const data = await erpFetch(
      env,
      `/api/public/short/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&location=${encodeURIComponent(locationId || '')}`
    );
    const byCode = new Map(models.filter((m) => m.erp_code).map((m) => [m.erp_code, m.id]));
    for (const v of data.vehicles || []) {
      const mid = byCode.get(String(v.model_code));
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
        model_code: model.erp_code,
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
