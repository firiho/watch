/**
 * Lightweight haptic feedback for the web.
 *
 * - Android / Chrome: the Vibration API.
 * - iOS 18+ Safari: toggling an `<input type="checkbox" switch>` fires the
 *   system "selection" haptic. Clicking a detached, display:none label
 *   triggers it without moving focus or touching layout.
 * - Everything else: a silent no-op.
 *
 * Must be called synchronously from a user gesture (click / pointerup / touchend).
 */

type HapticStyle = 'selection' | 'light' | 'medium' | 'success' | 'warning';

const VIBRATION_PATTERNS: Record<HapticStyle, number | number[]> = {
  selection: 8,
  light: 10,
  medium: 18,
  success: [10, 40, 14],
  warning: [16, 60, 16],
};

let iosSwitchSupported: boolean | null = null;

function supportsIOSSwitch(): boolean {
  if (iosSwitchSupported !== null) return iosSwitchSupported;
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return (iosSwitchSupported = false);
  const ua = navigator.userAgent;
  const isIOS = /iP(hone|od|ad)/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  iosSwitchSupported = isIOS;
  return iosSwitchSupported;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function haptic(style: HapticStyle = 'selection'): void {
  try {
    if (typeof window === 'undefined' || prefersReducedMotion()) return;

    if (typeof navigator.vibrate === 'function' && !supportsIOSSwitch()) {
      navigator.vibrate(VIBRATION_PATTERNS[style]);
      return;
    }

    if (!supportsIOSSwitch()) return;

    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    document.head.removeChild(label);
  } catch {
    // Haptics are a nicety; never let them break an interaction.
  }
}
