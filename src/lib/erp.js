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

// 반환: Map<model_id, 남은 대수>
export async function availableByModel(env, { from, to, locationId }) {
  const db = env.DB;
  const { results: models } = await db.prepare('SELECT id, erp_code FROM short_models WHERE active = 1').all();
  const counts = new Map(models.map((m) => [m.id, 0]));

  if (erpEnabled(env)) {
    // ERP 가 그 기간에 비어 있는 차량 목록을 돌려줌
    const data = await erpFetch(
      env,
      `/api/public/short/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&location=${encodeURIComponent(locationId || '')}`
    );
    const byCode = new Map(models.filter((m) => m.erp_code).map((m) => [m.erp_code, m.id]));
    for (const v of data.vehicles || []) {
      const mid = byCode.get(String(v.model_code));
      if (mid) counts.set(mid, counts.get(mid) + 1);
    }
    // 아직 ERP 에 반영되지 않은 홈페이지 예약만큼 빼기
    const { results: pend } = await db
      .prepare(
        `SELECT model_id, COUNT(*) AS n FROM reservations WHERE status IN ${ACTIVE_RES} AND erp_synced = 0 AND pickup_at < ? AND return_at > ? GROUP BY model_id`
      )
      .bind(to, from)
      .all();
    for (const p of pend) if (counts.has(p.model_id)) counts.set(p.model_id, Math.max(0, counts.get(p.model_id) - p.n));
    return counts;
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
  return counts;
}

// 홈페이지 예약을 ERP 에 '가예약'으로 전달 (실패해도 예약은 접수됨)
export async function pushHold(env, reservation, model) {
  if (!erpEnabled(env)) return false;
  try {
    await erpFetch(env, '/api/public/short/holds', {
      method: 'POST',
      body: JSON.stringify({
        no: reservation.no,
        model_code: model.erp_code,
        pickup_at: reservation.pickup_at,
        return_at: reservation.return_at,
        location: reservation.location_name,
        name: reservation.name,
        phone: reservation.phone,
      }),
    });
    await env.DB.prepare('UPDATE reservations SET erp_synced = 1 WHERE no = ?').bind(reservation.no).run();
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
