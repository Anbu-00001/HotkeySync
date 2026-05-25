import type { Modifier } from '@/lib/keys';

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

/**
 * Sentinel app id for rules that apply across all apps. Modelled after the
 * Karabiner convention of omitting `frontmost_application_if` (and using
 * `frontmost_application_unless` for exceptions). On every rule variant, when
 * `appId === GLOBAL_APP_ID`, `exceptApps` becomes meaningful: the rule applies
 * everywhere EXCEPT those bundle ids / exe names.
 *
 * Why a sentinel and not e.g. `'*'` or an empty array:
 *   - Grep-friendly (`grep __global`).
 *   - Narrows cleanly in TypeScript discriminated unions.
 *   - Mirrors patterns used by ryoppippi/karabiner.ts + bezbac/dotfiles in the
 *     real world (see project_global_rules_research.md).
 */
export const GLOBAL_APP_ID = '__global' as const;
export type GlobalAppId = typeof GLOBAL_APP_ID;

/**
 * Wave 2.6 modifier-only action. Used as the destination when the rule should
 * *hold a modifier down* rather than fire a key + modifier combo. Canonical
 * use cases: Caps Lock → Left Ctrl, Caps Lock → Hyper bundle (Cmd+Ctrl+Alt+Shift).
 *
 * - `modifiers`: one or more Modifier names. Order is canonicalised on persist.
 * - `lazy`: Karabiner's `lazy: true` flag — the modifier only fires when
 *   chained with another key, suppressing raw modifier-down. Critical for
 *   Hyper Key UX (otherwise IMEs / Mission Control misbehave on a bare press).
 *   AHK has no native lazy modifier; the generator approximates and the lint
 *   surfaces the limitation.
 *
 * The carrier-key trick that Karabiner needs for modifier bundles
 * (`{ key_code: 'left_shift', modifiers: ['left_command', ...] }`) is hidden
 * inside the Karabiner generator — users see only this clean shape.
 */
export interface ModifierAction {
  kind: 'modifier';
  modifiers: readonly Modifier[];
  lazy?: boolean;
}

/**
 * Action shape used on `BasicHotkeyRule.action` and `TapHoldHotkeyRule.holdAction`.
 *
 *   - `string` form: a canonical KeyCombo (parsed via `parseKeyCombo`), e.g.
 *     `"ctrl+p"`. This is the legacy and most-common case — all pre-Wave-2.6
 *     persisted rules stay this shape, so persistence/share-URLs need no
 *     migration. Wave 2.6 chose this on purpose (see project_modifier_action_research.md).
 *   - `ModifierAction` object: the Wave 2.6 addition. Used only when the
 *     destination is purely modifier(s), with no associated TriggerKey.
 *
 * TypeScript discriminates cleanly via `typeof action === 'string'`.
 */
export type Action = string | ModifierAction;

/** Standard remap: trigger fires action, replacing the OS default. */
export interface BasicHotkeyRule {
  kind: 'basic';
  appId: string;
  trigger: string;
  /**
   * Either a canonical key combo string (legacy) or a Wave 2.6 ModifierAction.
   * See `Action` for narrowing semantics.
   */
  action: Action;
  description: string;
  /**
   * Wave 2.7 — when set, this rule only fires while the named layer is
   * active. The layer is defined by a `LayerHotkeyRule` whose `layerName`
   * matches. Lint flags orphan references (layerName not defined anywhere).
   */
  layerName?: string;
  /**
   * Apps to exclude when `appId === GLOBAL_APP_ID`. Each entry is a HotkeySync
   * app id (resolved to bundle id on macOS / exe name on Windows by the
   * generator). Ignored when appId is not the sentinel.
   */
  exceptApps?: readonly string[];
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
  /**
   * Tap branch: KeyCombo string only. Tapping a modifier alone is
   * semantically meaningless, so we intentionally don't accept ModifierAction
   * here (research-validated; see project_modifier_action_research.md).
   */
  tapAction: string;
  /**
   * Hold branch: KeyCombo string OR ModifierAction. The latter enables the
   * canonical Caps-Lock-as-Esc/Ctrl pattern (tap=Esc, hold=Left Ctrl).
   */
  holdAction: Action;
  tapTimeoutMs: number;
  description: string;
  /** See BasicHotkeyRule.exceptApps. */
  exceptApps?: readonly string[];
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
  /** See BasicHotkeyRule.exceptApps. */
  exceptApps?: readonly string[];
}

/**
 * Wave 2.7 — Hyper Layer. Defines a layer whose children are basic rules
 * pointing at it via `layerName`. While the layer is active (trigger held),
 * any child rule fires; the trigger itself produces no key unless `tapAction`
 * is set, in which case it acts dual-role (tap fires tapAction, hold activates
 * the layer).
 *
 * Karabiner natively expresses this as `set_variable` on the trigger plus
 * `variable_if` on every child. We also emit a watchdog `to_after_key_up`
 * clear plus a safety-net manipulator so the layer can't get stuck on if the
 * OS steals focus mid-hold (Karabiner #1831 / Sequoia VK quirks).
 *
 * AHK has no native layer primitive; the generator emits a global flag
 * `g_LayerXxx`, paired `*Trigger`/`*Trigger up` handlers, a `#HotIf
 * g_LayerXxx` block holding the rebinds, and a 1000ms `SetTimer` watchdog
 * that clears the flag if the trigger physically isn't down anymore.
 *
 * Why `mode: 'hold'` only at ship — one-shot/Caps-Word are deferred to
 * Wave 2.8 (research-validated). The field is on the schema so existing
 * configs don't break when one-shot ships; for now Zod rejects anything
 * other than 'hold'.
 *
 * `unmappedBehavior` controls what an unmapped key does while the layer is
 * active. Default is `'swallow'` (QMK/Karabiner gallery consensus): pressing
 * an unmapped key does nothing. `'passthrough'` lets it fire normally — used
 * rarely (mostly numpad layers where letters should still type).
 *
 * `passthroughModifiers` defaults true — the trigger emits with `lazy: true`
 * on Karabiner, so modifiers held in combination with the trigger still
 * reach the destination. Set false for layers that should consume modifiers.
 */
export interface LayerHotkeyRule {
  kind: 'layer';
  appId: string;
  trigger: string;
  /**
   * Stable identifier referenced by child basic rules via `layerName`. Must
   * be unique per config. `[a-z0-9-]+`, 1–32 chars (schema-enforced).
   */
  layerName: string;
  /**
   * Activation style.
   *   - 'hold' (Wave 2.7): active only while the trigger is physically held.
   *   - 'oneshot' (Wave 2.8): tap the trigger to arm the layer for the next
   *     non-modifier keystroke, then auto-disarm. Matches QMK `OSL` semantics.
   *     Holding the same trigger still falls back to hold behaviour (free
   *     because the activator's down/up handlers are the same).
   */
  mode: 'hold' | 'oneshot';
  /**
   * Optional dual-role tap action. Reuses the Wave 2.6 Action union so the
   * tap can be either a key combo (e.g. `escape`) or a ModifierAction.
   * When set, the rule behaves like a tap_hold whose hold is "activate layer"
   * rather than "fire combo".
   *
   * Mutually exclusive with `mode: 'oneshot'` at the schema level — for a
   * one-shot trigger, the tap IS the activation; a separate tapAction would
   * race with the arm-the-layer behaviour.
   */
  tapAction?: Action;
  /** See class doc. Defaults to true when omitted. */
  passthroughModifiers?: boolean;
  /** See class doc. Defaults to 'swallow' when omitted. */
  unmappedBehavior?: 'swallow' | 'passthrough';
  /**
   * Wave 2.8 — one-shot only. Auto-disarm after this many milliseconds even
   * if no child key was pressed. Omit (the recommended default) for "armed
   * forever until next key or cancel". Range 100–10_000.
   *
   * QMK suggests 5000ms in its example config but doesn't bake it in; the
   * Karabiner gallery omits it entirely. Mirroring the gallery here so users
   * familiar with one-shot from karabiner.ts / Goku get the expected behaviour.
   */
  oneshotTimeoutMs?: number;
  /**
   * Wave 2.8 — one-shot only. Keys that immediately clear an armed layer
   * without firing a child rule. Each entry is a canonical KeyCombo string
   * (modifier-prefixed allowed, e.g. `meta+period`). Default `['escape']`
   * when omitted. Set to `[]` to disable the cancel-key behaviour.
   *
   * Why default escape only: QMK / Karabiner-gallery both treat Escape as
   * the universal "back out" key; adding more keys risks shadowing real
   * actions inside the layer (research found Bazecor's modifier-cancel
   * mistake — every modifier-cancel turns a misfeel into a hard bug).
   */
  cancelKeys?: readonly string[];
  description: string;
  /** See BasicHotkeyRule.exceptApps. */
  exceptApps?: readonly string[];
}

export type HotkeyRule =
  | BasicHotkeyRule
  | TapHoldHotkeyRule
  | DisableHotkeyRule
  | LayerHotkeyRule;

export const TAP_HOLD_DEFAULT_TIMEOUT_MS = 200;
export const TAP_HOLD_MIN_TIMEOUT_MS = 50;
export const TAP_HOLD_MAX_TIMEOUT_MS = 2000;

export interface Config {
  os: OS;
  rules: HotkeyRule[];
}
