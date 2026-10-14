/**
 * Employee roles in business priority order.
 * Order here IS the business priority order — do not re-sort for aesthetics.
 *
 * Reference: docs/02-context-business-process.md §2
 */
export const ROLES = [
  'ADMINISTRATOR',
  'MANAGEMENT',
  'FINANCE',
  'BARISTA',
  'RIDER',
  'STAFF',
  'CONTENT_CREATOR',
] as const;

export type Role = (typeof ROLES)[number];

export type RoleMeta = {
  /** Business priority, 1 = highest. */
  priority: number;
  /** Indonesian label shown in the UI. Users are Indonesian field staff. */
  label: string;
  /** One-line description of what this role does, in Indonesian. */
  description: string;
  /** MaterialCommunityIcons glyph name. */
  icon: string;
  /** Landing route after login. */
  home: string;
};

export const roleMeta: Record<Role, RoleMeta> = {
  ADMINISTRATOR: {
    priority: 1,
    label: 'Administrator',
    description: 'Kelola pengguna, produk, gerobak, lokasi & target',
    icon: 'shield-account',
    home: '/menu',
  },
  MANAGEMENT: {
    priority: 2,
    label: 'Management',
    description: 'Hak Finance serta laporan Management dan payroll di CMS',
    icon: 'briefcase-account-outline',
    home: '/menu',
  },
  FINANCE: {
    priority: 3,
    label: 'Finance',
    description: 'Approval permintaan refill & rekonsiliasi setoran',
    icon: 'cash-check',
    home: '/menu',
  },
  BARISTA: {
    priority: 4,
    label: 'Barista',
    description: 'Alokasi harian & penyiapan cups di dapur',
    icon: 'coffee-maker',
    home: '/menu',
  },
  RIDER: {
    priority: 5,
    label: 'Runner',
    description: 'Antar cups yang sudah siap ke rider di lapangan',
    icon: 'motorbike',
    home: '/menu',
  },
  STAFF: {
    priority: 6,
    label: 'Rider',
    description: 'Berjualan di gerobak & request refill cups',
    icon: 'storefront',
    home: '/menu',
  },
  // Writes the in-app news feed and touches no part of the operational flow, which is why it
  // sits last rather than anywhere in the hierarchy above.
  CONTENT_CREATOR: {
    priority: 7,
    label: 'Content Creator',
    description: 'Menulis artikel & kabar untuk seluruh tim',
    icon: 'pencil-outline',
    home: '/menu',
  },
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Roles sorted by business priority. */
export const rolesByPriority = [...ROLES].sort((a, b) => roleMeta[a].priority - roleMeta[b].priority);
