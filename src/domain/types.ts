import type { RefillStatus } from '@/theme';
import type { Role } from './roles';

export type { RefillStatus, Role };

export type Product = {
  id: number;
  code: string;
  name: string;
  /**
   * The photo an administrator uploaded in the CMS, absolute and ready to fetch, or null.
   *
   * Null means "no photo", not "broken": the tiles fall back to the bundled artwork in
   * `domain/productImages.ts` and then to an icon, so a product added in the CMS this morning is
   * usable this morning whether or not anyone has photographed it yet.
   */
  image_url?: string | null;
  unit: string;
  is_sellable: boolean;
  sort_order: number;
  /** Present only for FINANCE and ADMINISTRATOR — stripped server-side otherwise (R15). */
  cost_price?: number;
  sell_price?: number;
};

export type Cart = {
  id: number;
  code: string;
  plate: string | null;
  status: 'active' | 'maintenance' | 'retired';
};

export type Location = {
  id: number;
  name: string;
  lat: number | null;
  lng: number | null;
};

export type StaffOnShift = {
  staff_id: number;
  staff_name: string;
  cart_id: number;
  cart_code: string;
  location_id: number | null;
  location_name: string | null;
  has_allocation: boolean;
  targets: { product_id: number; target_qty: number }[];
};

export type AllocationLine = {
  product_id: number;
  product_name: string;
  target_qty: number;
  qty_issued: number;
};

export type Allocation = {
  id: number;
  operating_date: string;
  cart_code: string;
  staff_name: string;
  location_name: string | null;
  /** Null against the real API: AllocationResource never loads/returns this relation
   *  (backend gap, not a client bug — see README's "Real backend" section). Always
   *  present in demo mode. */
  barista_name: string | null;
  status: 'ISSUED' | 'PENDING_FINANCE';
  over_target_pct: number;
  total_qty: number;
  is_correction: boolean;
  issued_at: string | null;
  lines: AllocationLine[];
};

export type RefillLine = {
  id: number;
  product_id: number;
  product_name: string;
  unit: string;
  qty_requested: number;
  qty_approved: number | null;
  qty_prepared: number | null;
  qty_received: number | null;
  /** FINANCE / ADMINISTRATOR only (R15). */
  unit_cost?: number;
  line_cost?: number;
};

export type RefillRequest = {
  id: number;
  code: string;
  status: RefillStatus;
  operating_date: string;
  cart_code: string;
  staff_name: string;
  staff_id: number;
  location_name: string | null;
  evidence_photo_url: string | null;
  gps_unavailable: boolean;
  out_of_hours: boolean;
  /** FINANCE / ADMINISTRATOR only (R15). */
  total_cost?: number;
  decision_reason: string | null;
  shortfall_reason: string | null;
  finance_name: string | null;
  barista_name: string | null;
  rider_name: string | null;
  signature_url: string | null;
  signature_method: 'staff_signature' | 'pin_fallback' | null;
  submitted_at: string;
  decided_at: string | null;
  prepared_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  total_requested: number;
  lines: RefillLine[];
  /** Server-computed capability flags — the client never infers permission itself. */
  can: {
    approve: boolean;
    reject: boolean;
    cancel: boolean;
    start_preparing: boolean;
    mark_ready: boolean;
    claim: boolean;
    deliver: boolean;
  };
};

export type CartStockRow = {
  product_id: number;
  product_name: string;
  unit: string;
  on_hand: number;
};

export type AppNotification = {
  id: number;
  event_id: string;
  type: string;
  title: string;
  body: string;
  refill_request_id: number | null;
  read_at: string | null;
  created_at: string;
};

export type BadgeCounts = {
  pendingApprovals: number;
  incomingRequests: number;
  readyToPick: number;
  myRequests: number;
};

/** One article in the in-app feed. Authored in the Filament panel by a CONTENT_CREATOR. */
export type NewsPost = {
  id: number;
  slug: string;
  title: string;
  /** The short, loud line above the title. Optional — the card drops the strip when absent. */
  kicker: string | null;
  excerpt: string | null;
  cover_url: string | null;
  tags: string[];
  /** Hex, set per-post in the CMS so a creator can re-theme a card without a new APK. */
  accent_color: string | null;
  is_highlighted: boolean;
  published_at: string | null;
  author_name: string | null;
  reaction_counts: Partial<Record<NewsReaction, number>>;
  my_reaction: NewsReaction | null;
  is_read: boolean;
  /** Only present on the detail response — the list deliberately omits it. */
  body?: string;
};

export const NEWS_REACTIONS = ['api', 'mantap', 'semangat', 'bingung'] as const;
export type NewsReaction = (typeof NEWS_REACTIONS)[number];

// ── Showcase stock (barista) ─────────────────────────────────────────────────

/** A staff member the barista can hand a cart to — see `GET /showcase/staff`. */
export type StaffPickerRow = {
  id: number;
  name: string;
  phone: string;
  /**
   * The cart this person is already on today, if any. R11 allows exactly one cart per staff per
   * day, so a non-null value here means picking them is a conflict — the picker says so up
   * front rather than letting it surface as a 422 after the cups are typed.
   */
  assigned_cart_id: number | null;
  assigned_cart_code: string | null;
};

/** The day's operational allowance for one cart (uang makan/minum). Whole rupiah, scale 0 (R9). */
export type DailyAllowance = {
  id: number;
  operating_date: string;
  cart_id: number;
  amount_minor: number;
  /** True once a barista has deliberately changed the amount away from the 00:00 default. */
  is_edited: boolean;
  set_by: number | null;
};

/** What `POST /showcase/hand-to-cart` returns — enough to refresh the screen with no second call. */
export type HandoverResult = {
  assignment_id: number;
  cart_id: number;
  cart_code: string;
  staff_id: number;
  staff_name: string;
  operating_date: string;
  allowance: DailyAllowance;
  cart_stock: CartStockRow[];
  showcase_stock: CartStockRow[];
};

// ── Absen ────────────────────────────────────────────────────────────────────

/**
 * Everything needed to render both absen buttons, decided server-side.
 *
 * The client deliberately does not re-derive these from role + timestamps: the gating rule
 * (barista clocks in, then opens, then staff may clock in) lives in one place on the server, and
 * a second copy here is a second place for it to be wrong.
 */
export type AttendanceStatus = {
  operating_date: string;
  has_clocked_in: boolean;
  clocked_in_at: string | null;
  staff_window_open: boolean;
  can_clock_in: boolean;
  can_open_staff_window: boolean;
  /** Ready-to-display copy for a disabled button; null when nothing is blocking. */
  blocked_reason: string | null;
  /**
   * Where this person must be standing to clock in today.
   *
   * Absen is the one action in this app that a GPS reading can stop (everywhere else a missing
   * fix is only evidence, E10), so the rule is sent to the client BEFORE the button is pressed —
   * being refused is a bad way to learn where you were supposed to stand.
   *
   * `enforced: false` covers three ordinary cases and the app should say nothing special about
   * any of them: the kitchen has no map pin, this cart has an exemption, or the rule is switched
   * off entirely.
   */
  geofence: {
    enforced: boolean;
    /** kitchen | selling_location | exempt | untagged | disabled */
    basis: string;
    lat: number | null;
    lng: number | null;
    radius_m: number;
    label: string | null;
    exemption_reason: string | null;
  };
};

export type AttendanceRow = {
  id: number;
  operating_date: string;
  user_id: number;
  user_name: string | null;
  role: Role;
  clocked_in_at: string;
};

// ── Penjualan gerobak ────────────────────────────────────────────────────────

export type SaleLine = {
  product_id: number;
  product_name: string | null;
  qty: number;
  /** The price pinned at the moment of the transaction (R10), in whole rupiah. */
  unit_price: number;
  subtotal: number;
};

/**
 * One recorded transaction.
 *
 * `is_suspect` is deliberately NOT part of this type even though the API returns it. The flag is
 * addressed to Administrator and Finance; showing a staff member "you look suspicious" would be
 * both an accusation and a hint about how to stay under the threshold next time.
 */
export type Sale = {
  id: number;
  uuid: string;
  operating_date: string;
  occurred_at: string;
  cart_code: string | null;
  location_name: string | null;
  total_qty: number;
  total_amount: number;
  payment_method: PaymentMethod;
  note: string | null;
  lines: SaleLine[];
};

export const PAYMENT_METHODS = ['cash', 'qris', 'transfer'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// ── Insiden pengiriman ───────────────────────────────────────────────────────

export type IncidentStatus = 'REPORTED' | 'RESOLVED_CANCELLED' | 'RESOLVED_PARTIAL';

/**
 * Cups damaged on the way to a cart.
 *
 * The rider files it; Finance or an Administrator decides. Everything from `decided_by` onwards
 * is null until then, which is exactly what the rider is waiting to see.
 */
export type DeliveryIncident = {
  id: number;
  uuid: string;
  refill_request_id: number;
  refill_code: string | null;
  cart_code: string | null;
  rider_name: string | null;
  reported_at: string;
  note: string | null;
  status: IncidentStatus;
  status_label: string;
  photo_url: string | null;
  damaged_qty: number;
  written_off_qty: number;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  lines: {
    line_id: number;
    product_id: number;
    product_name: string | null;
    qty_damaged: number;
  }[];
};

// ── Setoran (finance) ────────────────────────────────────────────────────────

/** One cart in today's deposit queue. `settlement_id` null means Finance is still waiting. */
export type SettlementQueueRow = {
  cart_id: number;
  cart_code: string | null;
  staff_id: number | null;
  staff_name: string | null;
  area: string | null;
  transactions: number;
  cups_sold: number;
  /** Whole rupiah, from the transactions themselves. */
  expected_total: number;
  cups_remaining: number;
  settlement_id: number | null;
  settlement_status: string | null;
};

export type SettlementDraftLine = {
  product_id: number;
  product_name: string;
  unit: string;
  qty_issued: number;
  qty_sold: number;
  /** Live cart stock, not a snapshot — this is what the disposition is measured against. */
  qty_remaining: number;
};

/**
 * What the deposit form already knows before Finance types anything.
 *
 * The only field a human supplies is the money. Everything here is computed from the ledger and
 * the day's transactions, because asking a queue of staff to recite numbers the database holds is
 * how a reconciliation turns into an argument about arithmetic.
 */
export type SettlementDraft = {
  cart_id: number;
  cart_code: string;
  operating_date: string;
  staff_id: number | null;
  staff_name: string | null;
  area: string | null;
  expected_total: number;
  lines: SettlementDraftLine[];
};

export type Settlement = {
  id: number;
  operating_date: string;
  cart_id: number;
  cart_code: string | null;
  staff_id: number | null;
  staff_name: string | null;
  status: 'SUBMITTED' | 'RECONCILED' | 'VARIANCE_FLAGGED';
  cash: number;
  qris: number;
  transfer: number;
  declared_total: number;
  expected_total: number;
  /** Signed: positive is a surplus, negative a shortfall. Both need explaining. */
  variance: number;
  variance_reason: string | null;
  reconciled_by: string | null;
  reconciled_at: string | null;
  lines: {
    product_id: number;
    product_name: string | null;
    qty_issued: number;
    qty_sold: number;
    qty_remaining: number;
    qty_wasted: number;
    variance_qty: number;
  }[];
};
