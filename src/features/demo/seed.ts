import type { Role } from '@/domain/roles';

/**
 * Fabricated master data for the offline demo backend (`src/features/demo/router.ts`).
 *
 * Every value in this file is invented for demonstration purposes. Nothing here is read from,
 * or written to, any real system — see `config.ts` for the mode switch and its honesty
 * requirement. Users, phone numbers, prices and historical requests are all fiction.
 *
 * Kept in lockstep with the real backend seeders (`api/database/seeders/*.php`) wherever they
 * overlap (products, users, carts, kitchen, locations) so the demo APK shows the same shape of
 * data an eventual real deployment would — see the per-section comments below for what mirrors
 * what and what is demo-only invention.
 */

// ── Identity constants — referenced by store.ts and router.ts ──────────────────────────────────

export const KITCHEN_ID = 1;
export const CART_0018_ID = 1;
export const CART_0019_ID = 2;
export const CART_0020_ID = 3;
export const LOCATION_SUDIRMAN_ID = 1;
export const LOCATION_THAMRIN_ID = 2;
export const LOCATION_KEMANG_ID = 3;

export const USER_ADMIN_ID = 1;
export const USER_FINANCE_ID = 2;
export const USER_BARISTA_ID = 3;
export const USER_RIDER_ID = 4;
export const USER_STAFF_ID = 5;

/** Historical-only staff references used by the two pre-seeded requests (§ below). These are
 * NOT login accounts — the real seeder has exactly one STAFF user (Maufu, id 5), and this file
 * must not invent a sixth loginable user. They exist purely so the pre-seeded rows read as real
 * past shifts on carts other than the one the live walkthrough uses. */
export const GHOST_STAFF_YANTI_ID = 901;
export const GHOST_STAFF_BUDI_ID = 902;

// ── Master data — mirrors api/database/seeders/*.php ────────────────────────────────────────────

export type DemoProduct = {
  id: number;
  code: string;
  name: string;
  unit: 'cup' | 'pack';
  is_sellable: boolean;
  sort_order: number;
  cost_price: number;
  sell_price: number;
};

/**
 * PLACEHOLDER — real per-item prices were never verified.
 *
 * Mirrors `ProductSeeder.php` exactly: only Soul Coffeemate's overall range (Rp 18.000–96.000) is
 * confirmed; no per-item price list was ever found. Sell prices below sit in the 18.000–25.000
 * band and cost prices are ~40% of sell, purely so Finance's approval screen and the settlement
 * math have non-zero numbers to demonstrate against. None of these are the real HPP/sell price.
 */
export const PRODUCTS: DemoProduct[] = [
  { id: 1, code: 'SOUL-COFFEE', name: 'Soul Coffee', unit: 'cup', is_sellable: true, sort_order: 1, sell_price: 20000, cost_price: 8000 },
  { id: 2, code: 'CYTRUS-COLD-BREW', name: 'Cytrus Cold Brew', unit: 'cup', is_sellable: true, sort_order: 2, sell_price: 22000, cost_price: 8800 },
  { id: 3, code: 'THAITEA', name: 'Thaitea', unit: 'cup', is_sellable: true, sort_order: 3, sell_price: 20000, cost_price: 8000 },
  { id: 4, code: 'KOPSU', name: 'Kopsu', unit: 'cup', is_sellable: true, sort_order: 4, sell_price: 19000, cost_price: 7600 },
  { id: 5, code: 'PASSION-COLDBREW', name: 'Passion Coldbrew', unit: 'cup', is_sellable: true, sort_order: 5, sell_price: 23000, cost_price: 9200 },
  { id: 6, code: 'SOUL-LATTE', name: 'Soul Latte', unit: 'cup', is_sellable: true, sort_order: 6, sell_price: 21000, cost_price: 8400 },
  { id: 7, code: 'BUTTERSCOTCH-SEASALT-CREAM', name: 'Butterscotch SeaSalt Cream', unit: 'cup', is_sellable: true, sort_order: 7, sell_price: 25000, cost_price: 10000 },
  { id: 8, code: 'SOUL-MATCHA', name: 'Soul Matcha', unit: 'cup', is_sellable: true, sort_order: 8, sell_price: 24000, cost_price: 9600 },
  { id: 9, code: 'SOUL-CHOCOLATE', name: 'Soul Chocolate', unit: 'cup', is_sellable: true, sort_order: 9, sell_price: 22000, cost_price: 8800 },
  { id: 10, code: 'LECHEE-TEA', name: 'Lechee Tea', unit: 'cup', is_sellable: true, sort_order: 10, sell_price: 18000, cost_price: 7200 },
  // Non-sellable consumable (§3.1, Q3 of docs/02): tracked so it can be requested and refilled
  // without polluting sales figures. No sell price; a small placeholder cost keeps its own
  // request-value line non-zero for Finance.
  { id: 11, code: 'ES-BATU', name: 'ES BATU', unit: 'pack', is_sellable: false, sort_order: 11, sell_price: 0, cost_price: 2000 },
];

export const SELLABLE_PRODUCT_IDS = PRODUCTS.filter((p) => p.is_sellable).map((p) => p.id);

export type DemoKitchen = { id: number; name: string; address: string };

export const KITCHEN: DemoKitchen = {
  id: KITCHEN_ID,
  name: 'Dapur Pusat Cempaka Putih',
  address: 'Jl. Pramuka Kav 56, Cempaka Putih, Jakarta Pusat',
};

export type DemoCart = {
  id: number;
  code: string;
  plate: string | null;
  status: 'active' | 'maintenance' | 'retired';
  kitchenId: number;
};

export const CARTS: DemoCart[] = [
  { id: CART_0018_ID, code: '0018', plate: null, status: 'active', kitchenId: KITCHEN_ID },
  { id: CART_0019_ID, code: '0019', plate: null, status: 'active', kitchenId: KITCHEN_ID },
  { id: CART_0020_ID, code: '0020', plate: null, status: 'active', kitchenId: KITCHEN_ID },
];

export type DemoLocation = { id: number; name: string; lat: number; lng: number };

export const LOCATIONS: DemoLocation[] = [
  { id: LOCATION_SUDIRMAN_ID, name: 'Sudirman', lat: -6.2088, lng: 106.8228 },
  { id: LOCATION_THAMRIN_ID, name: 'Thamrin', lat: -6.1944, lng: 106.8229 },
  { id: LOCATION_KEMANG_ID, name: 'Kemang', lat: -6.2607, lng: 106.8133 },
];

export type DemoUser = {
  id: number;
  name: string;
  role: Role;
  /** E.164, matches `UserSeeder.php` exactly. */
  phone: string;
  password: string;
  /** Only the STAFF demo user has one — PIN fallback (E7) only ever verifies the requesting
   * staff's own PIN. */
  pin?: string;
  cartId?: number;
  cartCode?: string;
  kitchenId?: number;
  kitchenName?: string;
};

/** Mirrors `UserSeeder.php` exactly — same names, phones, passwords, roles. */
export const USERS: DemoUser[] = [
  { id: USER_ADMIN_ID, name: 'Rizal Admin', role: 'ADMINISTRATOR', phone: '+6281100000001', password: 'admin123' },
  { id: USER_FINANCE_ID, name: 'Sari Finance', role: 'FINANCE', phone: '+6281100000002', password: 'finance123' },
  {
    id: USER_BARISTA_ID,
    name: 'Dimas Barista',
    role: 'BARISTA',
    phone: '+6281100000003',
    password: 'barista123',
    kitchenId: KITCHEN_ID,
    kitchenName: KITCHEN.name,
  },
  { id: USER_RIDER_ID, name: 'Agus Rider', role: 'RIDER', phone: '+6281100000004', password: 'rider123' },
  {
    id: USER_STAFF_ID,
    name: 'Maufu',
    role: 'STAFF',
    phone: '+6281100000005',
    password: 'staff123',
    pin: '123456',
    cartId: CART_0018_ID,
    cartCode: '0018',
  },
];

export type DemoStaffAssignment = { userId: number; cartId: number; locationId: number; operatingDate: string };
export type DemoDailyTarget = { cartId: number; productId: number; targetQty: number };

/** Local calendar date, `YYYY-MM-DD` — mirrors the same formatting every screen that builds an
 * `operating_date` locally already uses (see `app/(app)/barista/allocation.tsx`), so the demo's
 * "today" always lines up with what the client sends. */
export function todayOperatingDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Mirrors `DailyTargetSeeder.php`: every cart gets a 5-cup target for every sellable product. */
export function buildDailyTargets(): DemoDailyTarget[] {
  const targets: DemoDailyTarget[] = [];
  for (const cart of CARTS) {
    for (const productId of SELLABLE_PRODUCT_IDS) {
      targets.push({ cartId: cart.id, productId, targetQty: 5 });
    }
  }
  return targets;
}

/** Mirrors `StaffAssignmentSeeder.php`: Maufu is on cart 0018, at Sudirman, today. */
export function buildStaffAssignments(): DemoStaffAssignment[] {
  return [
    {
      userId: USER_STAFF_ID,
      cartId: CART_0018_ID,
      locationId: LOCATION_SUDIRMAN_ID,
      operatingDate: todayOperatingDate(),
    },
  ];
}

/**
 * Tiny (1×1, transparent) PNG reused as a stand-in image wherever the demo needs to display a
 * photo or signature that was never actually captured on this device — the two pre-seeded
 * historical requests below. Anything captured LIVE during the walkthrough (a real camera photo,
 * a real signature-pad stroke) uses the real local file the device produced instead; this
 * constant only backs pre-existing, non-interactive seed rows.
 */
export const PLACEHOLDER_IMAGE_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

// ── Ledger, allocation and refill-request seed rows ─────────────────────────────────────────────
//
// These are the mutable-state STARTING POINT, built once when the module loads. `store.ts` owns
// everything that happens to them after that — this file only describes where the demo begins.

export type StockMovementType =
  | 'PRODUCTION_IN'
  | 'ALLOCATION_OUT'
  | 'ALLOCATION_IN'
  | 'REFILL_OUT'
  | 'REFILL_IN'
  | 'SALE_OUT'
  | 'RETURN_IN'
  | 'WASTE_OUT'
  | 'ADJUSTMENT';

export type DemoStockEntry = {
  id: number;
  locationType: 'kitchen' | 'cart';
  locationId: number;
  productId: number;
  movementType: StockMovementType;
  qtyDelta: number;
  refType: string | null;
  refId: number | null;
  actorId: number;
  createdAt: string;
};

export type DemoAllocationLine = { productId: number; targetQty: number; qtyIssued: number };

export type DemoAllocation = {
  id: number;
  operatingDate: string;
  cartId: number;
  staffId: number;
  kitchenId: number;
  locationId: number | null;
  baristaId: number;
  status: 'ISSUED' | 'PENDING_FINANCE';
  overTargetPct: number;
  isCorrection: boolean;
  issuedAt: string | null;
  lines: DemoAllocationLine[];
};

export type DemoRefillLine = {
  id: number;
  productId: number;
  qtyRequested: number;
  qtyApproved: number | null;
  qtyPrepared: number | null;
  qtyReceived: number | null;
  /** Cost price pinned at submission (R10) — never re-read from `PRODUCTS` after this point. */
  unitCost: number;
};

export type RefillStatusValue =
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'PREPARING'
  | 'READY_TO_PICK'
  | 'PICKED_UP'
  | 'DELIVERED'
  | 'CLOSED';

export type DemoStatusHistoryEntry = {
  fromStatus: RefillStatusValue | null;
  toStatus: RefillStatusValue;
  actorId: number;
  actorName: string;
  actorRole: Role;
  reason: string | null;
  at: string;
};

export type DemoRefillRequest = {
  id: number;
  uuid: string;
  code: string;
  status: RefillStatusValue;
  version: number;
  operatingDate: string;
  cartId: number;
  staffId: number;
  staffName: string;
  kitchenId: number;
  evidencePhotoId: number;
  evidencePhotoUrl: string;
  gpsLat: number | null;
  gpsLng: number | null;
  gpsUnavailable: boolean;
  outOfHours: boolean;
  submittedAt: string;
  decidedAt: string | null;
  financeId: number | null;
  decisionReason: string | null;
  baristaId: number | null;
  preparedAt: string | null;
  shortfallReason: string | null;
  riderId: number | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  signatureId: number | null;
  signatureUrl: string | null;
  signatureMethod: 'staff_signature' | 'pin_fallback' | null;
  lines: DemoRefillLine[];
  statusHistory: DemoStatusHistoryEntry[];
};

export type DemoNotification = {
  id: number;
  eventId: string;
  type: string;
  title: string;
  body: string;
  refillRequestId: number | null;
  readAt: string | null;
  createdAt: string;
  recipientUserId: number | null;
  recipientRole: Role | null;
};

function findProduct(id: number): DemoProduct {
  const product = PRODUCTS.find((p) => p.id === id);
  if (!product) throw new Error(`demo seed: unknown product id ${id}`);
  return product;
}

export type SeedResult = {
  stockLedger: DemoStockEntry[];
  allocations: DemoAllocation[];
  refillRequests: DemoRefillRequest[];
  notifications: DemoNotification[];
  nextIds: {
    stockLedger: number;
    allocation: number;
    refill: number;
    media: number;
    notification: number;
  };
};

/**
 * Builds the mutable state `store.ts` starts from:
 *  - Opening kitchen stock: 200 of every product (mirrors `StockLedgerSeeder.php`).
 *  - Cart 0018's morning allocation, deliberately well under target, so a refill reads as
 *    obviously justified rather than arbitrary.
 *  - Two pre-existing refill requests (one `SUBMITTED`, one `DELIVERED`) so every list screen has
 *    something to show on first open, without occupying cart 0018 — the cart the live walkthrough
 *    uses — so R2 (one open request per cart) never blocks the demo's own first submission.
 */
export function buildSeed(): SeedResult {
  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const today = todayOperatingDate();

  let ledgerId = 1;
  const stockLedger: DemoStockEntry[] = [];

  const pushLedger = (entry: Omit<DemoStockEntry, 'id'>) => {
    stockLedger.push({ ...entry, id: ledgerId });
    ledgerId += 1;
  };

  // Opening kitchen stock — every product, 200 units, posted at "this morning".
  for (const product of PRODUCTS) {
    pushLedger({
      locationType: 'kitchen',
      locationId: KITCHEN_ID,
      productId: product.id,
      movementType: 'PRODUCTION_IN',
      qtyDelta: 200,
      refType: null,
      refId: null,
      actorId: USER_BARISTA_ID,
      createdAt: hoursAgo(6),
    });
  }

  // Cart 0018's opening allocation — 2 cups per sellable product (target is 5), so the cart
  // starts the demo visibly low on stock and a refill reads as plainly justified.
  const OPENING_QTY_PER_PRODUCT = 2;
  const allocationLines: DemoAllocationLine[] = SELLABLE_PRODUCT_IDS.map((productId) => ({
    productId,
    targetQty: 5,
    qtyIssued: OPENING_QTY_PER_PRODUCT,
  }));
  const openingTotalQty = allocationLines.reduce((sum, l) => sum + l.qtyIssued, 0);
  const openingTargetTotal = allocationLines.reduce((sum, l) => sum + l.targetQty, 0);
  const openingOverPct = Math.round(((openingTotalQty - openingTargetTotal) / openingTargetTotal) * 100);

  for (const line of allocationLines) {
    pushLedger({
      locationType: 'kitchen',
      locationId: KITCHEN_ID,
      productId: line.productId,
      movementType: 'ALLOCATION_OUT',
      qtyDelta: -line.qtyIssued,
      refType: 'allocation',
      refId: 1,
      actorId: USER_BARISTA_ID,
      createdAt: hoursAgo(5),
    });
    pushLedger({
      locationType: 'cart',
      locationId: CART_0018_ID,
      productId: line.productId,
      movementType: 'ALLOCATION_IN',
      qtyDelta: line.qtyIssued,
      refType: 'allocation',
      refId: 1,
      actorId: USER_BARISTA_ID,
      createdAt: hoursAgo(5),
    });
  }

  const allocations: DemoAllocation[] = [
    {
      id: 1,
      operatingDate: today,
      cartId: CART_0018_ID,
      staffId: USER_STAFF_ID,
      kitchenId: KITCHEN_ID,
      locationId: LOCATION_SUDIRMAN_ID,
      baristaId: USER_BARISTA_ID,
      status: 'ISSUED',
      overTargetPct: openingOverPct,
      isCorrection: false,
      issuedAt: hoursAgo(5),
      lines: allocationLines,
    },
  ];

  // Seed request #1 — SUBMITTED, waiting for Finance. Cart 0019, a historical shift ("Yanti") so
  // it never competes with cart 0018 for R2's one-open-request-per-cart slot.
  const req1Lines: DemoRefillLine[] = [
    { id: 1, productId: 1, qtyRequested: 5, qtyApproved: null, qtyPrepared: null, qtyReceived: null, unitCost: findProduct(1).cost_price },
    { id: 2, productId: 3, qtyRequested: 3, qtyApproved: null, qtyPrepared: null, qtyReceived: null, unitCost: findProduct(3).cost_price },
  ];
  const req1SubmittedAt = hoursAgo(1.5);
  const request1: DemoRefillRequest = {
    id: 1,
    uuid: 'seed-request-0001',
    code: `REF-${today.replace(/-/g, '')}-0001`,
    status: 'SUBMITTED',
    version: 1,
    operatingDate: today,
    cartId: CART_0019_ID,
    staffId: GHOST_STAFF_YANTI_ID,
    staffName: 'Yanti',
    kitchenId: KITCHEN_ID,
    evidencePhotoId: 1,
    evidencePhotoUrl: PLACEHOLDER_IMAGE_DATA_URI,
    gpsLat: LOCATIONS[1]!.lat,
    gpsLng: LOCATIONS[1]!.lng,
    gpsUnavailable: false,
    outOfHours: false,
    submittedAt: req1SubmittedAt,
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
    lines: req1Lines,
    statusHistory: [
      {
        fromStatus: null,
        toStatus: 'SUBMITTED',
        actorId: GHOST_STAFF_YANTI_ID,
        actorName: 'Yanti',
        actorRole: 'STAFF',
        reason: null,
        at: req1SubmittedAt,
      },
    ],
  };

  // Seed request #2 — fully DELIVERED (but not yet CLOSED, mirroring E19: the ledger post can
  // legitimately still be in flight at this point). Cart 0020, historical shift ("Budi").
  const req2Lines: DemoRefillLine[] = [
    { id: 1, productId: 6, qtyRequested: 4, qtyApproved: 4, qtyPrepared: 4, qtyReceived: 4, unitCost: findProduct(6).cost_price },
    { id: 2, productId: 8, qtyRequested: 4, qtyApproved: 4, qtyPrepared: 4, qtyReceived: 4, unitCost: findProduct(8).cost_price },
  ];
  const req2SubmittedAt = hoursAgo(4);
  const req2DecidedAt = hoursAgo(3.5);
  const req2PreparingAt = hoursAgo(3);
  const req2ReadyAt = hoursAgo(2.5);
  const req2PickedUpAt = hoursAgo(2);
  const req2DeliveredAt = hoursAgo(1.5);
  const request2: DemoRefillRequest = {
    id: 2,
    uuid: 'seed-request-0002',
    code: `REF-${today.replace(/-/g, '')}-0002`,
    status: 'DELIVERED',
    version: 1,
    operatingDate: today,
    cartId: CART_0020_ID,
    staffId: GHOST_STAFF_BUDI_ID,
    staffName: 'Budi',
    kitchenId: KITCHEN_ID,
    evidencePhotoId: 2,
    evidencePhotoUrl: PLACEHOLDER_IMAGE_DATA_URI,
    gpsLat: LOCATIONS[2]!.lat,
    gpsLng: LOCATIONS[2]!.lng,
    gpsUnavailable: false,
    outOfHours: false,
    submittedAt: req2SubmittedAt,
    decidedAt: req2DecidedAt,
    financeId: USER_FINANCE_ID,
    decisionReason: null,
    baristaId: USER_BARISTA_ID,
    preparedAt: req2ReadyAt,
    shortfallReason: null,
    riderId: USER_RIDER_ID,
    pickedUpAt: req2PickedUpAt,
    deliveredAt: req2DeliveredAt,
    signatureId: 3,
    signatureUrl: PLACEHOLDER_IMAGE_DATA_URI,
    signatureMethod: 'staff_signature',
    lines: req2Lines,
    statusHistory: [
      { fromStatus: null, toStatus: 'SUBMITTED', actorId: GHOST_STAFF_BUDI_ID, actorName: 'Budi', actorRole: 'STAFF', reason: null, at: req2SubmittedAt },
      { fromStatus: 'SUBMITTED', toStatus: 'APPROVED', actorId: USER_FINANCE_ID, actorName: 'Sari Finance', actorRole: 'FINANCE', reason: null, at: req2DecidedAt },
      { fromStatus: 'APPROVED', toStatus: 'PREPARING', actorId: USER_BARISTA_ID, actorName: 'Dimas Barista', actorRole: 'BARISTA', reason: null, at: req2PreparingAt },
      { fromStatus: 'PREPARING', toStatus: 'READY_TO_PICK', actorId: USER_BARISTA_ID, actorName: 'Dimas Barista', actorRole: 'BARISTA', reason: null, at: req2ReadyAt },
      { fromStatus: 'READY_TO_PICK', toStatus: 'PICKED_UP', actorId: USER_RIDER_ID, actorName: 'Agus Rider', actorRole: 'RIDER', reason: null, at: req2PickedUpAt },
      { fromStatus: 'PICKED_UP', toStatus: 'DELIVERED', actorId: USER_RIDER_ID, actorName: 'Agus Rider', actorRole: 'RIDER', reason: null, at: req2DeliveredAt },
    ],
  };

  return {
    stockLedger,
    allocations,
    refillRequests: [request1, request2],
    notifications: [],
    nextIds: { stockLedger: ledgerId, allocation: 2, refill: 3, media: 4, notification: 1 },
  };
}
