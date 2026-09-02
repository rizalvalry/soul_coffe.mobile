import type { Allocation, AllocationLine, AppNotification, CartStockRow, RefillLine, RefillRequest } from '@/domain/types';

/**
 * Wire-shape adapters between the real Laravel API and the flat `domain/types.ts` contract
 * every screen was built against.
 *
 * WHY THIS FILE EXISTS: every screen, and the whole `RefillRequest`/`Allocation` shape, was
 * validated only against `src/features/demo/router.ts`'s in-memory fixtures — this app never
 * had a real backend to run against until now. Comparing the actual Laravel resources
 * (soul_coffe.backend `app/Http/Resources/*.php`) against `domain/types.ts` turned up real
 * differences, not just naming — reconciled here rather than in every screen:
 *
 * 1. `RefillRequestResource` nests relations as objects (`cart: {id, code}`,
 *    `staff: {id, name}`, `finance`/`barista`/`rider: {id, name} | null`); every screen reads
 *    flat strings (`cart_code`, `staff_name`, `finance_name`, ...) — this is what demo mode's
 *    `src/features/demo/router.ts` has always served, so the flat shape is the real contract.
 * 2. `RefillRequestResource` never returns `location_name` at all — a refill request has no
 *    location relation on the backend (only a staff assignment does, and that's a different
 *    endpoint). Mapped to `null`; every render site already has a "lokasi tidak diketahui"
 *    fallback for it, because the demo data has always included cases with a null location.
 * 3. `AllocationResource` never returns `barista_name` (the `barista` relation is never
 *    eager-loaded, and the resource has no key for it even if it were) — mapped to `null`.
 *    `domain/types.ts` documents this as a backend gap, not a client bug.
 * 4. Neither `RefillLineResource` nor `StockRowResource` return a product `unit` — cross-
 *    referenced here against the `/products` cache (see `unitLookup` in
 *    `features/refill/queries.ts`), since that master-data list is the only place the unit
 *    lives.
 * 5. `RefillRequestResource`/`AllocationResource` never compute `total_requested`/`total_qty`
 *    — summed here from `lines`, exactly like `demo/router.ts` already does.
 * 6. `NotificationResource` nests `refill_request_id` inside `payload` instead of at the top
 *    level — extracted here. (Currently inert: no screen calls `useNotifications()` yet.)
 *
 * None of this is guesswork: every gap below was confirmed against the actual PHP resource
 * source in soul_coffe.backend before writing the corresponding fallback.
 */

type UnitLookup = (productId: number) => string;

// ── Refill requests ──────────────────────────────────────────────────────────

type RawRelation = { id: number; name: string } | null;

export type RawRefillLine = {
  id: number;
  product_id: number;
  product_name: string | null;
  qty_requested: number;
  qty_approved: number | null;
  qty_prepared: number | null;
  qty_received: number | null;
  unit_cost?: number;
  line_cost?: number;
};

export type RawRefillRequest = {
  id: number;
  code: string;
  status: RefillRequest['status'];
  operating_date: string;
  cart: { id: number; code: string } | null;
  staff: { id: number; name: string } | null;
  finance: RawRelation;
  barista: RawRelation;
  rider: RawRelation;
  evidence_photo_url: string | null;
  signature_url: string | null;
  signature_method: 'staff_signature' | 'pin_fallback' | null;
  gps_unavailable: boolean;
  out_of_hours: boolean;
  total_cost?: number;
  decision_reason: string | null;
  shortfall_reason: string | null;
  submitted_at: string;
  decided_at: string | null;
  prepared_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  lines: RawRefillLine[];
  can: RefillRequest['can'];
};

function toRefillLine(raw: RawRefillLine, unitOf: UnitLookup): RefillLine {
  return {
    id: raw.id,
    product_id: raw.product_id,
    product_name: raw.product_name ?? '-',
    unit: unitOf(raw.product_id),
    qty_requested: raw.qty_requested,
    qty_approved: raw.qty_approved,
    qty_prepared: raw.qty_prepared,
    qty_received: raw.qty_received,
    ...(raw.unit_cost !== undefined ? { unit_cost: raw.unit_cost } : {}),
    ...(raw.line_cost !== undefined ? { line_cost: raw.line_cost } : {}),
  };
}

export function toRefillRequest(raw: RawRefillRequest, unitOf: UnitLookup): RefillRequest {
  return {
    id: raw.id,
    code: raw.code,
    status: raw.status,
    operating_date: raw.operating_date,
    cart_code: raw.cart?.code ?? '-',
    staff_name: raw.staff?.name ?? '-',
    staff_id: raw.staff?.id ?? 0,
    // Not returned by RefillRequestResource — see file docblock, point 2.
    location_name: null,
    evidence_photo_url: raw.evidence_photo_url,
    gps_unavailable: raw.gps_unavailable,
    out_of_hours: raw.out_of_hours,
    ...(raw.total_cost !== undefined ? { total_cost: raw.total_cost } : {}),
    decision_reason: raw.decision_reason,
    shortfall_reason: raw.shortfall_reason,
    finance_name: raw.finance?.name ?? null,
    barista_name: raw.barista?.name ?? null,
    rider_name: raw.rider?.name ?? null,
    signature_url: raw.signature_url,
    signature_method: raw.signature_method,
    submitted_at: raw.submitted_at,
    decided_at: raw.decided_at,
    prepared_at: raw.prepared_at,
    picked_up_at: raw.picked_up_at,
    delivered_at: raw.delivered_at,
    total_requested: raw.lines.reduce((sum, l) => sum + l.qty_requested, 0),
    lines: raw.lines.map((l) => toRefillLine(l, unitOf)),
    can: raw.can,
  };
}

// ── Allocations ──────────────────────────────────────────────────────────────

export type RawAllocationLine = {
  product_id: number;
  product_name: string | null;
  target_qty: number;
  qty_issued: number;
};

export type RawAllocation = {
  id: number;
  operating_date: string;
  cart_code: string | null;
  staff_name: string | null;
  location_name: string | null;
  status: Allocation['status'];
  is_correction: boolean;
  over_target_pct: number;
  issued_at: string | null;
  lines: RawAllocationLine[];
};

function toAllocationLine(raw: RawAllocationLine): AllocationLine {
  return {
    product_id: raw.product_id,
    product_name: raw.product_name ?? '-',
    target_qty: raw.target_qty,
    qty_issued: raw.qty_issued,
  };
}

export function toAllocation(raw: RawAllocation): Allocation {
  return {
    id: raw.id,
    operating_date: raw.operating_date,
    cart_code: raw.cart_code ?? '-',
    staff_name: raw.staff_name ?? '-',
    location_name: raw.location_name,
    // Not returned by AllocationResource — see file docblock, point 3.
    barista_name: null,
    status: raw.status,
    over_target_pct: raw.over_target_pct,
    total_qty: raw.lines.reduce((sum, l) => sum + l.qty_issued, 0),
    is_correction: raw.is_correction,
    issued_at: raw.issued_at,
    lines: raw.lines.map(toAllocationLine),
  };
}

// ── Stock rows ───────────────────────────────────────────────────────────────

export type RawStockRow = {
  product_id: number;
  product_name: string;
  qty: number;
};

export function toStockRow(raw: RawStockRow, unitOf: UnitLookup): CartStockRow {
  return {
    product_id: raw.product_id,
    product_name: raw.product_name,
    unit: unitOf(raw.product_id),
    on_hand: raw.qty,
  };
}

// ── Notifications ────────────────────────────────────────────────────────────

export type RawAppNotification = {
  id: number;
  event_id: string;
  type: string;
  title: string | null;
  body: string | null;
  payload: { refill_request_id?: number | null } | null;
  read_at: string | null;
  created_at: string;
};

export function toAppNotification(raw: RawAppNotification): AppNotification {
  return {
    id: raw.id,
    event_id: raw.event_id,
    type: raw.type,
    title: raw.title ?? '',
    body: raw.body ?? '',
    refill_request_id: raw.payload?.refill_request_id ?? null,
    read_at: raw.read_at,
    created_at: raw.created_at,
  };
}
