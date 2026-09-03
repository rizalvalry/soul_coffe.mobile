import type { RefillStatus } from '@/theme';
import type { Role } from './roles';

export type { RefillStatus, Role };

export type Product = {
  id: number;
  code: string;
  name: string;
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
};

export type AttendanceRow = {
  id: number;
  operating_date: string;
  user_id: number;
  user_name: string | null;
  role: Role;
  clocked_in_at: string;
};
