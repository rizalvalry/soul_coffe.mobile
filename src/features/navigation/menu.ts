import type { Role } from '@/domain/roles';

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
 * Routes that actually have a screen behind them right now.
 *
 * Kept as one explicit list rather than a per-item flag so there is a single place to check
 * against `find app -name '*.tsx'`. Anything not listed here routes to `coming-soon`, which
 * names the route and its requirement instead of rendering a misleading blank screen.
 *
 * Remove an entry from this list only by deleting its screen.
 */
export const IMPLEMENTED_ROUTES: ReadonlySet<string> = new Set([
  '/staff/refill/new',
  '/staff/requests',
  '/staff/allocation',
  '/staff/stock',
  '/finance/approvals',
  '/finance/history',
  '/barista/allocation',
  '/barista/requests',
  '/barista/preparing',
  '/barista/stock',
  '/barista/history',
  '/rider/available',
  '/rider/active',
  '/rider/history',
  '/settings',
]);

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
      label: 'Gerobak',
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
      id: 'admin-assignments',
      label: 'Penugasan Staff',
      sublabel: 'Staff ↔ gerobak ↔ lokasi per hari',
      icon: 'account-switch-outline',
      route: '/admin/assignments',
      requirement: 'R11',
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
      id: 'finance-allocation-approvals',
      label: 'Approval Alokasi',
      sublabel: 'Alokasi pagi yang melebihi target +20%',
      icon: 'alert-decagram-outline',
      route: '/finance/allocation-approvals',
      requirement: 'Q2, Flow A',
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
      label: 'Rekonsiliasi Setoran',
      sublabel: 'Cash, QRIS, transfer & selisih stok',
      icon: 'cash-register',
      route: '/finance/settlements',
      requirement: 'Flow C, Q1',
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

  BARISTA: [
    {
      id: 'barista-allocation',
      label: 'Alokasi Harian',
      sublabel: 'Input stock cups pagi & tetapkan lokasi',
      icon: 'clipboard-list-outline',
      route: '/barista/allocation',
      requirement: 'req 1, Flow A',
      primary: true,
    },
    {
      id: 'barista-requests',
      label: 'Permintaan Refill',
      sublabel: 'Masuk dari staff — perlu approval Finance',
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
      sublabel: 'Sedang diantar — selesaikan dengan paraf staff',
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
    {
      id: 'staff-refill-new',
      label: 'Request Refill',
      sublabel: 'Isi jumlah cups + foto bukti frozen gerobak',
      icon: 'plus-box-outline',
      route: '/staff/refill/new',
      requirement: 'req 2, R3',
      primary: true,
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
      id: 'staff-allocation',
      label: 'Alokasi Hari Ini',
      sublabel: 'Surat pengambilan barang & lokasi tugas',
      icon: 'clipboard-list-outline',
      route: '/staff/allocation',
      requirement: 'req 1, §4',
    },
    {
      id: 'staff-stock',
      label: 'Stok Gerobak',
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
};

/**
 * Entries every role gets, appended rather than repeated five times.
 *
 * Settings is universal on purpose: the sign-in PIN it manages is an account-level convenience,
 * not a role capability, and a Rider needs it exactly as much as a staff member does. Appending
 * here also means a future shared screen cannot be added to four roles and forgotten on the
 * fifth — which is precisely the kind of gap five hand-maintained arrays produce.
 */
const SHARED_ITEMS: MenuItem[] = [
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
  Object.entries(roleMenus).map(([role, items]) => [role, [...items, ...SHARED_ITEMS]]),
) as Record<Role, MenuItem[]>;
