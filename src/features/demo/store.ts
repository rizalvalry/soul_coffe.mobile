import type { Role } from '@/domain/roles';
import {
  buildDailyTargets,
  buildSeed,
  buildStaffAssignments,
  CARTS,
  KITCHEN,
  LOCATIONS,
  PLACEHOLDER_IMAGE_DATA_URI,
  PRODUCTS,
  todayOperatingDate,
  USERS,
  type DemoAllocation,
  type DemoCart,
  type DemoDailyTarget,
  type DemoLocation,
  type DemoNotification,
  type DemoProduct,
  type DemoRefillRequest,
  type DemoStaffAssignment,
  type DemoStockEntry,
  type DemoUser,
  type RefillStatusValue,
} from './seed';

/** Thrown by every guard in this file. `lib/api.ts` catches this in demo mode and rewraps it as
 * the real `ApiError` the rest of the app already knows how to handle — kept independent of
 * `lib/api.ts` so this module never imports back into it (no import cycle). */
export class DemoError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'DemoError';
  }
}

/** The authenticated identity a call is being made as — derived from `useAuth`'s session by
 * `router.ts` and threaded through every store function so scoping and `can` flags are always
 * evaluated for a specific actor, exactly like the real server would. */
export type Actor = {
  id: number;
  name: string;
  role: Role;
  cartId?: number;
  kitchenId?: number;
};

// ── Mutable state — the whole point of this file ────────────────────────────────────────────────
//
// One module-level object, shared by every screen in the running app. That sharing is what makes
// switching identity via the DemoBanner instantly visible everywhere else — see config.ts for why
// this must never be read as evidence of cross-device realtime.

const seed = buildSeed();

const state = {
  products: PRODUCTS.map((p) => ({ ...p })) as DemoProduct[],
  carts: CARTS.map((c) => ({ ...c })) as DemoCart[],
  locations: LOCATIONS.map((l) => ({ ...l })) as DemoLocation[],
  kitchen: { ...KITCHEN },
  users: USERS.map((u) => ({ ...u })) as DemoUser[],
  dailyTargets: buildDailyTargets() as DemoDailyTarget[],
  staffAssignments: buildStaffAssignments() as DemoStaffAssignment[],
  stockLedger: seed.stockLedger as DemoStockEntry[],
  allocations: seed.allocations as DemoAllocation[],
  refillRequests: seed.refillRequests as DemoRefillRequest[],
  notifications: seed.notifications as DemoNotification[],
  idempotency: new Map<string, unknown>(),
  nextIds: { ...seed.nextIds },
};

function nextId(key: keyof typeof state.nextIds): number {
  const id = state.nextIds[key];
  state.nextIds[key] += 1;
  return id;
}

// ── Idempotency replay (R12) ────────────────────────────────────────────────────────────────────

/** Runs `fn` once per `idempotencyKey`; a repeat call with the same key replays the first result
 * instead of re-executing the side effect. Failures are not cached — only a completed transition
 * is safe to replay verbatim. */
export function withIdempotency<T>(idempotencyKey: string | undefined, fn: () => T): T {
  if (!idempotencyKey) return fn();
  if (state.idempotency.has(idempotencyKey)) {
    return state.idempotency.get(idempotencyKey) as T;
  }
  const result = fn();
  state.idempotency.set(idempotencyKey, result);
  return result;
}

// ── Lookups ──────────────────────────────────────────────────────────────────────────────────────

export function findUserByCredentials(phone: string, password: string): DemoUser | null {
  return state.users.find((u) => u.phone === phone && u.password === password) ?? null;
}

export function getUserByRole(role: Role): DemoUser {
  const user = state.users.find((u) => u.role === role);
  if (!user) throw new DemoError(`Tidak ada pengguna demo untuk role ${role}.`, 500);
  return user;
}

function getProduct(id: number): DemoProduct | undefined {
  return state.products.find((p) => p.id === id);
}

function getCart(id: number): DemoCart | undefined {
  return state.carts.find((c) => c.id === id);
}

function staffNameFor(refill: DemoRefillRequest): string {
  return refill.staffName;
}

/** The cart a STAFF actor is assigned to today, or `undefined` if they have none (R11). */
function assignedCartToday(userId: number): DemoStaffAssignment | undefined {
  const today = todayOperatingDate();
  return state.staffAssignments.find((a) => a.userId === userId && a.operatingDate === today);
}

// ── Stock projection (R6 — append-only ledger, never a mutable counter) ────────────────────────

function onHand(locationType: 'kitchen' | 'cart', locationId: number, productId: number): number {
  return state.stockLedger
    .filter((e) => e.locationType === locationType && e.locationId === locationId && e.productId === productId)
    .reduce((sum, e) => sum + e.qtyDelta, 0);
}

function postLedgerPair(args: {
  productId: number;
  qty: number;
  kitchenId: number;
  cartId: number;
  movementOut: DemoStockEntry['movementType'];
  movementIn: DemoStockEntry['movementType'];
  refType: string;
  refId: number;
  actorId: number;
}) {
  const at = new Date().toISOString();
  state.stockLedger.push({
    id: nextId('stockLedger'),
    locationType: 'kitchen',
    locationId: args.kitchenId,
    productId: args.productId,
    movementType: args.movementOut,
    qtyDelta: -args.qty,
    refType: args.refType,
    refId: args.refId,
    actorId: args.actorId,
    createdAt: at,
  });
  state.stockLedger.push({
    id: nextId('stockLedger'),
    locationType: 'cart',
    locationId: args.cartId,
    productId: args.productId,
    movementType: args.movementIn,
    qtyDelta: args.qty,
    refType: args.refType,
    refId: args.refId,
    actorId: args.actorId,
    createdAt: at,
  });
}

export function getCartStock(cartId: number): { productId: number; onHand: number }[] {
  return state.products
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({ productId: p.id, onHand: onHand('cart', cartId, p.id) }));
}

export function getKitchenStock(kitchenId: number): { productId: number; onHand: number }[] {
  return state.products
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({ productId: p.id, onHand: onHand('kitchen', kitchenId, p.id) }));
}

// ── Read models ──────────────────────────────────────────────────────────────────────────────────

export function listProducts(): DemoProduct[] {
  return state.products.slice().sort((a, b) => a.sort_order - b.sort_order);
}

export function listCarts(): DemoCart[] {
  return state.carts.slice();
}

export function listLocations(): DemoLocation[] {
  return state.locations.slice();
}

export function getMe(actor: Actor): { user: DemoUser; todayLocationName: string | null } {
  const user = state.users.find((u) => u.id === actor.id);
  if (!user) throw new DemoError('Sesi tidak valid.', 401);
  const assignment = assignedCartToday(actor.id);
  const location = assignment ? state.locations.find((l) => l.id === assignment.locationId) : undefined;
  return { user, todayLocationName: location?.name ?? null };
}

export function listStaffOnShift(): {
  staffId: number;
  staffName: string;
  cartId: number;
  cartCode: string;
  locationId: number | null;
  locationName: string | null;
  hasAllocation: boolean;
  targets: { productId: number; targetQty: number }[];
}[] {
  const today = todayOperatingDate();
  return state.staffAssignments
    .filter((a) => a.operatingDate === today)
    .map((a) => {
      const user = state.users.find((u) => u.id === a.userId);
      const cart = getCart(a.cartId);
      const location = state.locations.find((l) => l.id === a.locationId);
      const hasAllocation = state.allocations.some((al) => al.cartId === a.cartId && al.operatingDate === today);
      const targets = state.dailyTargets
        .filter((t) => t.cartId === a.cartId)
        .map((t) => ({ productId: t.productId, targetQty: t.targetQty }));
      return {
        staffId: a.userId,
        staffName: user?.name ?? 'Staff',
        cartId: a.cartId,
        cartCode: cart?.code ?? '-',
        locationId: location?.id ?? null,
        locationName: location?.name ?? null,
        hasAllocation,
        targets,
      };
    });
}

export function getMyAllocationToday(actor: Actor): DemoAllocation | null {
  const assignment = assignedCartToday(actor.id);
  if (!assignment) return null;
  const today = todayOperatingDate();
  // Most recent row wins — a correction (E20) supersedes the original for display purposes.
  const rows = state.allocations
    .filter((a) => a.cartId === assignment.cartId && a.operatingDate === today)
    .sort((a, b) => a.id - b.id);
  return rows.length > 0 ? rows[rows.length - 1]! : null;
}

export function getAllocationById(id: number): DemoAllocation | undefined {
  return state.allocations.find((a) => a.id === id);
}

// ── Notifications & badges ──────────────────────────────────────────────────────────────────────

function notify(
  recipients: { userId?: number; role?: Role }[],
  args: { type: string; title: string; body: string; refillRequestId: number | null },
) {
  const at = new Date().toISOString();
  for (const r of recipients) {
    state.notifications.push({
      id: nextId('notification'),
      eventId: `evt-${state.nextIds.notification}-${Date.now()}`,
      type: args.type,
      title: args.title,
      body: args.body,
      refillRequestId: args.refillRequestId,
      readAt: null,
      createdAt: at,
      recipientUserId: r.userId ?? null,
      recipientRole: r.role ?? null,
    });
  }
}

export function listNotifications(actor: Actor, unreadOnly: boolean): DemoNotification[] {
  return state.notifications
    .filter((n) => n.recipientUserId === actor.id || n.recipientRole === actor.role)
    .filter((n) => !unreadOnly || n.readAt === null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function markNotificationRead(actor: Actor, id: number): void {
  const n = state.notifications.find((row) => row.id === id);
  if (!n) throw new DemoError('Notifikasi tidak ditemukan.', 404);
  if (n.recipientUserId !== null && n.recipientUserId !== actor.id) {
    throw new DemoError('Anda tidak memiliki akses untuk tindakan ini.', 403);
  }
  n.readAt = new Date().toISOString();
}

export function getBadges(actor: Actor): {
  pendingApprovals: number;
  incomingRequests: number;
  readyToPick: number;
  myRequests: number;
} {
  const counts = { pendingApprovals: 0, incomingRequests: 0, readyToPick: 0, myRequests: 0 };
  const OPEN: RefillStatusValue[] = ['SUBMITTED', 'APPROVED', 'PREPARING', 'READY_TO_PICK', 'PICKED_UP'];

  if (actor.role === 'FINANCE') {
    counts.pendingApprovals = state.refillRequests.filter((r) => r.status === 'SUBMITTED').length;
  } else if (actor.role === 'BARISTA') {
    counts.incomingRequests = state.refillRequests.filter(
      (r) => r.status === 'SUBMITTED' && r.kitchenId === actor.kitchenId,
    ).length;
  } else if (actor.role === 'RIDER') {
    counts.readyToPick = state.refillRequests.filter((r) => r.status === 'READY_TO_PICK').length;
  } else if (actor.role === 'STAFF') {
    counts.myRequests = state.refillRequests.filter((r) => r.staffId === actor.id && OPEN.includes(r.status)).length;
  }
  return counts;
}

// ── Refill visibility & `can` flags — §2.1/§2.2 scoping, R1/R2/E2 guards ────────────────────────
//
// The SAME functions gate both what a GET returns (`can.*` flags, list visibility) and what a
// POST is allowed to do. One definition, so a request can never be actionable over the API while
// the UI thinks it is read-only, or vice versa.

function isVisibleTo(actor: Actor, refill: DemoRefillRequest): boolean {
  switch (actor.role) {
    case 'ADMINISTRATOR':
    case 'FINANCE':
      return true;
    case 'BARISTA':
      return refill.kitchenId === actor.kitchenId;
    case 'RIDER':
      return refill.status === 'READY_TO_PICK' || refill.riderId === actor.id;
    case 'STAFF':
      return refill.staffId === actor.id;
    default:
      return false;
  }
}

function canApprove(actor: Actor, r: DemoRefillRequest): boolean {
  return actor.role === 'FINANCE' && r.status === 'SUBMITTED';
}

function canReject(actor: Actor, r: DemoRefillRequest): boolean {
  return actor.role === 'FINANCE' && r.status === 'SUBMITTED';
}

function canCancel(actor: Actor, r: DemoRefillRequest): boolean {
  return actor.role === 'STAFF' && r.status === 'SUBMITTED' && r.staffId === actor.id;
}

/** R1 — the single most important guard in the app: exactly `APPROVED`, nothing looser. */
function canStartPreparing(actor: Actor, r: DemoRefillRequest): boolean {
  return actor.role === 'BARISTA' && r.status === 'APPROVED' && r.kitchenId === actor.kitchenId;
}

function canMarkReady(actor: Actor, r: DemoRefillRequest): boolean {
  return actor.role === 'BARISTA' && r.status === 'PREPARING' && r.kitchenId === actor.kitchenId;
}

/** E2 — atomic single-winner: only unclaimed `READY_TO_PICK` rows are claimable. */
function canClaim(actor: Actor, r: DemoRefillRequest): boolean {
  return actor.role === 'RIDER' && r.status === 'READY_TO_PICK' && r.riderId === null;
}

function canDeliver(actor: Actor, r: DemoRefillRequest): boolean {
  return actor.role === 'RIDER' && r.status === 'PICKED_UP' && r.riderId === actor.id;
}

export function refillCapabilities(actor: Actor, r: DemoRefillRequest) {
  return {
    approve: canApprove(actor, r),
    reject: canReject(actor, r),
    cancel: canCancel(actor, r),
    start_preparing: canStartPreparing(actor, r),
    mark_ready: canMarkReady(actor, r),
    claim: canClaim(actor, r),
    deliver: canDeliver(actor, r),
  };
}

export function listRefills(actor: Actor, statuses: RefillStatusValue[] | null): DemoRefillRequest[] {
  return state.refillRequests
    .filter((r) => isVisibleTo(actor, r))
    .filter((r) => !statuses || statuses.includes(r.status))
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
}

export function getRefillById(actor: Actor, id: number): DemoRefillRequest {
  const refill = state.refillRequests.find((r) => r.id === id);
  if (!refill || !isVisibleTo(actor, refill)) {
    throw new DemoError('Permintaan tidak ditemukan.', 404);
  }
  return refill;
}

/** `from` must be captured by the caller BEFORE mutating `refill.status` — every call site below
 * sets `refill.status = to` first for clarity, so this takes the previous value explicitly rather
 * than reading `refill.status` itself, which would already have moved on to `to` by then. */
function appendHistory(
  refill: DemoRefillRequest,
  actor: Actor,
  from: RefillStatusValue | null,
  to: RefillStatusValue,
  reason: string | null,
) {
  refill.statusHistory.push({
    fromStatus: from,
    toStatus: to,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    reason,
    at: new Date().toISOString(),
  });
}

// ── Flow B — Refill Request transitions ─────────────────────────────────────────────────────────

export type SubmitRefillInput = {
  uuid: string;
  cartId: number;
  evidenceMediaId: number;
  gpsLat: number | null;
  gpsLng: number | null;
  gpsUnavailable: boolean;
  lines: { productId: number; qtyRequested: number }[];
};

const OPEN_STATUSES: RefillStatusValue[] = ['SUBMITTED', 'APPROVED', 'PREPARING', 'READY_TO_PICK', 'PICKED_UP'];

export function submitRefill(actor: Actor, input: SubmitRefillInput): DemoRefillRequest {
  if (actor.role !== 'STAFF') throw new DemoError('Anda tidak memiliki akses untuk tindakan ini.', 403);

  // R14 — dedupe on the client-generated uuid regardless of Idempotency-Key replay above.
  const existingByUuid = state.refillRequests.find((r) => r.uuid === input.uuid);
  if (existingByUuid) return existingByUuid;

  const assignment = assignedCartToday(actor.id);
  if (!assignment || assignment.cartId !== input.cartId) {
    throw new DemoError('Anda tidak bertugas di gerobak ini hari ini.', 403);
  }

  const lines = input.lines.filter((l) => l.qtyRequested > 0);
  if (lines.length === 0) throw new DemoError('Pilih minimal satu produk', 422);
  for (const line of lines) {
    if (!Number.isInteger(line.qtyRequested) || line.qtyRequested < 1 || line.qtyRequested > 100) {
      throw new DemoError('Jumlah harus antara 1 dan 100 cups', 422);
    }
  }

  const media = mediaStore.get(input.evidenceMediaId);
  if (!media) throw new DemoError('Foto bukti wajib diambil langsung dari kamera', 422);

  // R2 — one open request per cart.
  const openForCart = state.refillRequests.find(
    (r) => r.cartId === input.cartId && OPEN_STATUSES.includes(r.status),
  );
  if (openForCart) {
    throw new DemoError('Masih ada request yang belum selesai untuk gerobak ini.', 409);
  }

  const cart = getCart(input.cartId);
  const user = state.users.find((u) => u.id === actor.id);
  const at = new Date().toISOString();
  const today = todayOperatingDate();

  const refill: DemoRefillRequest = {
    id: nextId('refill'),
    uuid: input.uuid,
    code: `REF-${today.replace(/-/g, '')}-${String(state.nextIds.refill - 1).padStart(4, '0')}`,
    status: 'SUBMITTED',
    version: 1,
    operatingDate: today,
    cartId: input.cartId,
    staffId: actor.id,
    staffName: user?.name ?? actor.name,
    kitchenId: cart?.kitchenId ?? state.kitchen.id,
    evidencePhotoId: input.evidenceMediaId,
    evidencePhotoUrl: media.url,
    gpsLat: input.gpsLat,
    gpsLng: input.gpsLng,
    gpsUnavailable: input.gpsUnavailable,
    outOfHours: false,
    submittedAt: at,
    decidedAt: null,
    financeId: null,
    decisionReason: null,
    baristaId: null,
    preparedAt: null,
    shortfallReason: null,
    riderId: null,
    pickedUpAt: null,
    deliveredAt: null,
    signatureId: null,
    signatureUrl: null,
    signatureMethod: null,
    lines: lines.map((l, i) => ({
      id: i + 1,
      productId: l.productId,
      qtyRequested: l.qtyRequested,
      qtyApproved: null,
      qtyPrepared: null,
      qtyReceived: null,
      unitCost: getProduct(l.productId)?.cost_price ?? 0,
    })),
    statusHistory: [],
  };
  appendHistory(refill, actor, null, 'SUBMITTED', null);
  state.refillRequests.push(refill);

  notify([{ role: 'FINANCE' }], {
    type: 'RefillRequestSubmitted',
    title: 'Permintaan refill baru',
    body: `${refill.code} · Gerobak ${cart?.code ?? '-'} menunggu approval`,
    refillRequestId: refill.id,
  });
  notify([{ role: 'BARISTA' }], {
    type: 'RefillRequestSubmitted',
    title: 'Permintaan masuk (menunggu Finance)',
    body: `${refill.code} · Gerobak ${cart?.code ?? '-'}`,
    refillRequestId: refill.id,
  });

  return refill;
}

export type ApproveRefillInput = { lines: { lineId: number; qtyApproved: number }[]; partialReason?: string };

export function approveRefill(actor: Actor, id: number, input: ApproveRefillInput): DemoRefillRequest {
  const refill = getRefillById(actor, id);
  if (!canApprove(actor, refill)) {
    throw new DemoError('Status permintaan sudah berubah. Muat ulang halaman.', 409);
  }

  let anyReduced = false;
  let anyApproved = false;
  for (const line of input.lines) {
    const target = refill.lines.find((l) => l.id === line.lineId);
    if (!target) continue;
    if (!Number.isInteger(line.qtyApproved) || line.qtyApproved < 0 || line.qtyApproved > target.qtyRequested) {
      throw new DemoError('Jumlah approve tidak boleh melebihi permintaan', 422);
    }
    if (line.qtyApproved < target.qtyRequested) anyReduced = true;
    if (line.qtyApproved > 0) anyApproved = true;
  }
  if (!anyApproved) throw new DemoError('Minimal satu produk harus disetujui.', 422);
  if (anyReduced && (input.partialReason ?? '').trim().length < 10) {
    throw new DemoError('Alasan pengurangan wajib diisi (min. 10 karakter)', 422);
  }

  for (const line of input.lines) {
    const target = refill.lines.find((l) => l.id === line.lineId);
    if (target) target.qtyApproved = line.qtyApproved;
  }

  const cart = getCart(refill.cartId);
  const previousStatus = refill.status;
  refill.status = 'APPROVED';
  refill.decidedAt = new Date().toISOString();
  refill.financeId = actor.id;
  refill.decisionReason = anyReduced ? (input.partialReason ?? '').trim() : null;
  appendHistory(refill, actor, previousStatus, 'APPROVED', refill.decisionReason);

  notify([{ role: 'BARISTA' }], {
    type: 'RefillRequestApproved',
    title: 'Permintaan disetujui Finance',
    body: `${refill.code} · Gerobak ${cart?.code ?? '-'} siap disiapkan`,
    refillRequestId: refill.id,
  });
  notify([{ userId: refill.staffId }], {
    type: 'RefillRequestApproved',
    title: 'Permintaan disetujui',
    body: `${refill.code} disetujui Finance`,
    refillRequestId: refill.id,
  });

  return refill;
}

export function rejectRefill(actor: Actor, id: number, reason: string): DemoRefillRequest {
  const refill = getRefillById(actor, id);
  if (!canReject(actor, refill)) {
    throw new DemoError('Status permintaan sudah berubah. Muat ulang halaman.', 409);
  }
  if (reason.trim().length < 10) {
    throw new DemoError('Alasan penolakan wajib diisi (min. 10 karakter)', 422);
  }

  const previousStatus = refill.status;
  refill.status = 'REJECTED';
  refill.decidedAt = new Date().toISOString();
  refill.financeId = actor.id;
  refill.decisionReason = reason.trim();
  appendHistory(refill, actor, previousStatus, 'REJECTED', refill.decisionReason);

  notify([{ userId: refill.staffId }], {
    type: 'RefillRequestRejected',
    title: 'Permintaan ditolak',
    body: `${refill.code} ditolak: ${refill.decisionReason}`,
    refillRequestId: refill.id,
  });

  return refill;
}

export function cancelRefill(actor: Actor, id: number): DemoRefillRequest {
  const refill = getRefillById(actor, id);
  if (!canCancel(actor, refill)) {
    // E16 — cancellation is not permitted once APPROVED or later.
    throw new DemoError('Permintaan sudah diproses dan tidak dapat dibatalkan.', 409);
  }
  const previousStatus = refill.status;
  refill.status = 'CANCELLED';
  appendHistory(refill, actor, previousStatus, 'CANCELLED', null);
  return refill;
}

/** R1 — the whole reason this file exists: `start-preparing` is refused with `409` unless the
 * request is at exactly `APPROVED`. A `SUBMITTED` request is fully visible to the barista and
 * still hits this branch if called, exactly as requirement 4 demands. */
export function startPreparingRefill(actor: Actor, id: number): DemoRefillRequest {
  const refill = getRefillById(actor, id);
  if (actor.role !== 'BARISTA' || refill.kitchenId !== actor.kitchenId) {
    throw new DemoError('Anda tidak memiliki akses untuk tindakan ini.', 403);
  }
  if (!canStartPreparing(actor, refill)) {
    // The only remaining way to fail `canStartPreparing` after the role/kitchen check above is
    // status !== APPROVED — this IS the R1 gate.
    throw new DemoError('Permintaan belum disetujui Finance.', 409);
  }

  const previousStatus = refill.status;
  refill.status = 'PREPARING';
  refill.baristaId = actor.id;
  appendHistory(refill, actor, previousStatus, 'PREPARING', null);
  return refill;
}

export type MarkReadyInput = { lines: { lineId: number; qtyPrepared: number }[]; shortfallReason?: string };

export function markReadyRefill(actor: Actor, id: number, input: MarkReadyInput): DemoRefillRequest {
  const refill = getRefillById(actor, id);
  if (!canMarkReady(actor, refill)) {
    throw new DemoError('Status permintaan sudah berubah. Muat ulang halaman.', 409);
  }

  let anyShortfall = false;
  let anyPrepared = false;
  for (const line of input.lines) {
    const target = refill.lines.find((l) => l.id === line.lineId);
    if (!target) continue;
    const ceiling = target.qtyApproved ?? 0;
    if (!Number.isInteger(line.qtyPrepared) || line.qtyPrepared < 0 || line.qtyPrepared > ceiling) {
      throw new DemoError('Jumlah siap tidak boleh melebihi yang di-approve', 422);
    }
    if (line.qtyPrepared < ceiling) anyShortfall = true;
    if (line.qtyPrepared > 0) anyPrepared = true;
  }
  if (!anyPrepared) throw new DemoError('Jumlah siap tidak boleh kosong untuk semua produk.', 422);
  if (anyShortfall && (input.shortfallReason ?? '').trim().length === 0) {
    throw new DemoError('Alasan kekurangan wajib diisi karena ada jumlah yang kurang dari yang disetujui.', 422);
  }

  for (const line of input.lines) {
    const target = refill.lines.find((l) => l.id === line.lineId);
    if (target) target.qtyPrepared = line.qtyPrepared;
  }

  const previousStatus = refill.status;
  refill.status = 'READY_TO_PICK';
  refill.preparedAt = new Date().toISOString();
  refill.shortfallReason = anyShortfall ? (input.shortfallReason ?? '').trim() : null;
  appendHistory(refill, actor, previousStatus, 'READY_TO_PICK', refill.shortfallReason);

  notify([{ role: 'RIDER' }], {
    type: 'RefillReadyToPick',
    title: 'Siap diambil',
    body: `${refill.code} siap diambil`,
    refillRequestId: refill.id,
  });
  notify([{ userId: refill.staffId }], {
    type: 'RefillReadyToPick',
    title: 'Sedang diantar',
    body: `${refill.code} sedang disiapkan untuk pengiriman`,
    refillRequestId: refill.id,
  });

  return refill;
}

/** E2 — atomic single-winner claim. */
export function claimRefill(actor: Actor, id: number): DemoRefillRequest {
  const refill = getRefillById(actor, id);
  if (actor.role !== 'RIDER') throw new DemoError('Anda tidak memiliki akses untuk tindakan ini.', 403);
  if (!canClaim(actor, refill)) {
    throw new DemoError('Sudah diambil rider lain.', 409);
  }

  const previousStatus = refill.status;
  refill.status = 'PICKED_UP';
  refill.riderId = actor.id;
  refill.pickedUpAt = new Date().toISOString();
  appendHistory(refill, actor, previousStatus, 'PICKED_UP', null);

  notify([{ userId: refill.staffId }], {
    type: 'RefillPickedUp',
    title: 'Pesanan sedang diantar',
    body: `${refill.code} sedang dalam perjalanan`,
    refillRequestId: refill.id,
  });

  return refill;
}

export type DeliverInput = {
  signatureUri: string;
  strokeCount: number;
  method: 'staff_signature' | 'pin_fallback';
  staffPin?: string;
  lines: { lineId: number; qtyReceived: number }[];
  gpsLat: number | null;
  gpsLng: number | null;
  gpsUnavailable: boolean;
};

export function deliverRefill(actor: Actor, id: number, input: DeliverInput): DemoRefillRequest {
  const refill = getRefillById(actor, id);
  if (!canDeliver(actor, refill)) {
    throw new DemoError('Pengiriman ini bukan milik Anda atau sudah selesai.', 409);
  }

  if (input.method === 'staff_signature') {
    // E24 — an accidental single dot is rejected.
    if (input.strokeCount < 3) throw new DemoError('Tanda tangan belum lengkap', 422);
  } else {
    // E7 — PIN fallback verifies the requesting staff's own PIN. `stroke_count: 0` is accepted.
    const staffUser = state.users.find((u) => u.id === refill.staffId);
    if (!staffUser?.pin || staffUser.pin !== input.staffPin) {
      throw new DemoError('PIN staff salah.', 422);
    }
  }

  for (const line of input.lines) {
    const target = refill.lines.find((l) => l.id === line.lineId);
    if (!target) continue;
    const ceiling = target.qtyPrepared ?? 0;
    if (!Number.isInteger(line.qtyReceived) || line.qtyReceived < 0 || line.qtyReceived > ceiling) {
      throw new DemoError('Jumlah diterima tidak boleh melebihi yang dikirim', 422);
    }
  }

  for (const line of input.lines) {
    const target = refill.lines.find((l) => l.id === line.lineId);
    if (target) target.qtyReceived = line.qtyReceived;
  }

  const at = new Date().toISOString();
  const previousStatus = refill.status;
  refill.status = 'DELIVERED';
  refill.deliveredAt = at;
  refill.signatureId = nextId('media');
  refill.signatureUrl = input.signatureUri;
  refill.signatureMethod = input.method;
  refill.gpsLat = input.gpsLat ?? refill.gpsLat;
  refill.gpsLng = input.gpsLng ?? refill.gpsLng;
  appendHistory(refill, actor, previousStatus, 'DELIVERED', input.method === 'pin_fallback' ? 'Verifikasi via PIN staff (E7)' : null);

  // R6 — the ledger post, kitchen → cart. The demo never simulates E19's failure path: it always
  // succeeds synchronously, so the request closes in the same call.
  for (const line of refill.lines) {
    const qty = line.qtyReceived ?? 0;
    if (qty <= 0) continue;
    postLedgerPair({
      productId: line.productId,
      qty,
      kitchenId: refill.kitchenId,
      cartId: refill.cartId,
      movementOut: 'REFILL_OUT',
      movementIn: 'REFILL_IN',
      refType: 'refill_request',
      refId: refill.id,
      actorId: actor.id,
    });
  }

  refill.status = 'CLOSED';
  appendHistory(refill, actor, 'DELIVERED', 'CLOSED', null);

  notify([{ role: 'FINANCE' }, { role: 'ADMINISTRATOR' }, { role: 'BARISTA' }, { userId: refill.staffId }], {
    type: 'RefillDelivered',
    title: 'Permintaan selesai',
    body: `${refill.code} diterima ${staffNameFor(refill)}`,
    refillRequestId: refill.id,
  });

  return refill;
}

// ── Flow A — Daily allocation ────────────────────────────────────────────────────────────────────

export type CreateAllocationInput = {
  operatingDate: string;
  cartId: number;
  staffId: number;
  locationId: number | null;
  lines: { productId: number; qtyIssued: number }[];
  correctionReason?: string;
};

const OVER_TARGET_TOLERANCE_PCT = 20;

export function createAllocation(actor: Actor, input: CreateAllocationInput): DemoAllocation {
  if (actor.role !== 'BARISTA') throw new DemoError('Anda tidak memiliki akses untuk tindakan ini.', 403);

  const existing = state.allocations.filter(
    (a) => a.cartId === input.cartId && a.operatingDate === input.operatingDate,
  );
  if (existing.length > 0 && !(input.correctionReason ?? '').trim()) {
    throw new DemoError('Gerobak ini sudah memiliki alokasi hari ini.', 409);
  }

  for (const line of input.lines) {
    if (line.qtyIssued <= 0) continue;
    const available = onHand('kitchen', state.kitchen.id, line.productId);
    if (line.qtyIssued > available) {
      const product = getProduct(line.productId);
      throw new DemoError(`Stok dapur tidak mencukupi untuk ${product?.name ?? 'produk ini'}.`, 422);
    }
  }

  const targets = state.dailyTargets.filter((t) => t.cartId === input.cartId);
  const totalTarget = targets.reduce((sum, t) => sum + t.targetQty, 0);
  const totalQty = input.lines.reduce((sum, l) => sum + l.qtyIssued, 0);
  const overPct = totalTarget > 0 ? Math.round(((totalQty - totalTarget) / totalTarget) * 100) : 0;
  const overTarget = totalTarget > 0 && overPct > OVER_TARGET_TOLERANCE_PCT;

  const allocation: DemoAllocation = {
    id: nextId('allocation'),
    operatingDate: input.operatingDate,
    cartId: input.cartId,
    staffId: input.staffId,
    kitchenId: state.kitchen.id,
    locationId: input.locationId,
    baristaId: actor.id,
    status: overTarget ? 'PENDING_FINANCE' : 'ISSUED',
    overTargetPct: overPct,
    isCorrection: existing.length > 0,
    issuedAt: overTarget ? null : new Date().toISOString(),
    lines: input.lines.map((l) => ({
      productId: l.productId,
      targetQty: targets.find((t) => t.productId === l.productId)?.targetQty ?? 0,
      qtyIssued: l.qtyIssued,
    })),
  };
  state.allocations.push(allocation);

  // Flow A invariant — over target by more than the tolerance never moves stock until Finance
  // approves it (that approval path is out of the eight numbered requirements this demo covers).
  if (!overTarget) {
    for (const line of allocation.lines) {
      if (line.qtyIssued <= 0) continue;
      postLedgerPair({
        productId: line.productId,
        qty: line.qtyIssued,
        kitchenId: state.kitchen.id,
        cartId: input.cartId,
        movementOut: 'ALLOCATION_OUT',
        movementIn: 'ALLOCATION_IN',
        refType: 'allocation',
        refId: allocation.id,
        actorId: actor.id,
      });
    }
    notify([{ userId: input.staffId }], {
      type: 'DailyAllocationIssued',
      title: 'Alokasi harian siap',
      body: `${totalQty} cups${allocation.locationId ? ` · lokasi ${state.locations.find((l) => l.id === allocation.locationId)?.name ?? ''}` : ''}`,
      refillRequestId: null,
    });
  } else {
    notify([{ role: 'FINANCE' }, { role: 'ADMINISTRATOR' }], {
      type: 'AllocationOverTarget',
      title: 'Alokasi melebihi target',
      body: `Gerobak ${getCart(input.cartId)?.code ?? '-'} · +${overPct}% dari target`,
      refillRequestId: null,
    });
  }

  return allocation;
}

// ── Media ────────────────────────────────────────────────────────────────────────────────────────

type MediaRecord = { id: number; url: string; sha256: string };
const mediaStore = new Map<number, MediaRecord>();

// The two pre-seeded requests "own" media ids 1–3 (see seed.ts's nextIds.media) — registered here
// so submitRefill's evidence lookup and any future re-upload flow see a consistent id space.
mediaStore.set(1, { id: 1, url: PLACEHOLDER_IMAGE_DATA_URI, sha256: 'seed-evidence-0001' });
mediaStore.set(2, { id: 2, url: PLACEHOLDER_IMAGE_DATA_URI, sha256: 'seed-evidence-0002' });
mediaStore.set(3, { id: 3, url: PLACEHOLDER_IMAGE_DATA_URI, sha256: 'seed-signature-0002' });

function fakeSha256(seedValue: string): string {
  // Not a real hash — there is no server to hash bytes against. A stable, cheap stand-in derived
  // from the local file uri is enough to give every upload a distinct, deterministic identifier.
  let h = 0;
  for (let i = 0; i < seedValue.length; i += 1) {
    h = (h * 31 + seedValue.charCodeAt(i)) | 0;
  }
  return `demo-${Math.abs(h).toString(16)}-${seedValue.length}`;
}

/** Evidence photos and delivery signatures are real files captured on-device (camera, signature
 * pad) even in demo mode — only the backend that would normally store them is fabricated. The
 * local file uri IS the url: React Native's `Image` renders a `file://` uri directly, no upload
 * required. */
export function storeMedia(uri: string): MediaRecord {
  const record: MediaRecord = { id: nextId('media'), url: uri, sha256: fakeSha256(uri) };
  mediaStore.set(record.id, record);
  return record;
}

// ── Actor helpers used by router.ts ─────────────────────────────────────────────────────────────

export function requireActor(session: { user: { id: string; role: Role; cartId?: number; kitchenId?: number; name: string } } | null): Actor {
  if (!session) throw new DemoError('Sesi berakhir. Silakan masuk kembali.', 401);
  return {
    id: Number(session.user.id),
    name: session.user.name,
    role: session.user.role,
    cartId: session.user.cartId,
    kitchenId: session.user.kitchenId,
  };
}

// ── Public joins for router.ts's serializers ────────────────────────────────────────────────────
//
// router.ts converts internal records into the exact API-contract shapes (docs/04) and applies
// R15's cost stripping there, not here — this file only exposes the lookups that join needs.

export function getProductById(id: number): DemoProduct | undefined {
  return getProduct(id);
}

export function getCartById(id: number): DemoCart | undefined {
  return getCart(id);
}

export function getLocationById(id: number): DemoLocation | undefined {
  return state.locations.find((l) => l.id === id);
}

export function getUserById(id: number): DemoUser | undefined {
  return state.users.find((u) => u.id === id);
}

/** A refill request has no location column of its own (docs/02 §12 schema) — its "location" is
 * whichever location the requesting staff was assigned to on that operating day. The two ghost
 * historical seed rows have no assignment, so this correctly resolves to `null` for them. */
export function getAssignedLocationName(userId: number, operatingDate: string): string | null {
  const assignment = state.staffAssignments.find((a) => a.userId === userId && a.operatingDate === operatingDate);
  if (!assignment) return null;
  return state.locations.find((l) => l.id === assignment.locationId)?.name ?? null;
}

/** The qty a per-line cost valuation should use — the latest stage that has actually happened. */
export function effectiveLineQty(line: { qtyReceived: number | null; qtyPrepared: number | null; qtyApproved: number | null; qtyRequested: number }): number {
  return line.qtyReceived ?? line.qtyPrepared ?? line.qtyApproved ?? line.qtyRequested;
}
