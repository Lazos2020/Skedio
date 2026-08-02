import { useEffect, useState } from 'react';

export type SplashPhase = 'visible' | 'fading' | 'done';

interface UseSplashScreenOptions {
  /** Minimum time the splash screen must remain fully visible, in ms. */
  minDurationMs?: number;
  /** Duration of the fade-out transition into the app, in ms. Should match the CSS transition on the splash screen. */
  fadeDurationMs?: number;
}

/**
 * Drives the splash screen's lifecycle as a small state machine:
 *
 *   visible -> fading -> done
 *
 * The splash stays in `visible` until BOTH of the following are true:
 *   1. `minDurationMs` has elapsed (so the brand moment always reads as intentional,
 *      never a flash), and
 *   2. `isAppReady` is true (so we never reveal a half-loaded app underneath).
 *
 * Once both conditions are met it moves to `fading` (caller should start a CSS
 * opacity transition) and then to `done` after `fadeDurationMs`, at which point
 * the caller can unmount the splash overlay entirely.
 *
 * The transition is one-directional: once past `visible`, later changes to
 * `isAppReady` (e.g. a brief `isLoading` flip during an unrelated in-app action)
 * will never bring the splash back.
 */
export function useSplashScreen(
  isAppReady: boolean,
  { minDurationMs = 5000, fadeDurationMs = 500 }: UseSplashScreenOptions = {}
): SplashPhase {
  const [phase, setPhase] = useState<SplashPhase>('visible');
  const [minTimeReached, setMinTimeReached] = useState(false);

  // Minimum visible duration — intentionally runs once on mount only.
  useEffect(() => {
    const timer = setTimeout(() => setMinTimeReached(true), minDurationMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Advance visible -> fading -> done once both gates are satisfied.
  useEffect(() => {
    if (phase !== 'visible') return;
    if (!minTimeReached || !isAppReady) return;

    setPhase('fading');
    const timer = setTimeout(() => setPhase('done'), fadeDurationMs);
    return () => clearTimeout(timer);
  }, [phase, minTimeReached, isAppReady, fadeDurationMs]);

  return phase;
}
