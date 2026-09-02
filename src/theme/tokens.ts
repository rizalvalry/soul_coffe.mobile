/**
 * SOUL COFFEEMATE — design tokens
 *
 * Brand teal #00A3AA was sampled from the official logo (figma/soul.png), not chosen by eye.
 *
 * ACCESSIBILITY RULE — read before using any teal:
 *   #00A3AA has a contrast ratio of only 3.08:1 against white. That FAILS WCAG AA (4.5:1)
 *   for normal-size text in both directions. So:
 *     - brand[500] (#00A3AA) is for IDENTITY  — logo, large headings, icons, borders, accents
 *     - brand[700] (#007277) is for TEXT/FILL — 5.72:1 on white, safe for white button labels
 *   Never put white body text on brand[500]. Never put brand[500] text on white.
 *
 * These users work outdoors, in daylight, on inexpensive Android screens. A palette that only
 * passes indoors is not accessible in the field.
 */

/** Teal ramp derived from the logo colour by linear mixing with white (tints) and black (shades). */
export const brand = {
  50: '#EBF8F8',
  100: '#D9F1F2',
  200: '#B3E3E6',
  300: '#8CD6D9',
  400: '#4DBFC4',
  500: '#00A3AA', // ← the logo colour. Identity only; not for body text on white.
  600: '#008E94',
  700: '#007277', // ← 5.72:1 on white. Button fills, links, text.
  800: '#005A5E',
  900: '#004144',
  950: '#00292B',
} as const;

/** Neutral ramp anchored on the logo's dark #212121. */
export const neutral = {
  0: '#FFFFFF',
  50: '#FAFAFA',
  100: '#F4F4F5',
  200: '#E4E4E7',
  300: '#D4D4D8',
  400: '#A1A1AA',
  500: '#71717A',
  600: '#52525B',
  700: '#3F3F46',
  800: '#2A2A2E',
  900: '#212121', // logo dark
  950: '#121214',
} as const;

/** Feedback colours. Every foreground value clears 4.5:1 on its paired background. */
export const feedback = {
  successFg: '#15803D',
  successBg: '#DCFCE7',
  successBorder: '#86EFAC',

  warningFg: '#B45309',
  warningBg: '#FEF3C7',
  warningBorder: '#FCD34D',

  dangerFg: '#B91C1C',
  dangerBg: '#FEE2E2',
  dangerBorder: '#FCA5A5',

  infoFg: '#0369A1',
  infoBg: '#E0F2FE',
  infoBorder: '#7DD3FC',
} as const;

export const semantic = {
  bg: neutral[50],
  surface: neutral[0],
  surfaceSunken: neutral[100],

  border: neutral[200],
  borderStrong: neutral[300],

  text: neutral[900],
  textMuted: neutral[500],
  textSubtle: neutral[400],
  textInverse: neutral[0],

  primary: brand[700], // fills and text — AA safe
  primaryPressed: brand[800],
  primaryDisabled: neutral[300],
  accent: brand[500], // identity only — icons, borders, large type
  accentSoft: brand[50],

  focusRing: brand[500],
  overlay: 'rgba(18,18,20,0.55)',
} as const;

/**
 * Refill request status colours — one per state in the §6 state machine.
 * Keys mirror the server enum exactly so a status never renders as "unknown".
 */
export const statusColor = {
  SUBMITTED: { fg: feedback.warningFg, bg: feedback.warningBg, border: feedback.warningBorder },
  APPROVED: { fg: brand[700], bg: brand[50], border: brand[200] },
  REJECTED: { fg: feedback.dangerFg, bg: feedback.dangerBg, border: feedback.dangerBorder },
  PREPARING: { fg: feedback.infoFg, bg: feedback.infoBg, border: feedback.infoBorder },
  READY_TO_PICK: { fg: '#4338CA', bg: '#E0E7FF', border: '#A5B4FC' },
  PICKED_UP: { fg: '#0369A1', bg: '#E0F2FE', border: '#7DD3FC' },
  DELIVERED: { fg: feedback.successFg, bg: feedback.successBg, border: feedback.successBorder },
  CLOSED: { fg: neutral[600], bg: neutral[100], border: neutral[200] },
  CANCELLED: { fg: neutral[500], bg: neutral[100], border: neutral[200] },
  EXPIRED: { fg: neutral[500], bg: neutral[100], border: neutral[200] },
} as const;

export type RefillStatus = keyof typeof statusColor;

/** 4pt spacing scale. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/**
 * Type scale. Minimum body size is 15 — deliberately larger than a typical 14, because this
 * app is read at arm's length in sunlight.
 */
export const type = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '700' },
  h1: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  h2: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  h3: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  micro: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
} as const;

/**
 * Ergonomics for field use. Android's accessibility minimum is 48dp; controls here are larger
 * because the app is used one-handed, sometimes with wet or gloved hands.
 */
export const touch = {
  minTarget: 48,
  buttonHeight: 52,
  inputHeight: 52,
  tileMinHeight: 96,
} as const;

/** Android elevation, kept shallow — heavy shadows read as muddy on low-end panels. */
export const elevation = {
  none: { elevation: 0 },
  sm: { elevation: 1 },
  md: { elevation: 3 },
  lg: { elevation: 6 },
} as const;

export const tokens = {
  brand,
  neutral,
  feedback,
  semantic,
  statusColor,
  space,
  radius,
  type,
  touch,
  elevation,
} as const;

export type Tokens = typeof tokens;
