import { Easing, ReduceMotion, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';

/**
 * SOUL COFFEEMATE — motion tokens.
 *
 * Every animation in the app reads its timing from here, the same way every colour reads from
 * `tokens.ts`. A screen that springs at 380 stiffness next to one that springs at 140 reads as
 * two different apps, and no amount of matching colours hides it.
 *
 * TWO RULES THIS FILE ENFORCES
 *
 *  1. `reduceMotion: ReduceMotion.System` on every config. Android's "Remove animations"
 *     accessibility setting must actually remove them. Reanimated honours this per-animation,
 *     never globally, so it has to be set at the source — hence these shared configs rather
 *     than inline `withSpring(v)` calls scattered across screens.
 *
 *  2. Durations stay short. This is a field app used one-handed between customers; a 600ms
 *     flourish that delights on the first run is a 600ms tax on the four-hundredth. Nothing
 *     here blocks a tap, and nothing on the critical path (submit, approve, deliver) waits on
 *     an animation to finish.
 */

/** Milliseconds. `instant` exists so "no animation" is still a named decision. */
export const duration = {
  instant: 0,
  fast: 140,
  base: 220,
  slow: 320,
  slower: 480,
  /** Ambient loops — shimmer, pulse, glow. Long on purpose so they read as breathing. */
  ambient: 1400,
} as const;

/**
 * Standard easing curves.
 *
 * `decelerate` is the default for anything entering the screen (fast in, gentle settle);
 * `accelerate` for anything leaving; `standard` for state changes that stay put.
 */
export const easing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  decelerate: Easing.out(Easing.cubic),
  accelerate: Easing.in(Easing.cubic),
  linear: Easing.linear,
} as const;

/**
 * Spring configs, tuned by feel rather than by physics defaults.
 *
 * `press` is critically damped on purpose — a button that wobbles after a tap feels loose, not
 * lively. `bouncy` is reserved for elements that should read as playful arrivals (a count badge,
 * a completed step), never for controls the user is aiming at.
 */
export const spring = {
  /** Tap feedback. No overshoot. */
  press: {
    damping: 22,
    stiffness: 420,
    mass: 0.6,
    reduceMotion: ReduceMotion.System,
  } satisfies WithSpringConfig,

  /** General-purpose UI movement: layout shifts, sliding indicators. */
  gentle: {
    damping: 18,
    stiffness: 180,
    mass: 1,
    reduceMotion: ReduceMotion.System,
  } satisfies WithSpringConfig,

  /** Arrivals that should feel alive. Mild overshoot only. */
  bouncy: {
    damping: 12,
    stiffness: 200,
    mass: 0.9,
    reduceMotion: ReduceMotion.System,
  } satisfies WithSpringConfig,

  /** Heavy surfaces — sheets, full-width panels. Slow and deliberate. */
  heavy: {
    damping: 26,
    stiffness: 140,
    mass: 1.2,
    reduceMotion: ReduceMotion.System,
  } satisfies WithSpringConfig,
} as const;

/** Timing configs matching the duration scale. */
export const timing = {
  fast: {
    duration: duration.fast,
    easing: easing.standard,
    reduceMotion: ReduceMotion.System,
  } satisfies WithTimingConfig,
  base: {
    duration: duration.base,
    easing: easing.standard,
    reduceMotion: ReduceMotion.System,
  } satisfies WithTimingConfig,
  enter: {
    duration: duration.slow,
    easing: easing.decelerate,
    reduceMotion: ReduceMotion.System,
  } satisfies WithTimingConfig,
  exit: {
    duration: duration.base,
    easing: easing.accelerate,
    reduceMotion: ReduceMotion.System,
  } satisfies WithTimingConfig,
  ambient: {
    duration: duration.ambient,
    easing: easing.linear,
    reduceMotion: ReduceMotion.System,
  } satisfies WithTimingConfig,
} as const;

/** Press-state scale targets. Small values — a 0.9 squash on a full-width card looks broken. */
export const pressScale = {
  /** Cards, tiles, list rows. */
  surface: 0.975,
  /** Buttons and chips. */
  control: 0.96,
  /** Icon buttons, which are small enough to need a visible squash. */
  icon: 0.9,
} as const;

/**
 * Stagger delay for a list of entering items.
 *
 * Capped at `max` because the delay is per-index: without a cap, item 30 of a refill list would
 * wait a full second before appearing, and a list that fills in slowly reads as a slow app.
 * Beyond the cap everything remaining lands together, which nobody notices.
 */
export function staggerDelay(index: number, step = 55, max = 420): number {
  return Math.min(index * step, max);
}
