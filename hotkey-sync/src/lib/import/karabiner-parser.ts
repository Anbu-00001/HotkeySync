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
import type { App, HotkeyRule, OS } from '@/types';
import {
  TAP_HOLD_DEFAULT_TIMEOUT_MS,
  TAP_HOLD_MIN_TIMEOUT_MS,
  TAP_HOLD_MAX_TIMEOUT_MS,
} from '@/types';
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

// Lenient incoming schema: only the fields we actually consume; pass-through everything else.
const incomingToEventSchema = z.object({
  key_code: z.string().optional(),
  modifiers: z.array(z.string()).optional(),
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
    parameters: z
      .object({
        'basic.to_if_alone_timeout_milliseconds': z.number().optional(),
        'basic.to_if_held_down_threshold_milliseconds': z.number().optional(),
      })
      .passthrough()
      .optional(),
    conditions: z
      .array(
        z.object({
          type: z.string(),
          bundle_identifiers: z.array(z.string()).optional(),
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
      if (!frontmost) {
        warnings.push({
          rulePath: path,
          reason: 'Skipped — no frontmost_application_if condition (HotkeySync rules are per-app).',
        });
        continue;
      }
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
      const appId = BUNDLE_LOOKUP.get(bundleId.toLowerCase());
      if (!appId) {
        unknownBundleIds.add(bundleId);
        warnings.push({
          rulePath: path,
          reason: `Unknown bundle id "${bundleId}" — not in app catalog.`,
        });
        continue;
      }

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

      // Warn-then-skip on Karabiner features we don't model yet.
      if ((m.to_after_key_up?.length ?? 0) > 0) {
        warnings.push({
          rulePath: path,
          reason: '`to_after_key_up` is not supported yet — manipulator skipped.',
        });
        continue;
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
        tapEvt: { key_code?: string; modifiers?: string[] },
        holdEvt: { key_code?: string; modifiers?: string[] } | null,
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
        let holdCombo: string;
        if (holdEvt && holdEvt.key_code) {
          const r = buildCombo(holdEvt.key_code, holdEvt.modifiers ?? []);
          if (!r.ok) {
            warnings.push({ rulePath: path, reason: r.reason });
            return null;
          }
          holdCombo = r.combo;
        } else {
          // Fall back to the trigger itself — classic dual-role pattern where
          // the key continues to act as itself while held.
          holdCombo = triggerResult.combo;
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
          hold: holdCombo,
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
        rules.push({
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
        });
      } else if (hasAlone && !hasHeld && !hasTo) {
        const built = buildTapHold((m.to_if_alone ?? [])[0], null, 'alone-only');
        if (!built) continue;
        rules.push({
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
        });
      } else if (hasAlone && hasTo && !hasHeld) {
        const built = buildTapHold((m.to_if_alone ?? [])[0], null, 'dual-role');
        if (!built) continue;
        rules.push({
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
        });
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
        const actionResult = buildCombo(first.key_code, first.modifiers ?? []);
        if (!actionResult.ok) {
          warnings.push({ rulePath: path, reason: actionResult.reason });
          continue;
        }
        rules.push({
          kind: 'basic',
          appId,
          trigger: triggerResult.combo,
          action: actionResult.combo,
          description:
            cleanedDescription.length > 0
              ? cleanedDescription
              : 'Imported from Karabiner',
        });
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
