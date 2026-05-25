/**
 * Karabiner-Elements JSON → HotkeySync rule importer.
 *
 * Accepts any complex_modifications JSON (file or pasted) and reverse-maps
 * what it can into HotkeyRule[]. Manipulators it can't handle (simultaneous
 * keys, to_if_alone, set_variable, etc.) are reported as warnings — never
 * silently dropped.
 *
 * Round-trip guarantee: anything produced by `generateKarabiner` re-imports
 * to the same HotkeyRule set, modulo description prefixing.
 */

import { z } from 'zod';
import appsData from '@/data/apps.json';
import type { Action, App, HotkeyRule, LayerHotkeyRule, ModifierAction, OS } from '@/types';
import {
  TAP_HOLD_DEFAULT_TIMEOUT_MS,
  TAP_HOLD_MIN_TIMEOUT_MS,
  TAP_HOLD_MAX_TIMEOUT_MS,
  GLOBAL_APP_ID,
} from '@/types';
import { canonicaliseModifiers } from '@/lib/actions';
import {
  serializeKeyCombo,
  KARABINER_KEY_MAP,
  type Modifier,
  type TriggerKey,
} from '@/lib/keys';

const APPS = appsData as App[];

const BUNDLE_LOOKUP = new Map<string, string>(
  APPS.filter((a): a is App & { bundleId: string } => Boolean(a.bundleId)).map(
    (a) => [a.bundleId.toLowerCase(), a.id],
  ),
);

// Build inverse KARABINER_KEY_MAP: Karabiner key_code → TriggerKey.
const KARABINER_TO_TRIGGER_KEY = (() => {
  const out: Record<string, TriggerKey> = {};
  for (const [tk, kc] of Object.entries(KARABINER_KEY_MAP)) {
    out[kc] = tk as TriggerKey;
  }
  return out;
})();

// Karabiner modifier names → our Modifier. Accept both bare and left_/right_
// prefixed forms (Karabiner aliases left_command to command in `from`, but
// uses left_command in `to`).
const KARABINER_TO_MODIFIER: Record<string, Modifier> = {
  control: 'ctrl',
  left_control: 'ctrl',
  right_control: 'ctrl',
  shift: 'shift',
  left_shift: 'shift',
  right_shift: 'shift',
  option: 'alt',
  left_option: 'alt',
  right_option: 'alt',
  command: 'meta',
  left_command: 'meta',
  right_command: 'meta',
};

/**
 * Wave 2.6 — Karabiner key_codes that map directly to one of our Modifiers
 * (no associated trigger key). Used to detect modifier-only `to` events for
 * import as ModifierAction. The carrier-key trick (modifier as key_code +
 * additional modifiers in `modifiers[]`) is handled by the caller.
 */
const KARABINER_KEYCODE_TO_MODIFIER: Record<string, Modifier> = {
  left_control: 'ctrl',
  right_control: 'ctrl',
  left_shift: 'shift',
  right_shift: 'shift',
  left_option: 'alt',
  right_option: 'alt',
  left_command: 'meta',
  right_command: 'meta',
};

// Lenient incoming schema: only the fields we actually consume; pass-through everything else.
const incomingToEventSchema = z.object({
  key_code: z.string().optional(),
  modifiers: z.array(z.string()).optional(),
  // Wave 2.6 — `lazy: true` round-trips for ModifierAction events.
  lazy: z.boolean().optional(),
  // Wave 2.7 — `set_variable` for layer activators (to[0]) and clears
  // (to_after_key_up[0]). Variable name encodes layerName.
  set_variable: z
    .object({ name: z.string(), value: z.number().int() })
    .optional(),
  // Wave 2.9 — `set_notification_message` for armed-state HUD indicators.
  set_notification_message: z
    .object({ id: z.string(), text: z.string() })
    .optional(),
});

const incomingManipulatorSchema = z
  .object({
    type: z.string(),
    from: z
      .object({
        key_code: z.string().optional(),
        modifiers: z
          .object({
            mandatory: z.array(z.string()).optional(),
            optional: z.array(z.string()).optional(),
          })
          .optional(),
      })
      .optional(),
    to: z.array(incomingToEventSchema).optional(),
    to_if_alone: z.array(incomingToEventSchema).optional(),
    to_if_held_down: z.array(incomingToEventSchema).optional(),
    to_after_key_up: z.array(incomingToEventSchema).optional(),
    // Wave 2.8 — one-shot layers use to_if_invoked to clear the variable on
    // timeout. We tolerate to_if_canceled on import even though we don't emit it.
    to_delayed_action: z
      .object({
        to_if_invoked: z.array(incomingToEventSchema).optional(),
        to_if_canceled: z.array(incomingToEventSchema).optional(),
      })
      .passthrough()
      .optional(),
    parameters: z
      .object({
        'basic.to_if_alone_timeout_milliseconds': z.number().optional(),
        'basic.to_if_held_down_threshold_milliseconds': z.number().optional(),
        // Wave 2.8 — one-shot timeout in milliseconds.
        'basic.to_delayed_action_delay_milliseconds': z.number().optional(),
      })
      .passthrough()
      .optional(),
    conditions: z
      .array(
        z.object({
          type: z.string(),
          bundle_identifiers: z.array(z.string()).optional(),
          // Wave 2.7 — `variable_if`: name + value identifying a layer gate.
          name: z.string().optional(),
          value: z.number().int().optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

const incomingRuleSchema = z
  .object({
    description: z.string().optional(),
    manipulators: z.array(incomingManipulatorSchema).optional(),
  })
  .passthrough();

export const karabinerImportSchema = z
  .object({
    title: z.string().optional(),
    rules: z.array(incomingRuleSchema).optional(),
  })
  .passthrough();

export type IncomingKarabinerBlob = z.infer<typeof karabinerImportSchema>;

/**
 * Wave 2.7 — strip the standard layer-variable prefix. Our generator emits
 * `hotkeysync_layer_<name>` (underscores in `<name>` for dashed layerNames);
 * we reverse the encoding here. Imports from other tools (Goku, karabiner.ts)
 * use bare names without a prefix, which we accept verbatim if they still
 * match the layerName regex.
 */
function unprefixLayerVarName(varName: string): string {
  const PREFIX = 'hotkeysync_layer_';
  const stripped = varName.startsWith(PREFIX) ? varName.slice(PREFIX.length) : varName;
  return stripped.replace(/_/g, '-');
}

/**
 * Wave 2.7 — mirrors the schema's layerName shape so we don't construct a
 * rule that would fail validation later. Avoids needing to import the Zod
 * schema here (which would create a runtime cycle with parser tests).
 */
function isValidLayerName(name: string): boolean {
  if (name.length < 1 || name.length > 32) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name);
}

function unescapeBundleRegex(pattern: string): string | null {
  // Accept '^com\.google\.Chrome$', 'com\.google\.Chrome', or plain 'com.google.Chrome'.
  let p = pattern;
  if (p.startsWith('^')) p = p.slice(1);
  if (p.endsWith('$')) p = p.slice(0, -1);
  // Replace any escaped dot \. with a literal dot.
  p = p.replace(/\\\./g, '.');
  // If any other regex special chars remain (|, *, +, ?, [, etc.), it's not a
  // straightforward bundle ID pattern — refuse to guess.
  if (/[|*+?[\](){}\\]/.test(p)) return null;
  return p;
}

export interface KarabinerImportWarning {
  rulePath: string;
  reason: string;
}

export interface KarabinerImportResult {
  rules: HotkeyRule[];
  warnings: KarabinerImportWarning[];
  unknownBundleIds: string[];
  selectedAppIds: string[];
  os: OS;
}

export interface KarabinerImportFailure {
  ok: false;
  error: { kind: 'malformed-json' | 'schema-violation'; message: string };
}

export type KarabinerImportOutcome =
  | { ok: true; result: KarabinerImportResult }
  | KarabinerImportFailure;

/**
 * Wave 2.6 — try to interpret a Karabiner `to` event as a ModifierAction.
 * Returns null if the event is a regular key (caller should fall through to
 * `buildCombo`). Handles:
 *   - Pure single-modifier output: `{ key_code: 'left_control' }`
 *   - Carrier-key bundle: `{ key_code: 'left_shift', modifiers: ['left_command', ...] }`
 *     (every entry must be a modifier — if anything resolves to a real key,
 *     it's NOT a ModifierAction)
 *   - `lazy: true` propagated to the result.
 */
function tryBuildModifierAction(event: {
  key_code?: string;
  modifiers?: string[];
  lazy?: boolean;
}): ModifierAction | null {
  if (!event.key_code) return null;
  const carrier = KARABINER_KEYCODE_TO_MODIFIER[event.key_code];
  if (!carrier) return null;
  const mods: Modifier[] = [carrier];
  for (const m of event.modifiers ?? []) {
    const mapped = KARABINER_TO_MODIFIER[m];
    if (!mapped) return null;
    mods.push(mapped);
  }
  const out: ModifierAction = {
    kind: 'modifier',
    modifiers: canonicaliseModifiers(mods),
  };
  if (event.lazy) (out as { lazy?: boolean }).lazy = true;
  return out;
}

function buildCombo(
  keyCode: string,
  modifierStrings: string[],
): { ok: true; combo: string } | { ok: false; reason: string } {
  const triggerKey = KARABINER_TO_TRIGGER_KEY[keyCode];
  if (!triggerKey) {
    return { ok: false, reason: `Unknown Karabiner key_code "${keyCode}"` };
  }
  const mods: Modifier[] = [];
  for (const m of modifierStrings) {
    const mapped = KARABINER_TO_MODIFIER[m];
    if (!mapped) {
      return { ok: false, reason: `Unknown Karabiner modifier "${m}"` };
    }
    mods.push(mapped);
  }
  return {
    ok: true,
    combo: serializeKeyCombo({
      modifiers: Array.from(new Set(mods)).sort((a, b) => a.localeCompare(b)),
      key: triggerKey,
    }),
  };
}

export function parseKarabinerJSON(source: string): KarabinerImportOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'JSON.parse failed';
    return { ok: false, error: { kind: 'malformed-json', message } };
  }

  const validated = karabinerImportSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      ok: false,
      error: {
        kind: 'schema-violation',
        message:
          validated.error.issues[0]?.message ??
          'Not a recognisable Karabiner JSON shape',
      },
    };
  }

  const blob = validated.data;
  const rules: HotkeyRule[] = [];
  const warnings: KarabinerImportWarning[] = [];
  const unknownBundleIds = new Set<string>();
  const selectedOrder: string[] = [];
  const seenApps = new Set<string>();

  const incomingRules = blob.rules ?? [];
  for (let ri = 0; ri < incomingRules.length; ri++) {
    const rule = incomingRules[ri];
    const manips = rule.manipulators ?? [];
    for (let mi = 0; mi < manips.length; mi++) {
      const m = manips[mi];
      const path = `rules[${ri}].manipulators[${mi}]`;

      if (m.type !== 'basic') {
        warnings.push({
          rulePath: path,
          reason: `Skipped — manipulator type "${m.type}" is not supported yet (only "basic").`,
        });
        continue;
      }

      const from = m.from;
      if (!from?.key_code) {
        warnings.push({ rulePath: path, reason: 'Skipped — missing from.key_code.' });
        continue;
      }

      const conditions = m.conditions ?? [];
      const frontmost = conditions.find(
        (c) => c.type === 'frontmost_application_if',
      );
      const frontmostUnless = conditions.find(
        (c) => c.type === 'frontmost_application_unless',
      );

      let appId: string;
      let exceptApps: string[] | undefined;

      if (frontmost) {
        // Per-app rule.
        const bundlePatterns = frontmost.bundle_identifiers ?? [];
        if (bundlePatterns.length === 0) {
          warnings.push({ rulePath: path, reason: 'Skipped — empty bundle_identifiers.' });
          continue;
        }
        if (bundlePatterns.length > 1) {
          warnings.push({
            rulePath: path,
            reason: `Source rule covers ${bundlePatterns.length} apps; only the first will be imported.`,
          });
        }
        const bundleId = unescapeBundleRegex(bundlePatterns[0]);
        if (!bundleId) {
          warnings.push({
            rulePath: path,
            reason: `Could not parse bundle_identifier regex "${bundlePatterns[0]}".`,
          });
          continue;
        }
        const resolved = BUNDLE_LOOKUP.get(bundleId.toLowerCase());
        if (!resolved) {
          unknownBundleIds.add(bundleId);
          warnings.push({
            rulePath: path,
            reason: `Unknown bundle id "${bundleId}" — not in app catalog.`,
          });
          continue;
        }
        appId = resolved;
      } else {
        // No frontmost_application_if → global rule. Optionally an exclusion
        // list via frontmost_application_unless.
        appId = GLOBAL_APP_ID;
        if (frontmostUnless) {
          const resolvedExceptions: string[] = [];
          const unknownExceptions: string[] = [];
          for (const pat of frontmostUnless.bundle_identifiers ?? []) {
            const bid = unescapeBundleRegex(pat);
            if (!bid) {
              unknownExceptions.push(pat);
              continue;
            }
            const id = BUNDLE_LOOKUP.get(bid.toLowerCase());
            if (id) resolvedExceptions.push(id);
            else unknownExceptions.push(bid);
          }
          if (resolvedExceptions.length > 0) {
            exceptApps = resolvedExceptions;
          }
          if (unknownExceptions.length > 0) {
            warnings.push({
              rulePath: path,
              reason: `Global rule excludes ${unknownExceptions.length} unknown app(s) — those exclusions were dropped: ${unknownExceptions.slice(0, 3).join(', ')}${unknownExceptions.length > 3 ? '…' : ''}`,
            });
          }
        }
      }

      // Helper: attach exceptApps onto a rule literal iff present. Avoids
      // sprinkling spread-and-conditional logic across every rules.push site.
      const attachExcept = <R extends HotkeyRule>(r: R): R =>
        exceptApps ? ({ ...r, exceptApps } as R) : r;

      const triggerResult = buildCombo(
        from.key_code,
        from.modifiers?.mandatory ?? [],
      );
      if (!triggerResult.ok) {
        warnings.push({ rulePath: path, reason: triggerResult.reason });
        continue;
      }

      // Strip our own "{App.name}: " prefix from descriptions for cleaner re-edit.
      const sourceDescription = rule.description ?? '';
      const appName = APPS.find((a) => a.id === appId)?.name;
      const cleanedDescription =
        appName && sourceDescription.startsWith(`${appName}: `)
          ? sourceDescription.slice(appName.length + 2)
          : sourceDescription;

      // Wave 2.9 — detect lock-on-tap by scanning the entire incoming rule
      // (which carries 3 manipulators all with the same `from`) for a
      // set_variable event targeting `<varBase>_locked` with value 1. If
      // present, we re-shape the in-progress LayerHotkeyRule with
      // `oneshotLockOnTaps: 2`. The rule's OTHER manipulators (lock-clear,
      // lock-promoter) are then implicit — we recognise them as part of the
      // activator and don't double-emit anything.
      const allRuleManips = rule.manipulators ?? [];
      const ruleHasLockMarker = allRuleManips.some((mm) =>
        (mm.to ?? []).some(
          (e) =>
            e.set_variable !== undefined &&
            /_locked$/.test(e.set_variable.name) &&
            e.set_variable.value === 1,
        ),
      );

      // Skip the lock-clear and lock-promoter helper manipulators when the
      // rule is a lock-on-tap layer. Only the first-tap manipulator (which
      // sets `<layer>_tapcount=1` AND `<layer>=1`) is parsed as the
      // activator. The rest are internal state-machine helpers.
      if (ruleHasLockMarker) {
        const setsTapCountOne = (m.to ?? []).some(
          (e) =>
            e.set_variable?.name.endsWith('_tapcount') &&
            e.set_variable?.value === 1,
        );
        const setsLayerOne = (m.to ?? []).some(
          (e) =>
            e.set_variable !== undefined &&
            !e.set_variable.name.endsWith('_tapcount') &&
            !e.set_variable.name.endsWith('_locked') &&
            e.set_variable.value === 1,
        );
        if (!(setsTapCountOne && setsLayerOne)) {
          // Internal helper manipulator — silently skip; the first-tap
          // manipulator carries the activator semantics for our schema.
          continue;
        }
      }

      // Wave 2.7 / 2.8 — detect a layer activator. Two shapes:
      //   - Hold layer: `to[0].set_variable` set to 1 + matching
      //     `to_after_key_up[0].set_variable` set to 0. Variable persists only
      //     while the trigger is held.
      //   - One-shot layer (Wave 2.8): `to[0].set_variable` set to 1, NO
      //     `to_after_key_up`. Optional `to_delayed_action.to_if_invoked` with
      //     a matching `set_variable: 0` event provides the timeout.
      // In both, variable name is `hotkeysync_layer_<name>` (our convention);
      // imports from other tools (karabiner.ts, Goku) work best-effort.
      // Find the layer-name set_variable (skip _tapcount / _locked helpers).
      // For non-lock layers there's only one entry; for lock-on-tap layers
      // the layer var lives at to[1] after the tapcount bump at to[0].
      const layerOn = (m.to ?? []).find(
        (e) =>
          e.set_variable !== undefined &&
          !e.set_variable.name.endsWith('_tapcount') &&
          !e.set_variable.name.endsWith('_locked'),
      )?.set_variable;
      const layerOffHold = m.to_after_key_up?.find(
        (e) =>
          e.set_variable !== undefined &&
          !e.set_variable.name.endsWith('_tapcount') &&
          !e.set_variable.name.endsWith('_locked'),
      )?.set_variable;
      const layerOffDelayed = m.to_delayed_action?.to_if_invoked?.find(
        (e) =>
          e.set_variable !== undefined &&
          !e.set_variable.name.endsWith('_tapcount') &&
          !e.set_variable.name.endsWith('_locked'),
      )?.set_variable;
      const isHoldLayer =
        !!layerOn &&
        !!layerOffHold &&
        layerOn.name === layerOffHold.name &&
        layerOn.value !== 0 &&
        layerOffHold.value === 0;
      // One-shot: set_variable=1 on `to`, no `to_after_key_up`. The delayed
      // action is optional — but if it exists it must clear the same variable.
      const isOneShotLayer =
        !!layerOn &&
        !layerOffHold &&
        layerOn.value !== 0 &&
        (layerOffDelayed === undefined ||
          (layerOffDelayed.name === layerOn.name && layerOffDelayed.value === 0));
      if (layerOn && (isHoldLayer || isOneShotLayer)) {
        const layerName = unprefixLayerVarName(layerOn.name);
        if (!isValidLayerName(layerName)) {
          warnings.push({
            rulePath: path,
            reason: `Could not extract a usable layerName from variable "${layerOn.name}"; layer skipped.`,
          });
          continue;
        }
        const mode: 'hold' | 'oneshot' = isHoldLayer ? 'hold' : 'oneshot';
        // Optional dual-role tap action via `to_if_alone[0]` (hold layers only;
        // schema rejects tapAction on oneshot mode).
        let tapAction: Action | undefined;
        if (mode === 'hold') {
          const aloneEvt = m.to_if_alone?.[0];
          if (aloneEvt?.key_code) {
            const modAction = tryBuildModifierAction(aloneEvt);
            if (modAction) {
              tapAction = modAction;
            } else {
              const r = buildCombo(aloneEvt.key_code, aloneEvt.modifiers ?? []);
              if (r.ok) tapAction = r.combo;
            }
          }
        }
        const layerRule: LayerHotkeyRule = {
          kind: 'layer',
          appId,
          trigger: triggerResult.combo,
          layerName,
          mode,
          description:
            cleanedDescription.length > 0
              ? cleanedDescription
                  .replace(/\s*\(one-shot layer\)\s*$/, '')
                  .replace(/\s*\(layer\)\s*$/, '')
              : 'Imported layer',
        };
        if (tapAction !== undefined) layerRule.tapAction = tapAction;
        if (m.to?.[0]?.lazy === false) layerRule.passthroughModifiers = false;
        // Wave 2.8 — recover oneshotTimeoutMs from parameters when a delayed
        // action is wired up to clear the variable.
        if (mode === 'oneshot' && layerOffDelayed !== undefined) {
          const delay = m.parameters?.['basic.to_delayed_action_delay_milliseconds'];
          if (typeof delay === 'number' && delay >= 100 && delay <= 10_000) {
            layerRule.oneshotTimeoutMs = delay;
          }
        }
        // Wave 2.9 — lock-on-tap: any manipulator in this rule emits
        // <layer>_locked := 1, which is the marker the lock-promoter sets.
        // The rule also carries multiple manipulators (lock-clear,
        // lock-promoter, first-tap); we treat the whole rule as one
        // activator with `oneshotLockOnTaps: 2`. The other manipulators
        // get skipped via the early-continue below.
        if (mode === 'oneshot' && ruleHasLockMarker) {
          layerRule.oneshotLockOnTaps = 2;
          // The first-tap manipulator carries the tap-window in its
          // to_delayed_action delay. Recover if present.
          const firstTapM = allRuleManips.find(
            (mm) =>
              (mm.to ?? []).some(
                (e) =>
                  e.set_variable?.name?.endsWith('_tapcount') &&
                  e.set_variable?.value === 1,
              ),
          );
          const tapDelay =
            firstTapM?.parameters?.['basic.to_delayed_action_delay_milliseconds'];
          if (typeof tapDelay === 'number' && tapDelay >= 100 && tapDelay <= 10_000) {
            layerRule.oneshotTimeoutMs = tapDelay;
          }
        }
        // Wave 2.9 — recover notification text from a `set_notification_message`
        // event in `to_after_key_up`. Only one-shot layers carry this (hold
        // mode is schema-rejected for notification).
        if (mode === 'oneshot') {
          const notifEvt = m.to_after_key_up?.find(
            (e) => e.set_notification_message?.id === `hks_${layerName.replace(/-/g, '_')}`,
          );
          const notifText = notifEvt?.set_notification_message?.text;
          if (typeof notifText === 'string') {
            // Empty string from the source means our generator's "auto-label"
            // mode — but we don't know whether the user originally typed the
            // auto label or left it empty. Round-trip preserves whichever the
            // source had; if the text matches the auto-label exactly, prefer
            // the empty-string form so re-emits stay byte-identical.
            const autoLabel = `${layerName} layer armed`;
            layerRule.notification = notifText === autoLabel ? '' : notifText;
          }
        }
        rules.push(attachExcept(layerRule));
        if (!seenApps.has(appId)) {
          seenApps.add(appId);
          selectedOrder.push(appId);
        }
        continue;
      }

      // Warn-then-skip when only one half of the layer activator pattern is
      // present — likely hand-written rules we don't model. Wave 2.9 relaxes
      // this: if every entry in `to_after_key_up` is a
      // `set_notification_message` (which is how layer-child notification
      // clears are emitted), the rest of the manipulator can be parsed
      // normally; the clear event itself is informational.
      if ((m.to_after_key_up?.length ?? 0) > 0) {
        const allNotification = m.to_after_key_up!.every(
          (e) => e.set_notification_message !== undefined,
        );
        if (!allNotification) {
          warnings.push({
            rulePath: path,
            reason: '`to_after_key_up` is not supported yet — manipulator skipped.',
          });
          continue;
        }
      }

      // Wave 2.7 — detect a layer child via `variable_if` condition. The
      // matched variable name maps back to a layerName; the child is
      // otherwise a normal basic rule that gains `layerName`.
      // Wave 2.9 — when the rule is the locked-variant of a lock-on-tap
      // child (variable_if `<layer>_locked == 1`), skip it — the unlocked
      // variant alone is sufficient to round-trip the child once we know the
      // parent has lockOnTaps. Picking the LAYER variable_if (not the
      // helper companions) recovers the layerName cleanly.
      const isLockedVariantChild = conditions.some(
        (c) =>
          c.type === 'variable_if' &&
          typeof c.name === 'string' &&
          c.name.endsWith('_locked') &&
          c.value === 1,
      );
      if (isLockedVariantChild) {
        // Locked-variant of a lock-on-tap child — silently skip. The
        // unlocked variant (same `from`, separate manipulator) carries the
        // round-trip data.
        continue;
      }
      const variableIfCond = conditions.find(
        (c) =>
          c.type === 'variable_if' &&
          typeof c.name === 'string' &&
          !c.name.endsWith('_tapcount') &&
          !c.name.endsWith('_locked'),
      );
      let childLayerName: string | undefined;
      if (
        variableIfCond &&
        typeof variableIfCond.name === 'string' &&
        variableIfCond.value !== 0
      ) {
        const candidate = unprefixLayerVarName(variableIfCond.name);
        if (isValidLayerName(candidate)) childLayerName = candidate;
      }

      const hasTo = (m.to?.length ?? 0) > 0;
      const hasAlone = (m.to_if_alone?.length ?? 0) > 0;
      const hasHeld = (m.to_if_held_down?.length ?? 0) > 0;

      // ------------- Decision matrix -------------
      // BASIC: `to` only.
      // TAP_HOLD (clean): to_if_alone + to_if_held_down (no `to`).
      // TAP_HOLD (approx, alone-only): to_if_alone only — hold defaults to trigger.
      // TAP_HOLD (dual-role): `to` + `to_if_alone` — hold defaults to trigger.
      // SKIP: to_if_held_down only.
      // SKIP: nothing.

      // Helper for tap_hold construction.
      const buildTapHold = (
        tapEvt: { key_code?: string; modifiers?: string[]; lazy?: boolean },
        holdEvt: { key_code?: string; modifiers?: string[]; lazy?: boolean } | null,
        approxKind: 'clean' | 'alone-only' | 'dual-role',
      ) => {
        if (!tapEvt.key_code) {
          warnings.push({ rulePath: path, reason: 'Skipped — tap event missing key_code.' });
          return null;
        }
        const tapRes = buildCombo(tapEvt.key_code, tapEvt.modifiers ?? []);
        if (!tapRes.ok) {
          warnings.push({ rulePath: path, reason: tapRes.reason });
          return null;
        }
        let holdAction: Action;
        if (holdEvt && holdEvt.key_code) {
          // Wave 2.6: prefer ModifierAction shape if every event component is
          // a modifier (Caps Lock → LCtrl uses this).
          const modAction = tryBuildModifierAction(holdEvt);
          if (modAction) {
            holdAction = modAction;
          } else {
            const r = buildCombo(holdEvt.key_code, holdEvt.modifiers ?? []);
            if (!r.ok) {
              warnings.push({ rulePath: path, reason: r.reason });
              return null;
            }
            holdAction = r.combo;
          }
        } else {
          // Fall back to the trigger itself — classic dual-role pattern where
          // the key continues to act as itself while held.
          holdAction = triggerResult.combo;
        }
        if (approxKind !== 'clean') {
          warnings.push({
            rulePath: path,
            reason:
              approxKind === 'alone-only'
                ? 'Only `to_if_alone` provided — imported as tap_hold with hold action defaulting to the trigger.'
                : 'Dual-role pattern (`to` + `to_if_alone`) imported as tap_hold; hold action defaults to the trigger.',
          });
        }

        // Pull the timing parameter and clamp to bounds.
        const rawTimeout =
          m.parameters?.['basic.to_if_alone_timeout_milliseconds'] ??
          m.parameters?.['basic.to_if_held_down_threshold_milliseconds'] ??
          TAP_HOLD_DEFAULT_TIMEOUT_MS;
        const clamped = Math.max(
          TAP_HOLD_MIN_TIMEOUT_MS,
          Math.min(TAP_HOLD_MAX_TIMEOUT_MS, Math.round(rawTimeout)),
        );
        if (clamped !== rawTimeout) {
          warnings.push({
            rulePath: path,
            reason: `tap timeout ${rawTimeout}ms clamped to ${clamped}ms (allowed range ${TAP_HOLD_MIN_TIMEOUT_MS}–${TAP_HOLD_MAX_TIMEOUT_MS}ms).`,
          });
        }

        return {
          tap: tapRes.combo,
          hold: holdAction,
          timeoutMs: clamped,
        };
      };

      if (hasAlone && hasHeld) {
        // Clean tap_hold.
        const built = buildTapHold(
          (m.to_if_alone ?? [])[0],
          (m.to_if_held_down ?? [])[0],
          'clean',
        );
        if (!built) continue;
        if (hasTo) {
          warnings.push({
            rulePath: path,
            reason: '`to` was present alongside `to_if_alone`/`to_if_held_down` and was ignored.',
          });
        }
        rules.push(attachExcept({
          kind: 'tap_hold',
          appId,
          trigger: triggerResult.combo,
          tapAction: built.tap,
          holdAction: built.hold,
          tapTimeoutMs: built.timeoutMs,
          description:
            cleanedDescription.length > 0
              ? cleanedDescription
              : 'Imported from Karabiner',
        }));
      } else if (hasAlone && !hasHeld && !hasTo) {
        const built = buildTapHold((m.to_if_alone ?? [])[0], null, 'alone-only');
        if (!built) continue;
        rules.push(attachExcept({
          kind: 'tap_hold',
          appId,
          trigger: triggerResult.combo,
          tapAction: built.tap,
          holdAction: built.hold,
          tapTimeoutMs: built.timeoutMs,
          description:
            cleanedDescription.length > 0
              ? cleanedDescription
              : 'Imported from Karabiner',
        }));
      } else if (hasAlone && hasTo && !hasHeld) {
        const built = buildTapHold((m.to_if_alone ?? [])[0], null, 'dual-role');
        if (!built) continue;
        rules.push(attachExcept({
          kind: 'tap_hold',
          appId,
          trigger: triggerResult.combo,
          tapAction: built.tap,
          holdAction: built.hold,
          tapTimeoutMs: built.timeoutMs,
          description:
            cleanedDescription.length > 0
              ? cleanedDescription
              : 'Imported from Karabiner',
        }));
      } else if (hasHeld && !hasAlone) {
        warnings.push({
          rulePath: path,
          reason: 'Skipped — `to_if_held_down` without `to_if_alone` is unusual and not supported yet.',
        });
        continue;
      } else if (hasTo) {
        // Plain basic rule.
        const toArr = m.to ?? [];
        if (toArr.length > 1) {
          warnings.push({
            rulePath: path,
            reason: `Multi-step "to" sequences (length ${toArr.length}) not yet supported — using only the first step.`,
          });
        }
        const first = toArr[0];
        if (!first?.key_code) {
          warnings.push({ rulePath: path, reason: 'Skipped — missing or empty `to` array.' });
          continue;
        }
        // Wave 2.6 — if every component of `to` is a modifier, import as a
        // ModifierAction rather than failing on "Unknown key_code left_control".
        const modAction = tryBuildModifierAction(first);
        if (modAction) {
          rules.push(attachExcept({
            kind: 'basic',
            appId,
            trigger: triggerResult.combo,
            action: modAction,
            description:
              cleanedDescription.length > 0
                ? cleanedDescription
                : 'Imported from Karabiner',
            ...(childLayerName ? { layerName: childLayerName } : {}),
          }));
          if (!seenApps.has(appId)) {
            seenApps.add(appId);
            selectedOrder.push(appId);
          }
          continue;
        }
        // vk_none / vk_consumer_play / vk_consumer_* with no modifiers is
        // Karabiner's convention for "swallow the keystroke" — import as a
        // disable rule. vk_none is what we emit; the broader vk_* family is
        // accepted defensively since gallery rules vary.
        if (first.key_code === 'vk_none' && (first.modifiers ?? []).length === 0) {
          rules.push(attachExcept({
            kind: 'disable',
            appId,
            trigger: triggerResult.combo,
            description:
              cleanedDescription.length > 0
                ? cleanedDescription
                : 'Imported from Karabiner (disabled)',
          }));
          if (!seenApps.has(appId)) {
            seenApps.add(appId);
            selectedOrder.push(appId);
          }
          continue;
        }
        const actionResult = buildCombo(first.key_code, first.modifiers ?? []);
        if (!actionResult.ok) {
          warnings.push({ rulePath: path, reason: actionResult.reason });
          continue;
        }
        rules.push(attachExcept({
          kind: 'basic',
          appId,
          trigger: triggerResult.combo,
          action: actionResult.combo,
          description:
            cleanedDescription.length > 0
              ? cleanedDescription
              : 'Imported from Karabiner',
          ...(childLayerName ? { layerName: childLayerName } : {}),
        }));
      } else {
        warnings.push({
          rulePath: path,
          reason: 'Skipped — manipulator has no `to`, `to_if_alone`, or `to_if_held_down`.',
        });
        continue;
      }

      if (!seenApps.has(appId)) {
        seenApps.add(appId);
        selectedOrder.push(appId);
      }
    }
  }

  return {
    ok: true,
    result: {
      rules,
      warnings,
      unknownBundleIds: Array.from(unknownBundleIds),
      selectedAppIds: selectedOrder,
      os: 'mac',
    },
  };
}
