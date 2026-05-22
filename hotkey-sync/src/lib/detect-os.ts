/**
 * Best-effort OS detection from a browser navigator object.
 *
 * Order of preference:
 *   1. `navigator.userAgentData.platform` (modern, Chromium-only, freezable).
 *   2. `navigator.platform` (legacy, deprecated but widely supported).
 *
 * Returns `null` when neither source is available or neither yields a clear
 * Windows/Mac signal. We deliberately don't try to guess Linux → which OS the
 * user wants generated output for; HotkeySync only ships AHK + Karabiner, so
 * Linux users have to choose manually. iOS / Android also return null since
 * the desktop generators don't help on mobile anyway.
 *
 * Pure function — pass a navigator-shaped object (or `navigator` itself) and
 * get a deterministic answer. Easy to unit-test without touching jsdom.
 */
import type { OS } from '@/types';

/** Minimal navigator shape we read from. Both fields optional for testability. */
export interface DetectableNavigator {
  platform?: string;
  userAgentData?: { platform?: string };
}

export function detectOS(nav: DetectableNavigator | undefined | null): OS | null {
  if (!nav) return null;

  const uaPlat = nav.userAgentData?.platform;
  if (typeof uaPlat === 'string' && uaPlat.length > 0) {
    const m = matchPlatform(uaPlat);
    if (m) return m;
  }

  const legacy = nav.platform;
  if (typeof legacy === 'string' && legacy.length > 0) {
    const m = matchPlatform(legacy);
    if (m) return m;
  }

  return null;
}

function matchPlatform(s: string): OS | null {
  const lower = s.toLowerCase();
  // userAgentData yields canonical strings: "Windows", "macOS", "Linux",
  // "Android", "iOS", "Chrome OS", "Unknown".
  if (lower.includes('mac') || lower.includes('darwin')) return 'mac';
  if (lower.includes('win')) return 'windows';
  // Legacy navigator.platform values: "MacIntel", "Win32", "Linux x86_64", etc.
  // The substring checks above cover them. Linux / iOS / Android intentionally
  // fall through to null.
  return null;
}
