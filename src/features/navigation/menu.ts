import type { Role } from '@/domain/roles';
import type { SitemapType } from 'expo-router';

/**
 * The role-driven application menu.
 *
 * This is the single source of truth for what each role can reach. One config, one renderer —
 * adding a screen means adding a row here, never duplicating a menu component per role.
 *
 * `requirement` traces every entry back to docs/02-context-business-process.md so no menu item
 * exists without a business reason, and no business requirement lacks a way in.
 *
 * IMPORTANT: this menu is a convenience, not a security boundary. The server enforces every
 * permission (R1, §2.1). A menu item the server rejects must still be rejected.
 */
export type MenuItem = {
  id: string;
  label: string;
  sublabel: string;
  icon: string;
  route: string;
  /** Traceability back to the spec. */
  requirement: string;
  /** Which live counter, if any, badges this tile. */
  badge?: 'pendingApprovals' | 'incomingRequests' | 'readyToPick' | 'myRequests' | 'pendingSync';
  /** Marks the primary action for the role — rendered larger and first. */
  primary?: boolean;
};

/**
 * WHY THERE IS NO "ALOKASI" ENTRY ANY MORE
 * ---------------------------------------
 * There were two: a barista typed the morning allocation, and a staff member then read it back.
 * Both were removed on 2026-09-10 because "Add Stock" already does the same job as a side effect
 * of the thing the barista has to do anyway — handing cups over records the movement, writes the
 * day's allowance, and puts the cart on today's roster. Asking for the same numbers a second time
 * in a separate screen was two people's work for one fact, and the fact was already recorded.
 * Finance's "Approval Alokasi" went with them: it existed only to approve an over-target
 * allocation that nothing creates now.
 */

const roleMenus: Record<Role, MenuItem[]> = {
  ADMINISTRATOR: [
    {
      id: 'admin-users',
      label: 'Pengguna & Role',
      sublabel: 'Tambah, ubah, dan nonaktifkan akun',
      icon: 'account-multiple-outline',
      route: '/admin/users',
      requirement: '§2 Roles',
      primary: true,
    },
    {
      id: 'admin-products',
      label: 'Produk & Harga',
      sublabel: '11 produk, HPP & harga jual berversi',
      icon: 'coffee-outline',
      route: '/admin/products',
      requirement: '§3.1, R10',
    },
    {
      id: 'admin-carts',
      label: 'Coffee Bike',
      sublabel: 'Kode sepeda, plat, status unit',
      icon: 'moped-outline',
      route: '/admin/carts',
      requirement: '§3.2',
    },
    {
      id: 'admin-locations',
      label: 'Lokasi Berjualan',
      sublabel: 'Titik jualan & radius geofence',
      icon: 'map-marker-outline',
      route: '/admin/locations',
      requirement: '§3.2',
    },
    {
      id: 'admin-targets',
      label: 'Target Harian',
      sublabel: 'Standarisasi jumlah cups per titik',
      icon: 'target',
      route: '/admin/targets',
      requirement: 'req 1, §3.2',
    },
    {
      id: 'admin-audit',
      label: 'Audit Trail',
      sublabel: 'Riwayat lengkap setiap perubahan status',
      icon: 'history',
      route: '/admin/audit',
      requirement: 'R8',
    },
    {
      id: 'admin-reports',
      label: 'Laporan',
      sublabel: 'Konsumsi, frekuensi refill, performa rider',
      icon: 'chart-box-outline',
      route: '/admin/reports',
      requirement: 'Phase 8.4',
    },
  ],

  FINANCE: [
    {
      id: 'finance-approvals',
      label: 'Approval Refill',
      sublabel: 'Permintaan menunggu keputusan Anda',
      icon: 'clipboard-check-outline',
      route: '/finance/approvals',
      requirement: 'req 4',
      badge: 'pendingApprovals',
      primary: true,
    },
    {
      id: 'finance-history',
      label: 'Riwayat Approval',
      sublabel: 'Semua keputusan beserta alasannya',
      icon: 'text-box-check-outline',
      route: '/finance/history',
      requirement: 'R8',
    },
    {
      id: 'finance-settlements',
      label: 'Setoran',
      sublabel: 'Terima uang harian & pisahkan cups sisa',
      icon: 'cash-register',
      route: '/finance/settlements',
      requirement: 'Flow C — setoran harian per Coffee Bike',
    },
    {
      id: 'finance-clearing',
      label: 'Dana QRIS/transfer masuk',
      sublabel: 'Catat dana bank dan cek saldo kliring',
      icon: 'bank-transfer-in',
      route: '/finance/clearing',
      requirement: 'T-050 L-3 — kliring QRIS/transfer',
    },
    {
      id: 'finance-reports',
      label: 'Laporan Biaya',
      sublabel: 'Nilai total permintaan per periode',
      icon: 'file-chart-outline',
      route: '/finance/reports',
      requirement: 'req 4, R10',
    },
  ],

  // The shared Finance menu is assigned below after shared items are appended.
  MANAGEMENT: [],

  BARISTA: [
    // First and primary, per the brief: the "+" the barista reaches for every morning.
    {
      id: 'barista-brew',
      label: 'Brew',
      sublabel: 'Seduh kopi ke stok dapur',
      icon: 'coffee-maker-outline',
      route: '/barista/brew',
      requirement: 'Produksi ke stok dapur',
    },
    {
      id: 'barista-allocations',
      label: 'Alokasi Tambahan',
      sublabel: 'Tambahkan stok ke Coffee Bike yang sudah bertugas',
      icon: 'package-variant-plus',
      route: '/barista/allocations',
      requirement: 'Flow A — alokasi tambahan',
    },
    {
      id: 'barista-add-stock',
      label: 'Add Stock',
      sublabel: 'Pindahkan cups showcase → Coffee Bike + uang harian',
      icon: 'plus-circle-outline',
      route: '/barista/add-stock',
      requirement: 'Showcase — centralize stock',
      primary: true,
    },
    {
      id: 'barista-absen',
      label: 'Absen',
      sublabel: 'Absen sendiri, lalu buka absen untuk rider',
      icon: 'fingerprint',
      route: '/absen',
      requirement: 'Absen — Produksi membuka akses rider',
    },
    {
      id: 'barista-requests',
      label: 'Permintaan Refill',
      sublabel: 'Masuk dari rider — perlu approval Finance',
      icon: 'bell-ring-outline',
      route: '/barista/requests',
      requirement: 'req 2, req 4',
      badge: 'incomingRequests',
    },
    {
      id: 'barista-preparing',
      label: 'Siapkan Pesanan',
      sublabel: 'Hanya yang sudah di-approve Finance',
      icon: 'coffee-maker-outline',
      route: '/barista/preparing',
      requirement: 'req 5, R1',
    },
    {
      id: 'barista-stock',
      label: 'Stok Dapur',
      sublabel: 'Ketersediaan bahan & cups siap',
      icon: 'fridge-outline',
      route: '/barista/stock',
      requirement: 'R6',
    },
    {
      id: 'barista-history',
      label: 'Riwayat',
      sublabel: 'Alokasi & penyiapan sebelumnya',
      icon: 'history',
      route: '/barista/history',
      requirement: 'R8',
    },
  ],

  RIDER: [
    {
      id: 'rider-available',
      label: 'Siap Diambil',
      sublabel: 'Pesanan siap antar dari dapur',
      icon: 'package-variant-closed',
      route: '/rider/available',
      requirement: 'req 6',
      badge: 'readyToPick',
      primary: true,
    },
    {
      id: 'rider-active',
      label: 'Pengiriman Saya',
      sublabel: 'Sedang diantar — selesaikan dengan paraf rider',
      icon: 'motorbike',
      route: '/rider/active',
      requirement: 'req 6, req 7',
    },
    {
      id: 'rider-history',
      label: 'Riwayat Pengiriman',
      sublabel: 'Bukti terima & tanda tangan tersimpan',
      icon: 'clipboard-text-clock-outline',
      route: '/rider/history',
      requirement: 'R5, R8',
    },
  ],

  STAFF: [
    // One end-of-day entry after Rider sells from the cart.
    {
      id: 'staff-closing',
      label: 'Closing',
      sublabel: 'Isi sisa cups pas selesai jualan',
      icon: 'clipboard-check-outline',
      route: '/staff/closing',
      requirement: 'Closing Cups — sisa, rusak, QRIS, transfer',
      primary: true,
    },
    {
      id: 'staff-refill-new',
      label: 'Request Refill',
      sublabel: 'Isi jumlah cups + foto bukti frozen Coffee Bike',
      icon: 'plus-box-outline',
      route: '/staff/refill/new',
      requirement: 'req 2, R3',
    },
    // The button here stays disabled until a barista has clocked in and opened absen — the
    // screen reads that from the server rather than deciding it locally.
    {
      id: 'staff-absen',
      label: 'Absen',
      sublabel: 'Aktif setelah Produksi membuka absen',
      icon: 'fingerprint',
      route: '/absen',
      requirement: 'Absen — dibuka oleh Produksi',
    },
    {
      id: 'staff-requests',
      label: 'Status Permintaan',
      sublabel: 'Pantau approval, penyiapan & pengiriman',
      icon: 'progress-clock',
      route: '/staff/requests',
      requirement: 'req 3',
      badge: 'myRequests',
    },
    {
      id: 'staff-stock',
      label: 'Stok Coffee Bike',
      sublabel: 'Sisa cups per produk saat ini',
      icon: 'cup-outline',
      route: '/staff/stock',
      requirement: 'R6',
    },
    {
      id: 'staff-settlement',
      label: 'Setoran Harian',
      sublabel: 'Terjual, sisa, cash / QRIS / transfer',
      icon: 'cash-multiple',
      route: '/staff/settlement',
      requirement: 'Flow C, Q1',
    },
  ],
  CONTENT_CREATOR: [
    {
      id: 'creator-feed',
      label: 'News Feed',
      sublabel: 'Lihat artikel seperti yang dibaca tim',
      icon: 'newspaper-variant-outline',
      route: '/news',
      requirement: 'News Feed',
      primary: true,
    },
    {
      id: 'creator-studio',
      label: 'Tulis Artikel',
      sublabel: 'Dibuka di panel web Soul Coffeemate',
      icon: 'pencil-outline',
      route: '/creator/studio',
      requirement: 'News Feed — CMS',
    },
  ],
};

/**
 * Entries every role gets, appended rather than repeated six times.
 *
 * Settings is universal because the sign-in PIN it manages is an account-level convenience, not a
 * role capability — a Runner needs it exactly as much as a rider does. News is universal
 * because the server already decides who sees which article, by `audience_roles`: duplicating
 * that decision in the client menu would only create a second place for it to be wrong.
 *
 * Appending also means a future shared screen cannot be added to five roles and forgotten on the
 * sixth, which is precisely the gap six hand-maintained arrays produce.
 */
const SHARED_ITEMS: MenuItem[] = [
  {
    id: 'news',
    label: 'News Feed',
    sublabel: 'Kabar, promo & tips dari tim konten',
    icon: 'newspaper-variant-outline',
    route: '/news',
    requirement: 'News Feed',
  },
  {
    id: 'settings',
    label: 'Pengaturan',
    sublabel: 'PIN masuk dan info akun',
    icon: 'cog-outline',
    route: '/settings',
    requirement: '§14 Q8 — akses perangkat',
  },
];

export const menuByRole: Record<Role, MenuItem[]> = Object.fromEntries(
  Object.entries(roleMenus).map(([role, items]) => {
    // A role that already lists a shared route keeps its own entry — CONTENT_CREATOR puts News
    // first as its primary tile, and appending the shared copy would show it the same screen
    // twice.
    const own = new Set(items.map((item) => item.route));
    return [role, [...items, ...SHARED_ITEMS.filter((item) => !own.has(item.route))]];
  }),
) as Record<Role, MenuItem[]>;

menuByRole.MANAGEMENT = [
  ...menuByRole.FINANCE,
  {
    id: 'management-rider-location-setup',
    label: 'Setup Lokasi Rider',
    sublabel: 'Atur titik jualan, absen, dan Closing Rider',
    icon: 'map-marker-account-outline',
    route: '/management/rider-location-setup',
    requirement: 'T-049 P-0 sampai P-5',
  },
];

const administratorRoutes = new Set(menuByRole.ADMINISTRATOR.map((item) => item.route));
menuByRole.ADMINISTRATOR = [
  ...menuByRole.ADMINISTRATOR,
  ...menuByRole.MANAGEMENT.filter((item) => !administratorRoutes.has(item.route)),
];

type AccessUser = { role: Role; abilities?: Record<string, string[]>; isSuperAdmin?: boolean };

const BACK_OFFICE: Record<string, [string, string]> = {
  '/admin/users': ['users', 'view'],
  '/admin/products': ['products', 'view'],
  '/admin/carts': ['carts', 'view'],
  '/admin/locations': ['locations', 'view'],
  '/admin/targets': ['daily_targets', 'view'],
  '/admin/audit': ['audit_logs', 'view'],
  '/admin/reports': ['reports', 'view'],
  '/finance/approvals': ['refill_approval', 'edit'],
  '/finance/history': ['refill_approval', 'view'],
  '/finance/settlements': ['settlements', 'view'],
  '/finance/clearing': ['clearing', 'view'],
  '/finance/reports': ['reports', 'view'],
  '/management/rider-location-setup': ['rider_location_setup', 'edit'],
};

export function canUse(user: AccessUser, module: string, ability: string = 'view'): boolean {
  return user.isSuperAdmin === true || user.abilities?.[module]?.includes(ability) === true;
}

/** Field flow remains role based; back office routes come from the effective server grants. */
export function menuForUser(user: AccessUser): MenuItem[] {
  const baristaReadRoutes = new Set(['/barista/stock', '/barista/requests', '/barista/history']);
  const ownFlow = menuByRole[user.role].filter((item) => !BACK_OFFICE[item.route]
    && (user.role !== 'BARISTA' || !item.route.startsWith('/barista/')
      || (canUse(user, 'kitchen_operations', 'view')
        && (baristaReadRoutes.has(item.route) || canUse(user, 'kitchen_operations', 'edit')))));
  const seen = new Set(ownFlow.map((item) => item.route));
  const granted: MenuItem[] = [];
  for (const item of [...menuByRole.FINANCE, ...menuByRole.MANAGEMENT, ...menuByRole.ADMINISTRATOR]) {
    const requirement = BACK_OFFICE[item.route];
    if (!requirement || seen.has(item.route) || !canUse(user, requirement[0], requirement[1])) continue;
    seen.add(item.route);
    granted.push(item);
  }
  const kitchenTile: MenuItem[] = user.role !== 'BARISTA'
    && canUse(user, 'kitchen_operations', 'view') && canUse(user, 'kitchen_operations', 'edit')
    ? [{ id: 'kitchen-operations', label: 'Produksi', sublabel: 'Pilih dapur dan jalankan alur Produksi',
      icon: 'coffee-maker-outline', route: '/barista', requirement: 'T-058', primary: true }]
    : [];
  const closeOutTile: MenuItem[] = canUse(user, 'cart_close_out', 'view')
    && canUse(user, 'cart_close_out', 'edit')
    ? [{ id: 'cart-close-out', label: 'Tutup Coffee Bike', sublabel: 'Hitung sisa cups dan reject di dapur',
      icon: 'clipboard-check-outline', route: '/kitchen/close-out', requirement: 'T-071',
      primary: user.role === 'RIDER' }]
    : [];
  const rejectTile: MenuItem[] = canUse(user, 'kitchen_reject', 'create')
    ? [{ id: 'kitchen-reject', label: 'Catat Reject', sublabel: 'Catat cups rusak di showcase',
      icon: 'cup-off-outline', route: '/kitchen/reject', requirement: 'T-074',
      primary: user.role === 'BARISTA' }]
    : [];
  return [...rejectTile, ...closeOutTile, ...ownFlow, ...kitchenTile, ...granted];
}

/** Expo Router's sitemap follows the actual app/ files, so a newly added screen needs no menu edit. */
export function menuItemsWithScreens(items: MenuItem[], sitemap: SitemapType | null): MenuItem[] {
  if (!sitemap) return [];

  const routes = new Set<string>();
  const visit = (node: SitemapType) => {
    if (!node.isGenerated && !node.isInternal && /\.[jt]sx?$/.test(node.contextKey)) {
      const segments = node.contextKey
        .replace(/^\.\//, '')
        .replace(/\.[jt]sx?$/, '')
        .split('/')
        .filter((segment) => segment !== 'index' && !/^\(.+\)$/.test(segment));
      if (!segments.some((segment) => segment.startsWith('_') || segment.startsWith('+'))) {
        routes.add(`/${segments.join('/')}`);
      }
    }
    node.children.forEach(visit);
  };
  visit(sitemap);

  return items.filter((item) => routes.has(item.route));
}
