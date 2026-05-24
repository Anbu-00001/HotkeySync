export type OS = 'windows' | 'mac';

/**
 * Which OS(es) an app runs on. Drives the app-picker's per-OS filter and
 * tells the generators when to skip an app for the user's currently-selected
 * OS. Apps that exist on both list both — most apps in our catalogue do.
 *
 * NOTE: an app being available on a platform doesn't mean rules will work
 * there — that depends on `exeName` (for Windows / AHK) and `bundleId`
 * (for macOS / Karabiner). Both should be present iff their platform is in
 * `platforms`. The Zod schema in `src/lib/schemas.ts` enforces this invariant.
 */
export type Platform = 'windows' | 'mac';

/**
 * 10-category taxonomy (Phase B, 2026-05-22). Each name is short so the
 * picker's TabsList stays readable. "Editors" covers code editors AND IDEs.
 * "Notes" covers personal knowledge and AI assistants. "Mail" covers email
 * and calendar apps. "DevTools" covers system launchers / file managers / cloud sync.
 */
export type AppCategory =
  | 'Browsers'
  | 'Editors'
  | 'Terminals'
  | 'Notes'
  | 'Mail'
  | 'Communication'
  | 'Design'
  | 'Office'
  | 'Media'
  | 'DevTools';

export interface App {
  id: string;
  name: string;
  /**
   * Exact Windows executable filename (case as on disk). Used by AHK's
   * `#HotIf WinActive("ahk_exe X.exe")` directive. Omit when the app does
   * not ship on Windows.
   */
  exeName?: string;
  /**
   * Exact macOS bundle identifier (`CFBundleIdentifier` from the .app's
   * Info.plist). Case-sensitive. Used by Karabiner's
   * `frontmost_application_if.bundle_identifiers`. Omit when the app does
   * not ship on macOS.
   */
  bundleId?: string;
  category: AppCategory;
  icon: string;
  /**
   * Platforms this app runs on. At least one. When an entry omits this
   * field (legacy / forgotten), the schema treats it as cross-platform
   * to preserve backwards compatibility — see `src/lib/schemas.ts`.
   */
  platforms?: readonly Platform[];
  /**
   * Optional search synonyms ("vscode" → VS Code, "intellij" → IntelliJ
   * IDEA). The picker's substring filter also matches against these.
   */
  aliases?: readonly string[];
  /**
   * `true` for apps that ship with no native shortcut customization — Slack,
   * Notion, Figma, Spotify, modern Outlook. HotkeySync is effectively the
   * only way to rebind keys for these apps. Surfaced as a badge in the picker
   * so users can find "we are the only path" apps quickly.
   *
   * Selection criteria for flipping this flag on a new app:
   *   1. Two independent sources confirming "no in-app shortcut editor"
   *      (official docs + Reddit/HN/forum complaints).
   *   2. The app has enough hotkey surface that someone would want to remap.
   *
   * Default is undefined/false. Validated in src/data/apps.test.ts.
   */
  lockedShortcuts?: boolean;
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

/**
 * Disable a trigger combo for a given app — the trigger simply does nothing
 * when pressed inside that app's window.
 *
 * Karabiner emits `to: [{ "key_code": "vk_none" }]` (its conventional swallow
 * sentinel). AHK emits `Trigger:: return` (early-returns before the default
 * action fires).
 *
 * Use cases (Reddit + Karabiner gallery validated): Firefox Ctrl+Q quit-trap,
 * macOS Cmd+Space when using Alfred/Raycast, Cursor Cmd+Shift+L (was VS Code
 * line-duplicate).
 */
export interface DisableHotkeyRule {
  kind: 'disable';
  appId: string;
  trigger: string;
  description: string;
}

export type HotkeyRule = BasicHotkeyRule | TapHoldHotkeyRule | DisableHotkeyRule;

export const TAP_HOLD_DEFAULT_TIMEOUT_MS = 200;
export const TAP_HOLD_MIN_TIMEOUT_MS = 50;
export const TAP_HOLD_MAX_TIMEOUT_MS = 2000;

export interface Config {
  os: OS;
  rules: HotkeyRule[];
}
