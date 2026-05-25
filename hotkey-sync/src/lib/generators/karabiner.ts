import {
  KARABINER_KEY_MAP,
  comboToKarabinerFrom,
  parseKeyCombo,
  type KeyCombo,
  type Modifier,
} from '@/lib/keys';
import type { Action, Config, LayerHotkeyRule } from '@/types';
import { GLOBAL_APP_ID } from '@/types';
import { isModifierAction, canonicaliseModifiers } from '@/lib/actions';
import { getAppById, groupRulesByAppId } from '@/lib/generators/shared';

export interface KarabinerFromModifiers {
  mandatory?: string[];
  optional?: string[];
}

export interface KarabinerFrom {
  key_code: string;
  modifiers?: KarabinerFromModifiers;
}

/**
 * A Karabiner `to` event. Two structural shapes co-exist in one optional-field
 * interface:
 *   - Key form: `key_code` (+ optional modifiers, lazy). The pre-Wave-2.7 case.
 *   - Variable form: `set_variable: { name, value }`. Wave 2.7 layer rules.
 * Exactly one of `key_code` / `set_variable` is present (Zod-refined in
 * karabiner-schema.ts). Optionals over a discriminated union keeps test
 * assertions that touch `.key_code` etc. ergonomic.
 *
 * `lazy: true` (Wave 2.6) suppresses raw modifier-down firing — essential for
 * Hyper Key UX (without it IMEs / Mission Control misbehave on bare press).
 */
export interface KarabinerTo {
  key_code?: string;
  modifiers?: string[];
  lazy?: boolean;
  set_variable?: { name: string; value: number };
  /**
   * Wave 2.9 — visible armed-state indicator. Karabiner displays a HUD
   * notification with this id+text; emit `text: ""` to clear. Must NOT share
   * a `to[]` array with `set_variable` (KE issue #4104 — closed not_planned).
   */
  set_notification_message?: { id: string; text: string };
}

/**
 * A Karabiner manipulator condition. Three flavours:
 *   - `frontmost_application_if` — per-app rule scope (Wave 2.5).
 *   - `frontmost_application_unless` — global rule with exclusion list.
 *   - `variable_if` — Wave 2.7 layer gate. Pairs with the layer's
 *     `set_variable` to activate child rules.
 * `bundle_identifiers` is required for the application forms; `name` + `value`
 * for the variable form. Zod-refined in karabiner-schema.ts.
 */
export interface KarabinerCondition {
  type: 'frontmost_application_if' | 'frontmost_application_unless' | 'variable_if';
  bundle_identifiers?: string[];
  name?: string;
  value?: number;
}

/**
 * Per-manipulator parameter overrides. Used by tap_hold rules to control the
 * tap timeout vs hold threshold (we set both to the same value).
 * See https://karabiner-elements.pqrs.org/docs/json/complex-modifications-manipulator-definition/parameters/
 */
export interface KarabinerManipulatorParameters {
  'basic.to_if_alone_timeout_milliseconds'?: number;
  'basic.to_if_held_down_threshold_milliseconds'?: number;
  /**
   * Wave 2.8 — delay before `to_delayed_action.to_if_invoked` fires. Used by
   * one-shot layer rules to auto-disarm the layer after a timeout.
   */
  'basic.to_delayed_action_delay_milliseconds'?: number;
}

/**
 * Wave 2.8 — `to_delayed_action` block. `to_if_invoked` fires after the delay
 * if the trigger wasn't interrupted by another key; `to_if_canceled` fires
 * if it was. One-shot layers use `to_if_invoked` to clear the layer variable
 * once the timeout elapses, even when no child rule fired.
 *
 * See https://karabiner-elements.pqrs.org/docs/json/complex-modifications-manipulator-definition/to-delayed-action/
 */
export interface KarabinerToDelayedAction {
  to_if_invoked?: KarabinerTo[];
  to_if_canceled?: KarabinerTo[];
}

export interface KarabinerManipulator {
  type: 'basic';
  from: KarabinerFrom;
  /**
   * Fires immediately while the trigger is held. Omitted for tap_hold rules.
   * Required for basic remaps.
   */
  to?: KarabinerTo[];
  /**
   * Fires when the trigger is released and no other input occurred in the
   * meantime (tap branch of a tap_hold rule).
   */
  to_if_alone?: KarabinerTo[];
  /**
   * Fires when the trigger has been held past the threshold (hold branch).
   */
  to_if_held_down?: KarabinerTo[];
  /**
   * Wave 2.7 — Fires after the trigger is released, unconditionally. Layer
   * rules use this to clear their `set_variable` so the layer can't get
   * stuck on if focus is stolen mid-hold.
   */
  to_after_key_up?: KarabinerTo[];
  /**
   * Wave 2.8 — Delayed-action block. One-shot layers use this to auto-disarm
   * after `oneshotTimeoutMs`.
   */
  to_delayed_action?: KarabinerToDelayedAction;
  parameters?: KarabinerManipulatorParameters;
  conditions: KarabinerCondition[];
}

export interface KarabinerRule {
  description: string;
  manipulators: KarabinerManipulator[];
}

export interface KarabinerOutput {
  title: string;
  rules: KarabinerRule[];
}

const KARABINER_TO_MODIFIER_MAP: Record<Modifier, string> = {
  ctrl: 'left_control',
  shift: 'left_shift',
  alt: 'left_option',
  meta: 'left_command',
};

function escapeBundleId(bundleId: string): string {
  const escaped = bundleId.replace(/\./g, '\\.');
  return `^${escaped}$`;
}

/**
 * Build the `conditions` array for a global rule. If `exceptApps` is empty or
 * undefined the array is empty (Karabiner treats no-conditions as "apply
 * everywhere"). Otherwise we emit ONE `frontmost_application_unless` block
 * containing every excluded app's bundle id — apps that aren't in the catalog
 * or are missing a bundleId (Windows-only) are silently skipped, since they
 * are no-ops on macOS anyway.
 */
function buildGlobalConditions(
  exceptApps: readonly string[] | undefined,
): KarabinerCondition[] {
  if (!exceptApps || exceptApps.length === 0) return [];
  const patterns: string[] = [];
  for (const id of exceptApps) {
    const app = getAppById(id);
    if (app?.bundleId) patterns.push(escapeBundleId(app.bundleId));
  }
  if (patterns.length === 0) return [];
  return [
    {
      type: 'frontmost_application_unless',
      bundle_identifiers: patterns,
    },
  ];
}

function buildKarabinerFrom(trigger: KeyCombo): KarabinerFrom {
  const base = comboToKarabinerFrom(trigger);
  const modifiers: KarabinerFromModifiers = { ...(base.modifiers ?? {}) };
  modifiers.optional = ['caps_lock'];
  return { key_code: base.key_code, modifiers };
}

function buildKarabinerTo(action: KeyCombo): KarabinerTo {
  const keyCode = KARABINER_KEY_MAP[action.key];
  if (action.modifiers.length === 0) {
    return { key_code: keyCode };
  }
  return {
    key_code: keyCode,
    modifiers: action.modifiers.map((m) => KARABINER_TO_MODIFIER_MAP[m]),
  };
}

/**
 * Wave 2.6 — convert an `Action` (string OR ModifierAction) to a single
 * KarabinerTo event.
 *
 * For string actions: parse as KeyCombo, then standard buildKarabinerTo.
 *
 * For ModifierAction:
 *   - 1 modifier  → `{ key_code: '<modifier_name>' }` (e.g. left_control).
 *   - 2+ modifiers (Hyper, etc.) → carrier-key trick: pick one modifier as
 *     the `key_code`, put the rest in `modifiers[]`. Karabiner has no pure
 *     modifier-bundle output; this is the canon (see brettterpstra Hyper Key
 *     posts, hyperkey.app, etc.). We always pick `left_shift` as the carrier
 *     when shift is present, otherwise the first canonicalised modifier —
 *     matches the gallery convention.
 *   - `lazy: true` propagated unchanged.
 */
function buildKarabinerToFromAction(action: Action): KarabinerTo {
  if (!isModifierAction(action)) {
    return buildKarabinerTo(parseKeyCombo(action));
  }
  const mods = canonicaliseModifiers(action.modifiers);
  if (mods.length === 1) {
    const out: KarabinerTo = { key_code: KARABINER_TO_MODIFIER_MAP[mods[0]] };
    if (action.lazy) out.lazy = true;
    return out;
  }
  // Carrier-key trick. Prefer shift (gallery convention); else first mod.
  const carrier = mods.includes('shift') ? 'shift' : mods[0];
  const others = mods.filter((m) => m !== carrier);
  const out: KarabinerTo = {
    key_code: KARABINER_TO_MODIFIER_MAP[carrier],
    modifiers: others.map((m) => KARABINER_TO_MODIFIER_MAP[m]),
  };
  if (action.lazy) out.lazy = true;
  return out;
}

/**
 * Wave 2.7 — Karabiner variable name for a layer. Underscored to match the
 * gallery convention (e.g. `hotkeysync_layer_vim_arrows`). The layerName is
 * already schema-restricted to `[a-z0-9-]+`, so we just swap `-` for `_`.
 */
function layerVarName(layerName: string): string {
  return `hotkeysync_layer_${layerName.replace(/-/g, '_')}`;
}

/** Wave 2.9 — `locked` companion variable for lock-on-tap layers. */
function layerLockedVar(layerName: string): string {
  return `${layerVarName(layerName)}_locked`;
}

/** Wave 2.9 — `tapcount` companion variable for lock-on-tap layers. */
function layerTapCountVar(layerName: string): string {
  return `${layerVarName(layerName)}_tapcount`;
}

/** Default consecutive-tap window when `oneshotTimeoutMs` is omitted on a lock-on-tap layer. Karabiner's default to_delayed_action_delay_milliseconds is 500ms. */
const DEFAULT_TAP_WINDOW_MS = 500;

/**
 * Wave 2.9 — stable id for the Karabiner notification slot. Different layers
 * use different ids so their indicators stack independently in the HUD.
 */
function layerNotificationId(layerName: string): string {
  return `hks_${layerName.replace(/-/g, '_')}`;
}

/**
 * Wave 2.9 — text for the armed-state notification. Empty string from the
 * user means "auto-label from layer name"; custom string is taken verbatim.
 */
function layerNotificationText(layer: LayerHotkeyRule): string {
  if (layer.notification === undefined) return '';
  if (layer.notification === '') return `${layer.layerName} layer armed`;
  return layer.notification;
}

function buildLayerManipulator(
  rule: LayerHotkeyRule,
  conditions: KarabinerCondition[],
  descPrefix: string,
): KarabinerRule | null {
  let trigger: KeyCombo;
  try {
    trigger = parseKeyCombo(rule.trigger);
  } catch {
    return null;
  }
  const varName = layerVarName(rule.layerName);
  const passthrough = rule.passthroughModifiers !== false;
  const setOn: KarabinerTo = {
    set_variable: { name: varName, value: 1 },
  };
  // `lazy: true` on the trigger means held modifiers reach the keys that
  // follow rather than being consumed by the trigger itself. Matches the
  // gallery's Hyper Key behaviour — see project_hyper_layer_research.md.
  if (passthrough) setOn.lazy = true;
  const setOff: KarabinerTo = {
    set_variable: { name: varName, value: 0 },
  };

  if (rule.mode === 'oneshot' && rule.oneshotLockOnTaps === 2) {
    // Wave 2.9 — lock-on-double-tap. Three manipulators in this rule,
    // ordered top-down per Karabiner's first-match wins semantics:
    //   (1) Lock-clear:  trigger pressed while locked → clear everything.
    //   (2) Lock-promoter: trigger pressed at tapcount=1 → set locked=1.
    //   (3) First-tap:   default; arm tapcount=1 + delayed-action reset.
    // The to_if_canceled branch of (3) is the mis-lock-on-rolling-typing
    // mitigation: an interrupting key resets the tap counter (research
    // pain #3, sourced from getreuer's home-row-mods FAQ).
    const varLayer = layerVarName(rule.layerName);
    const varLocked = layerLockedVar(rule.layerName);
    const varTaps = layerTapCountVar(rule.layerName);
    const notifId = layerNotificationId(rule.layerName);
    const notifText = layerNotificationText(rule);
    const tapWindow = rule.oneshotTimeoutMs ?? DEFAULT_TAP_WINDOW_MS;
    const fromTrigger = buildKarabinerFrom(trigger);

    // (1) Lock-clear: must come first; the most specific condition.
    const lockClear: KarabinerManipulator = {
      type: 'basic',
      from: fromTrigger,
      to: [
        { set_variable: { name: varLocked, value: 0 } },
        { set_variable: { name: varLayer, value: 0 } },
        { set_variable: { name: varTaps, value: 0 } },
      ],
      conditions: [
        ...conditions,
        { type: 'variable_if', name: varLocked, value: 1 },
      ],
    };
    if (rule.notification !== undefined) {
      lockClear.to_after_key_up = [
        { set_notification_message: { id: notifId, text: '' } },
      ];
    }

    // (2) Lock-promoter: second tap within window. `locked==0` gate prevents
    // re-entrancy with (1). `tapcount==1` ensures we only promote at the
    // exact threshold (vs every tap after).
    const lockPromoter: KarabinerManipulator = {
      type: 'basic',
      from: fromTrigger,
      to: [
        { set_variable: { name: varTaps, value: 2 } },
        { set_variable: { name: varLocked, value: 1 } },
        { set_variable: { name: varLayer, value: 1 } },
      ],
      conditions: [
        ...conditions,
        { type: 'variable_if', name: varLocked, value: 0 },
        { type: 'variable_if', name: varTaps, value: 1 },
      ],
    };
    if (rule.notification !== undefined) {
      // Re-emit so the indicator stays current (text could differ for locked
      // state in a future wave — same id ensures replace, not stack).
      lockPromoter.to_after_key_up = [
        { set_notification_message: { id: notifId, text: notifText } },
      ];
    }

    // (3) First-tap: default; sets tapcount=1 and arms the reset timer.
    // to_if_canceled fires when ANOTHER key interrupts the window — kills
    // the tap counter so a rolled-into trigger doesn't accidentally promote.
    const firstTap: KarabinerManipulator = {
      type: 'basic',
      from: fromTrigger,
      to: [
        { set_variable: { name: varTaps, value: 1 } },
        { set_variable: { name: varLayer, value: 1 } },
      ],
      to_delayed_action: {
        to_if_invoked: [{ set_variable: { name: varTaps, value: 0 } }],
        to_if_canceled: [{ set_variable: { name: varTaps, value: 0 } }],
      },
      parameters: {
        'basic.to_delayed_action_delay_milliseconds': tapWindow,
      },
      conditions,
    };
    if (rule.notification !== undefined) {
      firstTap.to_after_key_up = [
        { set_notification_message: { id: notifId, text: notifText } },
      ];
    }

    return {
      description: `${descPrefix}: ${rule.description} (one-shot layer, lock on double-tap)`,
      manipulators: [lockClear, lockPromoter, firstTap],
    };
  }

  if (rule.mode === 'oneshot') {
    // Wave 2.8 — one-shot: tap arms the layer. Critically NO `to_after_key_up`
    // here — the layer must persist past the trigger's release until a child
    // key fires (each child's `to` appends set_variable=0), a cancel key
    // fires, or the optional timeout elapses. This is the Karabiner-gallery
    // / karabiner.ts `leaderMode({ sticky: false })` shape.
    //
    // Unmapped keys passthrough without disarming. Gentler UX than QMK's
    // strict "any next key consumes" — modifiers and dead-keys don't lose
    // the armed state. Cancel-keys (default `escape`) give an explicit out.
    const manipulator: KarabinerManipulator = {
      type: 'basic',
      from: buildKarabinerFrom(trigger),
      to: [setOn],
      conditions,
    };
    if (rule.oneshotTimeoutMs !== undefined) {
      // Auto-disarm after the timeout if no child rule fired. `to_if_invoked`
      // fires on delay-elapsed without interruption. The Karabiner schema
      // wants delay in `parameters`, not on the to_delayed_action block.
      // Wave 2.9: timeout-disarm also clears the notification. Both events
      // share `to_if_invoked` but only one is set_variable; #4104 doesn't
      // trigger for the variable+notification combo here because to_if_invoked
      // fires as a delayed action, not on the from-key event itself.
      const timeoutClear: KarabinerTo[] = [setOff];
      if (rule.notification !== undefined) {
        timeoutClear.push({
          set_notification_message: {
            id: layerNotificationId(rule.layerName),
            text: '',
          },
        });
      }
      manipulator.to_delayed_action = { to_if_invoked: timeoutClear };
      manipulator.parameters = {
        'basic.to_delayed_action_delay_milliseconds': rule.oneshotTimeoutMs,
      };
    }
    // Wave 2.9 — armed-state notification. `set_notification_message` MUST
    // live in a separate `to[]` entry from `set_variable` (KE #4104). We put
    // it in `to_after_key_up` of the activator — fires after the trigger
    // release, so the notification appears once the layer is armed and the
    // user has lifted the trigger. Cleared via `to_after_key_up` on each
    // child rule (see child emission path).
    if (rule.notification !== undefined) {
      manipulator.to_after_key_up = [
        {
          set_notification_message: {
            id: layerNotificationId(rule.layerName),
            text: layerNotificationText(rule),
          },
        },
      ];
    }
    return {
      description: `${descPrefix}: ${rule.description} (one-shot layer)`,
      manipulators: [manipulator],
    };
  }

  // mode === 'hold' (Wave 2.7 behaviour, unchanged).
  const manipulator: KarabinerManipulator = {
    type: 'basic',
    from: buildKarabinerFrom(trigger),
    to: [setOn],
    to_after_key_up: [setOff],
    conditions,
  };
  // Optional dual-role tap: when the trigger is released alone (no child fired),
  // emit the configured action. Reuses Wave 2.6's Action plumbing.
  if (rule.tapAction !== undefined) {
    try {
      manipulator.to_if_alone = [buildKarabinerToFromAction(rule.tapAction)];
    } catch {
      // bad tap action — fall through without it
    }
  }
  return {
    description: `${descPrefix}: ${rule.description} (layer)`,
    manipulators: [manipulator],
  };
}

/**
 * Wave 2.8 — build manipulators that clear the layer variable for each
 * cancel key. Cancel keys fire only when the layer is armed (variable_if)
 * and emit a single set_variable=0 with NO key passthrough — Escape on a
 * one-shot layer means "back out", not "fire Escape".
 */
function buildCancelKeyManipulators(
  rule: LayerHotkeyRule,
  conditions: KarabinerCondition[],
  descPrefix: string,
): KarabinerRule[] {
  if (rule.mode !== 'oneshot') return [];
  const keys = rule.cancelKeys ?? ['escape'];
  if (keys.length === 0) return [];
  const varName = layerVarName(rule.layerName);
  const out: KarabinerRule[] = [];
  for (const k of keys) {
    let combo: KeyCombo;
    try {
      combo = parseKeyCombo(k);
    } catch {
      continue;
    }
    const cancelConditions: KarabinerCondition[] = [
      ...conditions,
      { type: 'variable_if', name: varName, value: 1 },
    ];
    // Wave 2.9 — cancel keys never fire on a LOCKED layer (mirrors QMK
    // exactly: only re-tapping the trigger clears the lock).
    if (rule.oneshotLockOnTaps === 2) {
      cancelConditions.push({
        type: 'variable_if',
        name: layerLockedVar(rule.layerName),
        value: 0,
      });
    }
    const cancelTo: KarabinerTo[] = [
      { set_variable: { name: varName, value: 0 } },
    ];
    // Wave 2.9 — clear the notification when a cancel key fires. Lives in
    // to_after_key_up rather than to[] to dodge KE #4104 (which forbids
    // set_variable + set_notification_message in the same to[] array).
    let cancelAfterKeyUp: KarabinerTo[] | undefined;
    if (rule.notification !== undefined) {
      cancelAfterKeyUp = [
        {
          set_notification_message: {
            id: layerNotificationId(rule.layerName),
            text: '',
          },
        },
      ];
    }
    const cancelManipulator: KarabinerManipulator = {
      type: 'basic',
      from: buildKarabinerFrom(combo),
      to: cancelTo,
      conditions: cancelConditions,
    };
    if (cancelAfterKeyUp) cancelManipulator.to_after_key_up = cancelAfterKeyUp;
    out.push({
      description: `${descPrefix}: cancel ${k} for layer "${rule.layerName}"`,
      manipulators: [cancelManipulator],
    });
  }
  return out;
}

export function generateKarabiner(config: Config): KarabinerOutput {
  const output: KarabinerOutput = {
    title: 'HotkeySync — My Config',
    rules: [],
  };

  if (config.rules.length === 0) return output;

  // Wave 2.7 — collect layer definitions so child basic rules can resolve
  // their `layerName` to a variable_if condition. Orphan references are
  // rejected upstream by rulesArraySchema; here we silently drop them in
  // case the rule reached the generator via a path that skipped validation.
  const layerByName = new Map<string, LayerHotkeyRule>();
  for (const r of config.rules) {
    if (r.kind === 'layer') layerByName.set(r.layerName, r);
  }

  const grouped = groupRulesByAppId(config.rules);

  for (const [appId, appRules] of grouped) {
    const isGlobal = appId === GLOBAL_APP_ID;
    const app = isGlobal ? null : getAppById(appId);
    // Defensive: store prevents unknown appIds; if one slips through, skip the whole group.
    if (!isGlobal && !app) continue;
    // Karabiner is macOS-only — a per-app rule without a bundleId can't be
    // targeted (Windows-exclusive apps like Notepad++). Global rules can
    // still emit, with optional `frontmost_application_unless` exclusions.
    if (!isGlobal && !app?.bundleId) continue;

    const bundlePattern = !isGlobal && app?.bundleId ? escapeBundleId(app.bundleId) : null;
    // Description prefix: app name for per-app rules, "Global" for the sentinel.
    const descPrefix = isGlobal ? 'Global' : (app?.name ?? appId);

    for (const rule of appRules) {
      const conditions: KarabinerCondition[] = isGlobal
        ? buildGlobalConditions(rule.exceptApps)
        : [
            {
              type: 'frontmost_application_if',
              bundle_identifiers: [bundlePattern!],
            },
          ];

      if (rule.kind === 'layer') {
        const built = buildLayerManipulator(rule, conditions, descPrefix);
        if (built) output.rules.push(built);
        // Wave 2.8 — also emit cancel-key manipulators for one-shot layers.
        // No-op for hold layers.
        const cancellers = buildCancelKeyManipulators(rule, conditions, descPrefix);
        for (const c of cancellers) output.rules.push(c);
        continue;
      }

      if (rule.kind === 'disable') {
        let trigger: KeyCombo;
        try {
          trigger = parseKeyCombo(rule.trigger);
        } catch {
          continue;
        }
        // vk_none is Karabiner's conventional "swallow event" sentinel —
        // see complex_modifications gallery (browser-rshift-enter-disable.json
        // and many others). The key remains pressable but does nothing.
        output.rules.push({
          description: `${descPrefix}: ${rule.description}`,
          manipulators: [
            {
              type: 'basic',
              from: buildKarabinerFrom(trigger),
              to: [{ key_code: 'vk_none' }],
              conditions,
            },
          ],
        });
        continue;
      }

      if (rule.kind === 'tap_hold') {
        let trigger: KeyCombo;
        let tap: KeyCombo;
        let holdEvent: KarabinerTo;
        try {
          trigger = parseKeyCombo(rule.trigger);
          tap = parseKeyCombo(rule.tapAction);
          holdEvent = buildKarabinerToFromAction(rule.holdAction);
        } catch {
          // Unreachable in practice: the store normalises every rule field
          // through parseKeyCombo + serializeKeyCombo before persist, so any
          // rule that reaches the generator already parses. Defensive skip
          // keeps the generator total; bad output would still be caught by
          // validateKarabinerOutput before download.
          continue;
        }

        output.rules.push({
          description: `${descPrefix}: ${rule.description}`,
          manipulators: [
            {
              type: 'basic',
              from: buildKarabinerFrom(trigger),
              // Note: `to` is intentionally OMITTED. The whole point of
              // tap_hold is "wait, then choose" — we don't want anything to
              // fire immediately while held.
              to_if_alone: [buildKarabinerTo(tap)],
              to_if_held_down: [holdEvent],
              parameters: {
                'basic.to_if_alone_timeout_milliseconds': rule.tapTimeoutMs,
                'basic.to_if_held_down_threshold_milliseconds': rule.tapTimeoutMs,
              },
              conditions,
            },
          ],
        });
        continue;
      }

      let trigger: KeyCombo;
      let actionEvent: KarabinerTo;
      try {
        trigger = parseKeyCombo(rule.trigger);
        actionEvent = buildKarabinerToFromAction(rule.action);
      } catch {
        // Defensive skip — same reasoning as the tap_hold branch above.
        continue;
      }

      // Wave 2.7 — child of a layer: gate the manipulator on the layer's
      // variable. Combined with the layer manipulator's set_variable, this
      // keeps the rebind dormant outside the layer.
      // Wave 2.8 — if the parent layer is one-shot, also append a
      // set_variable=0 to the child's `to` array so the layer disarms after
      // this single child fires. Hold layers keep the variable until the
      // trigger is released (to_after_key_up does that).
      const childConditions: KarabinerCondition[] = [...conditions];
      const childToEvents: KarabinerTo[] = [actionEvent];
      let childToAfterKeyUp: KarabinerTo[] | undefined;
      const parentLayer = rule.layerName ? layerByName.get(rule.layerName) : undefined;
      if (parentLayer) {
        childConditions.push({
          type: 'variable_if',
          name: layerVarName(rule.layerName!),
          value: 1,
        });
        if (parentLayer.mode === 'oneshot') {
          childToEvents.push({
            set_variable: { name: layerVarName(rule.layerName!), value: 0 },
          });
          // Wave 2.9 — clear the notification after the child key is released.
          // Mirrors the activator's to_after_key_up SET; lives outside the
          // `to[]` so #4104 isn't triggered when `to[]` already contains
          // set_variable.
          if (parentLayer.notification !== undefined) {
            childToAfterKeyUp = [
              {
                set_notification_message: {
                  id: layerNotificationId(parentLayer.layerName),
                  text: '',
                },
              },
            ];
          }
        }
      }

      const childManipulator: KarabinerManipulator = {
        type: 'basic',
        from: buildKarabinerFrom(trigger),
        to: childToEvents,
        conditions: childConditions,
      };
      if (childToAfterKeyUp) childManipulator.to_after_key_up = childToAfterKeyUp;

      // Wave 2.9 — when the parent layer is lockable (oneshotLockOnTaps),
      // emit TWO child manipulators: one for unlocked one-shot (clears layer
      // + tapcount after firing — the "auto-disarm after one fire" pattern),
      // and one for locked state (DOES NOT clear — sticky until trigger
      // re-tap clears the lock). Karabiner first-match wins, so the locked
      // variant must come first since its condition is more specific.
      const manipulators: KarabinerManipulator[] = [];
      if (parentLayer && parentLayer.oneshotLockOnTaps === 2) {
        // Locked variant: fires the action but doesn't clear anything.
        const lockedChild: KarabinerManipulator = {
          type: 'basic',
          from: buildKarabinerFrom(trigger),
          to: [actionEvent],
          conditions: [
            ...conditions,
            {
              type: 'variable_if',
              name: layerVarName(rule.layerName!),
              value: 1,
            },
            {
              type: 'variable_if',
              name: layerLockedVar(rule.layerName!),
              value: 1,
            },
          ],
        };
        manipulators.push(lockedChild);
        // Unlocked variant: the original childManipulator but with an extra
        // locked==0 condition + a tapcount-clear added to the to[] events.
        // Re-build conditions so the locked-clause is explicit.
        const unlockedConds: KarabinerCondition[] = [
          ...conditions,
          {
            type: 'variable_if',
            name: layerVarName(rule.layerName!),
            value: 1,
          },
          {
            type: 'variable_if',
            name: layerLockedVar(rule.layerName!),
            value: 0,
          },
        ];
        const unlockedTo: KarabinerTo[] = [
          actionEvent,
          { set_variable: { name: layerVarName(rule.layerName!), value: 0 } },
          { set_variable: { name: layerTapCountVar(rule.layerName!), value: 0 } },
        ];
        const unlockedChild: KarabinerManipulator = {
          type: 'basic',
          from: buildKarabinerFrom(trigger),
          to: unlockedTo,
          conditions: unlockedConds,
        };
        if (childToAfterKeyUp) unlockedChild.to_after_key_up = childToAfterKeyUp;
        manipulators.push(unlockedChild);
      } else {
        manipulators.push(childManipulator);
      }

      output.rules.push({
        description: `${descPrefix}: ${rule.description}`,
        manipulators,
      });
    }
  }

  return output;
}
