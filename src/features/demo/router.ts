import { useAuth } from '@/features/auth/store';
import type { DemoAllocation, DemoRefillLine, DemoRefillRequest, RefillStatusValue } from './seed';
import {
  approveRefill,
  cancelRefill,
  claimRefill,
  createAllocation,
  deliverRefill,
  DemoError,
  effectiveLineQty,
  getAllocationById,
  getAssignedLocationName,
  getBadges,
  getCartById,
  getCartStock,
  getKitchenStock,
  getLocationById,
  getMe,
  getMyAllocationToday,
  getProductById,
  getRefillById,
  getUserById,
  listCarts,
  listLocations,
  listNotifications,
  listProducts,
  listRefills,
  listStaffOnShift,
  markNotificationRead,
  markReadyRefill,
  refillCapabilities,
  rejectRefill,
  requireActor,
  startPreparingRefill,
  storeMedia,
  submitRefill,
  withIdempotency,
  type Actor,
} from './store';

/**
 * The offline demo backend's HTTP-shape layer.
 *
 * `lib/api.ts` calls `demoRequest`/`demoUpload` instead of `fetch` when `isDemoMode()` is true.
 * Everything above this file (every hook in `features/refill/queries.ts`, every screen) is
 * unaware demo mode exists — it only ever sees the same request/response shapes docs/04 defines.
 *
 * This file owns two things `store.ts` deliberately does not: matching a `(method, path)` pair to
 * a store operation, and turning internal snake_case-free records into the exact API-contract
 * JSON shapes — including R15's cost-field stripping, which happens here so `store.ts` never has
 * to know which role is asking.
 */

function currentActor(): Actor {
  return requireActor(useAuth.getState().session);
}

function hasCostAccess(actor: Actor): boolean {
  return actor.role === 'ADMINISTRATOR' || actor.role === 'FINANCE';
}

// ── Serializers — internal record → docs/04 JSON shape ──────────────────────────────────────────

function serializeProduct(actor: Actor, p: { id: number; code: string; name: string; unit: string; is_sellable: boolean; sort_order: number; cost_price: number; sell_price: number }) {
  const base = {
    id: p.id,
    code: p.code,
    name: p.name,
    unit: p.unit,
    is_sellable: p.is_sellable,
    sort_order: p.sort_order,
  };
  return hasCostAccess(actor) ? { ...base, cost_price: p.cost_price, sell_price: p.sell_price } : base;
}

function serializeCart(c: { id: number; code: string; plate: string | null; status: string }) {
  return { id: c.id, code: c.code, plate: c.plate, status: c.status };
}

function serializeLocation(l: { id: number; name: string; lat: number; lng: number }) {
  return { id: l.id, name: l.name, lat: l.lat, lng: l.lng };
}

function serializeRefillLine(actor: Actor, line: DemoRefillLine) {
  const product = getProductById(line.productId);
  const base = {
    id: line.id,
    product_id: line.productId,
    product_name: product?.name ?? 'Produk',
    unit: product?.unit ?? 'cup',
    qty_requested: line.qtyRequested,
    qty_approved: line.qtyApproved,
    qty_prepared: line.qtyPrepared,
    qty_received: line.qtyReceived,
  };
  if (!hasCostAccess(actor)) return base;
  return { ...base, unit_cost: line.unitCost, line_cost: effectiveLineQty(line) * line.unitCost };
}

function serializeRefillRequest(actor: Actor, r: DemoRefillRequest) {
  const cart = getCartById(r.cartId);
  const finance = r.financeId !== null ? getUserById(r.financeId) : undefined;
  const barista = r.baristaId !== null ? getUserById(r.baristaId) : undefined;
  const rider = r.riderId !== null ? getUserById(r.riderId) : undefined;

  const base = {
    id: r.id,
    code: r.code,
    status: r.status,
    operating_date: r.operatingDate,
    cart_code: cart?.code ?? '-',
    staff_name: r.staffName,
    staff_id: r.staffId,
    location_name: getAssignedLocationName(r.staffId, r.operatingDate),
    evidence_photo_url: r.evidencePhotoUrl,
    gps_unavailable: r.gpsUnavailable,
    out_of_hours: r.outOfHours,
    decision_reason: r.decisionReason,
    shortfall_reason: r.shortfallReason,
    finance_name: finance?.name ?? null,
    barista_name: barista?.name ?? null,
    rider_name: rider?.name ?? null,
    signature_url: r.signatureUrl,
    signature_method: r.signatureMethod,
    submitted_at: r.submittedAt,
    decided_at: r.decidedAt,
    prepared_at: r.preparedAt,
    picked_up_at: r.pickedUpAt,
    delivered_at: r.deliveredAt,
    total_requested: r.lines.reduce((sum, l) => sum + l.qtyRequested, 0),
    lines: r.lines.map((l) => serializeRefillLine(actor, l)),
    can: refillCapabilities(actor, r),
    // Not part of the `RefillRequest` domain type (the mobile UI derives its timeline from the
    // timestamp fields above — see `components/refill/RefillTimeline.tsx`), but part of the
    // docs/04 contract for `GET /refills/{id}` and kept for parity/audit (R8).
    status_history: r.statusHistory.map((h) => ({
      from_status: h.fromStatus,
      to_status: h.toStatus,
      actor_name: h.actorName,
      actor_role: h.actorRole,
      reason: h.reason,
      at: h.at,
    })),
  };

  if (!hasCostAccess(actor)) return base;
  const totalCost = r.lines.reduce((sum, l) => sum + effectiveLineQty(l) * l.unitCost, 0);
  return { ...base, total_cost: totalCost };
}

function serializeAllocation(a: DemoAllocation) {
  const cart = getCartById(a.cartId);
  const staff = getUserById(a.staffId);
  const barista = getUserById(a.baristaId);
  const location = a.locationId !== null ? getLocationById(a.locationId) : undefined;
  return {
    id: a.id,
    operating_date: a.operatingDate,
    cart_code: cart?.code ?? '-',
    staff_name: staff?.name ?? '-',
    location_name: location?.name ?? null,
    barista_name: barista?.name ?? '-',
    status: a.status,
    over_target_pct: a.overTargetPct,
    total_qty: a.lines.reduce((sum, l) => sum + l.qtyIssued, 0),
    is_correction: a.isCorrection,
    issued_at: a.issuedAt,
    lines: a.lines.map((l) => ({
      product_id: l.productId,
      product_name: getProductById(l.productId)?.name ?? '-',
      target_qty: l.targetQty,
      qty_issued: l.qtyIssued,
    })),
  };
}

function serializeStockRow(row: { productId: number; onHand: number }) {
  const product = getProductById(row.productId);
  return {
    product_id: row.productId,
    product_name: product?.name ?? '-',
    unit: product?.unit ?? 'cup',
    on_hand: row.onHand,
  };
}

function serializeNotification(n: {
  id: number;
  eventId: string;
  type: string;
  title: string;
  body: string;
  refillRequestId: number | null;
  readAt: string | null;
  createdAt: string;
}) {
  return {
    id: n.id,
    event_id: n.eventId,
    type: n.type,
    title: n.title,
    body: n.body,
    refill_request_id: n.refillRequestId,
    read_at: n.readAt,
    created_at: n.createdAt,
  };
}

// ── Query-string parsing (no dependency on URLSearchParams) ─────────────────────────────────────

function splitPath(path: string): { base: string; query: Record<string, string> } {
  const [base, qs] = path.split('?');
  const query: Record<string, string> = {};
  if (qs) {
    for (const pair of qs.split('&')) {
      if (!pair) continue;
      const [key, value = ''] = pair.split('=');
      if (key) query[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  }
  return { base: base ?? path, query };
}

function parseStatusParam(raw: string | undefined): RefillStatusValue[] | null {
  if (!raw) return null;
  return raw.split(',').filter(Boolean) as RefillStatusValue[];
}

// ── GET dispatch ─────────────────────────────────────────────────────────────────────────────────

function handleGet(base: string, query: Record<string, string>, actor: Actor): unknown {
  if (base === '/products') return listProducts().map((p) => serializeProduct(actor, p));
  if (base === '/carts') return listCarts().map(serializeCart);
  if (base === '/locations') return listLocations().map(serializeLocation);

  if (base === '/me') {
    const { user, todayLocationName } = getMe(actor);
    return {
      id: String(user.id),
      name: user.name,
      role: user.role,
      cart_code: user.cartCode ?? null,
      cart_id: user.cartId ?? null,
      kitchen_name: user.kitchenName ?? null,
      kitchen_id: user.kitchenId ?? null,
      today_location_name: todayLocationName,
    };
  }

  if (base === '/badges') return getBadges(actor);

  if (base === '/notifications') {
    return listNotifications(actor, query['unread'] === '1').map(serializeNotification);
  }

  if (base === '/refills') {
    return listRefills(actor, parseStatusParam(query['status'])).map((r) => serializeRefillRequest(actor, r));
  }

  const refillMatch = /^\/refills\/(\d+)$/.exec(base);
  if (refillMatch) {
    const id = Number(refillMatch[1]);
    return serializeRefillRequest(actor, getRefillById(actor, id));
  }

  if (base === '/allocations/today') {
    return listStaffOnShift().map((row) => ({
      staff_id: row.staffId,
      staff_name: row.staffName,
      cart_id: row.cartId,
      cart_code: row.cartCode,
      location_id: row.locationId,
      location_name: row.locationName,
      has_allocation: row.hasAllocation,
      targets: row.targets.map((t) => ({ product_id: t.productId, target_qty: t.targetQty })),
    }));
  }

  const allocationMatch = /^\/allocations\/(\d+)$/.exec(base);
  if (allocationMatch) {
    const allocation = getAllocationById(Number(allocationMatch[1]));
    if (!allocation) throw new DemoError('Alokasi tidak ditemukan.', 404);
    return serializeAllocation(allocation);
  }

  if (base === '/me/allocation/today') {
    const allocation = getMyAllocationToday(actor);
    return allocation ? serializeAllocation(allocation) : null;
  }

  if (base === '/me/stock') {
    if (!actor.cartId) return [];
    return getCartStock(actor.cartId).map(serializeStockRow);
  }

  if (base === '/kitchen/stock') {
    if (!actor.kitchenId) return [];
    return getKitchenStock(actor.kitchenId).map(serializeStockRow);
  }

  throw new DemoError(`Endpoint demo tidak dikenal: GET ${base}`, 404);
}

// ── POST dispatch ────────────────────────────────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function handlePost(base: string, body: unknown, actor: Actor): { data: unknown; status: number } {
  if (base === '/auth/logout') return { data: null, status: 204 };

  if (base === '/refills') {
    const b = (body ?? {}) as JsonRecord;
    const lines = (Array.isArray(b['lines']) ? b['lines'] : []) as JsonRecord[];
    const refill = submitRefill(actor, {
      uuid: String(b['uuid'] ?? ''),
      cartId: asNumber(b['cart_id']),
      evidenceMediaId: asNumber(b['evidence_media_id']),
      gpsLat: typeof b['gps_lat'] === 'number' ? b['gps_lat'] : null,
      gpsLng: typeof b['gps_lng'] === 'number' ? b['gps_lng'] : null,
      gpsUnavailable: b['gps_unavailable'] === true,
      lines: lines.map((l) => ({ productId: asNumber(l['product_id']), qtyRequested: asNumber(l['qty_requested']) })),
    });
    return { data: serializeRefillRequest(actor, refill), status: 201 };
  }

  if (base === '/allocations') {
    const b = (body ?? {}) as JsonRecord;
    const lines = (Array.isArray(b['lines']) ? b['lines'] : []) as JsonRecord[];
    const allocation = createAllocation(actor, {
      operatingDate: String(b['operating_date'] ?? ''),
      cartId: asNumber(b['cart_id']),
      staffId: asNumber(b['staff_id']),
      locationId: typeof b['location_id'] === 'number' ? b['location_id'] : null,
      lines: lines.map((l) => ({ productId: asNumber(l['product_id']), qtyIssued: asNumber(l['qty_issued']) })),
      correctionReason: typeof b['correction_reason'] === 'string' ? b['correction_reason'] : undefined,
    });
    return { data: serializeAllocation(allocation), status: 201 };
  }

  const notifRead = /^\/notifications\/(\d+)\/read$/.exec(base);
  if (notifRead) {
    markNotificationRead(actor, Number(notifRead[1]));
    return { data: null, status: 204 };
  }

  const transitionMatch = /^\/refills\/(\d+)\/([a-z-]+)$/.exec(base);
  if (transitionMatch) {
    const id = Number(transitionMatch[1]);
    const action = transitionMatch[2];
    const b = (body ?? {}) as JsonRecord;

    if (action === 'approve') {
      const lines = (Array.isArray(b['lines']) ? b['lines'] : []) as JsonRecord[];
      const refill = approveRefill(actor, id, {
        lines: lines.map((l) => ({ lineId: asNumber(l['line_id']), qtyApproved: asNumber(l['qty_approved']) })),
        partialReason: typeof b['partial_reason'] === 'string' ? b['partial_reason'] : undefined,
      });
      return { data: serializeRefillRequest(actor, refill), status: 200 };
    }

    if (action === 'reject') {
      const refill = rejectRefill(actor, id, String(b['reason'] ?? ''));
      return { data: serializeRefillRequest(actor, refill), status: 200 };
    }

    if (action === 'cancel') {
      const refill = cancelRefill(actor, id);
      return { data: serializeRefillRequest(actor, refill), status: 200 };
    }

    if (action === 'start-preparing') {
      const refill = startPreparingRefill(actor, id);
      return { data: serializeRefillRequest(actor, refill), status: 200 };
    }

    if (action === 'ready') {
      const lines = (Array.isArray(b['lines']) ? b['lines'] : []) as JsonRecord[];
      const refill = markReadyRefill(actor, id, {
        lines: lines.map((l) => ({ lineId: asNumber(l['line_id']), qtyPrepared: asNumber(l['qty_prepared']) })),
        shortfallReason: typeof b['shortfall_reason'] === 'string' ? b['shortfall_reason'] : undefined,
      });
      return { data: serializeRefillRequest(actor, refill), status: 200 };
    }

    if (action === 'claim') {
      const refill = claimRefill(actor, id);
      return { data: serializeRefillRequest(actor, refill), status: 200 };
    }
  }

  throw new DemoError(`Endpoint demo tidak dikenal: POST ${base}`, 404);
}

// ── Public entry points — called from lib/api.ts ────────────────────────────────────────────────

/** Stands in for `fetch` inside `request()`. Synchronous under the hood (everything here is an
 * in-memory array), returned through a promise so callers do not need to know that. */
export async function demoRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body: unknown,
  idempotencyKey: string | undefined,
): Promise<T> {
  const actor = currentActor();
  const { base, query } = splitPath(path);

  if (method === 'GET') {
    return handleGet(base, query, actor) as T;
  }

  if (method === 'POST') {
    const result = withIdempotency(idempotencyKey, () => handlePost(base, body, actor));
    return result.data as T;
  }

  throw new DemoError(`Metode demo tidak didukung: ${method} ${base}`, 405);
}

export type DemoUploadResult<T> = { data: T; status: number };

/** Stands in for the multipart `fetch` inside `uploadFileWithStatus()`. `fields` arrives exactly
 * as `FormData` would have carried it — every value a string — because that is what the two real
 * callers (`/media/evidence`, `/refills/{id}/deliver`) actually send. */
export async function demoUpload<T>(
  path: string,
  file: { uri: string; name: string; type: string },
  fields: Record<string, string>,
): Promise<DemoUploadResult<T>> {
  const actor = currentActor();
  const { base } = splitPath(path);

  if (base === '/media/evidence') {
    const media = storeMedia(file.uri);
    return { data: { id: media.id, url: media.url, sha256: media.sha256 } as T, status: 201 };
  }

  const deliverMatch = /^\/refills\/(\d+)\/deliver$/.exec(base);
  if (deliverMatch) {
    const id = Number(deliverMatch[1]);
    const method = fields['signature_method'] === 'pin_fallback' ? 'pin_fallback' : 'staff_signature';
    let lines: { lineId: number; qtyReceived: number }[] = [];
    try {
      const parsed = JSON.parse(fields['lines'] ?? '[]') as JsonRecord[];
      lines = parsed.map((l) => ({ lineId: asNumber(l['line_id']), qtyReceived: asNumber(l['qty_received']) }));
    } catch {
      throw new DemoError('Data pengiriman tidak valid.', 422);
    }

    const refill = deliverRefill(actor, id, {
      signatureUri: file.uri,
      strokeCount: Number(fields['stroke_count'] ?? '0'),
      method,
      staffPin: fields['staff_pin'],
      lines,
      gpsLat: fields['gps_lat'] ? Number(fields['gps_lat']) : null,
      gpsLng: fields['gps_lng'] ? Number(fields['gps_lng']) : null,
      gpsUnavailable: fields['gps_unavailable'] === '1',
    });
    return { data: serializeRefillRequest(actor, refill) as T, status: 200 };
  }

  throw new DemoError(`Endpoint upload demo tidak dikenal: ${base}`, 404);
}

