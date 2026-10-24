/**
 * SOUL COFFEEMATE — design tokens
 *
 * Brand actions use #007277 for readable text and white button labels. The brighter logo teal
 * remains available for identity artwork, never small text on white.
 */

/** Teal ramp. Existing numeric stops stay available to every screen. */
export const brand = {
  50: '#E3F3F2',
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

/** Warm neutral surfaces from the v2 prototype. */
export const neutral = {
  0: '#FFFFFF',
  50: '#FBF8F3',
  100: '#F4F0E9',
  200: '#ECE7DF',
  300: '#D8D0C6',
  400: '#899397',
  500: '#5F6B70',
  600: '#4A565B',
  700: '#39454A',
  800: '#2B363A',
  900: '#1F2A2E',
  950: '#121C20',
} as const;

/** Amber highlight; dark ink is for text, bright stops are for fills. */
export const accent = {
  50: '#FFF1D6',
  100: '#FFE6B5',
  300: '#FFB547',
  400: '#F9A934',
  500: '#E98B16',
  600: '#5C3B00',
} as const;

/** Feedback colours. Every foreground value clears 4.5:1 on its paired background. */
export const feedback = {
  successFg: '#11694F',
  successBg: '#DDF3EC',
  successBorder: '#A4D9C6',

  warningFg: accent[600],
  warningBg: accent[50],
  warningBorder: '#F6D48D',

  dangerFg: '#B42318',
  dangerBg: '#FDECEC',
  dangerBorder: '#F3B6B0',

  infoFg: '#2952CC',
  infoBg: '#E4EEFF',
  infoBorder: '#B4C9F8',

  purpleFg: '#6B35B8',
  purpleBg: '#F0E7FF',
  purpleBorder: '#D0B8EF',
} as const;

export const semantic = {
  bg: neutral[50],
  surface: neutral[0],
  surfaceSunken: neutral[100],

  border: neutral[200],
  borderStrong: neutral[300],

  text: neutral[900],
  textMuted: neutral[500],
  textSubtle: neutral[500],
  textInverse: neutral[0],

  primary: brand[700], // fills and text — AA safe
  primaryPressed: brand[800],
  primaryDisabled: neutral[300],
  accent: accent[300],
  accentSoft: accent[50],

  focusRing: brand[500],
  overlay: 'rgba(18,28,32,0.55)',
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
  READY_TO_PICK: { fg: feedback.purpleFg, bg: feedback.purpleBg, border: feedback.purpleBorder },
  PICKED_UP: { fg: feedback.infoFg, bg: feedback.infoBg, border: feedback.infoBorder },
  DELIVERED: { fg: feedback.successFg, bg: feedback.successBg, border: feedback.successBorder },
  CLOSED: { fg: neutral[600], bg: neutral[100], border: neutral[200] },
  CANCELLED: { fg: neutral[500], bg: neutral[100], border: neutral[200] },
  EXPIRED: { fg: neutral[500], bg: neutral[100], border: neutral[200] },
} as const;

export type RefillStatus = keyof typeof statusColor;

/** Product pairs from the v2 prototype, with matching warm pairs for the other current products. */
export const productColor = {
  'Soul Latte': { bg: '#F8E6D4', fg: '#8A5A2B' },
  'Soul Coffee': { bg: '#EFE2D8', fg: '#5B3A29' },
  Kopsu: { bg: '#FCEBD9', fg: '#9A4D12' },
  Thaitea: { bg: '#FFE3D1', fg: '#B5400B' },
  'Soul Matcha': { bg: '#E2F2DC', fg: '#2F6B2A' },
  'Soul Chocolate': { bg: '#EEDFD6', fg: '#5A3325' },
  'Lechee Tea': { bg: '#FCE6EE', fg: '#A3214F' },
  'Cytrus Cold Brew': { bg: '#FFF2C7', fg: '#7A5C00' },
  'Passion Coldbrew': { bg: '#F9E5D8', fg: '#8B452C' },
  'Butterscotch SeaSalt Cream': { bg: '#F8EBCF', fg: '#765018' },
} as const;

/**
 * Gradient stop sets rendered by the existing JS Gradient component.
 */
export const gradients = {
  /** The signature brand wash — hero headers, the primary action tile, the login backdrop. */
  brand: ['#0A4F4D', '#0E7C77'],
  track: ['#1E3A8A', '#2F5BEA'],
  /** The rationed amber, for the one element that must be found first. */
  amber: ['#FFB547', '#E98B16'],
} as const;

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

/** Larger cards and pill controls from the v2 prototype. */
export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  card: 24,
  xl: 28,
  hero: 28,
  pill: 999,
} as const;

/** The names match the loaded font assets in app/_layout.tsx. */
export const fontFamily = {
  medium: 'PlusJakartaSans_500Medium',
  bold: 'PlusJakartaSans_700Bold',
  extraBold: 'PlusJakartaSans_800ExtraBold',
} as const;

/** V2 typography. Keep existing variant names used across the app. */
export const type = {
  display: { fontSize: 20, lineHeight: 28, fontWeight: '800', fontFamily: fontFamily.extraBold },
  h1: { fontSize: 18, lineHeight: 26, fontWeight: '800', fontFamily: fontFamily.extraBold },
  h2: { fontSize: 15, lineHeight: 22, fontWeight: '800', fontFamily: fontFamily.extraBold },
  h3: { fontSize: 14, lineHeight: 20, fontWeight: '700', fontFamily: fontFamily.bold },
  body: { fontSize: 14, lineHeight: 21, fontWeight: '700', fontFamily: fontFamily.bold },
  bodyStrong: { fontSize: 14, lineHeight: 21, fontWeight: '800', fontFamily: fontFamily.extraBold },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '500', fontFamily: fontFamily.medium },
  captionStrong: { fontSize: 12, lineHeight: 18, fontWeight: '700', fontFamily: fontFamily.bold },
  label: { fontSize: 11, lineHeight: 16, fontWeight: '700', fontFamily: fontFamily.bold },
  micro: { fontSize: 10, lineHeight: 15, fontWeight: '700', fontFamily: fontFamily.bold },
} as const;

/**
 * Existing primary and stepper components use minTarget (48dp); stepperMinTarget is the lower
 * bound for future compact layouts, never a reason to shrink the current controls.
 */
export const touch = {
  minTarget: 48,
  buttonHeight: 52,
  stepperMinTarget: 36,
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

/**
 * Android uses elevation and iOS uses the shadow properties.
 */
export const shadow = {
  card: {
    ...elevation.sm,
    shadowColor: '#0A4040',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  raised: {
    ...elevation.md,
    shadowColor: '#0A4E52',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  /** Amber-tinted glow, for the rationed accent's own surfaces (the count badge, a highlight pill). */
  amber: {
    ...elevation.md,
    shadowColor: '#C96A00',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
} as const;

export const tokens = {
  brand,
  neutral,
  accent,
  feedback,
  semantic,
  gradients,
  statusColor,
  productColor,
  space,
  radius,
  fontFamily,
  type,
  touch,
  elevation,
  shadow,
} as const;

export type Tokens = typeof tokens;
