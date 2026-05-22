export type OS = 'windows' | 'mac';

export type AppCategory =
  | 'Browsers'
  | 'Editors'
  | 'Productivity'
  | 'Communication'
  | 'Media';

export interface App {
  id: string;
  name: string;
  exeName: string;
  bundleId: string;
  category: AppCategory;
  icon: string;
}

/** Standard remap: trigger fires action, replacing the OS default. */
export interface BasicHotkeyRule {
  kind: 'basic';
  appId: string;
  trigger: string;
  action: string;
  description: string;
}

/**
 * Dual-role remap: the trigger has TWO actions, chosen by how long the key
 * is held.
 *   - tapAction fires if the trigger is released within tapTimeoutMs.
 *   - holdAction fires if held longer.
 *
 * Karabiner runs this natively via to_if_alone + to_if_held_down. AHK has no
 * native equivalent — HotkeySync emits a polling helper (see ahk.ts) that
 * works for typical use but can mis-fire under fast typing rolls. UI surfaces
 * this caveat.
 *
 * tapTimeoutMs: 50–2000. Default 200 (QMK community consensus; <150 ms tends
 * to mis-fire, >400 ms feels sluggish).
 */
export interface TapHoldHotkeyRule {
  kind: 'tap_hold';
  appId: string;
  trigger: string;
  tapAction: string;
  holdAction: string;
  tapTimeoutMs: number;
  description: string;
}

export type HotkeyRule = BasicHotkeyRule | TapHoldHotkeyRule;

export const TAP_HOLD_DEFAULT_TIMEOUT_MS = 200;
export const TAP_HOLD_MIN_TIMEOUT_MS = 50;
export const TAP_HOLD_MAX_TIMEOUT_MS = 2000;

export interface Config {
  os: OS;
  rules: HotkeyRule[];
}
