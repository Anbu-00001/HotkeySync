import {
  KARABINER_KEY_MAP,
  comboToKarabinerFrom,
  parseKeyCombo,
  type KeyCombo,
  type Modifier,
} from '@/lib/keys';
import type { Config } from '@/types';
import { GLOBAL_APP_ID } from '@/types';
import { getAppById, groupRulesByAppId } from '@/lib/generators/shared';

export interface KarabinerFromModifiers {
  mandatory?: string[];
  optional?: string[];
}

export interface KarabinerFrom {
  key_code: string;
  modifiers?: KarabinerFromModifiers;
}

export interface KarabinerTo {
  key_code: string;
  modifiers?: string[];
}

export interface KarabinerCondition {
  type: 'frontmost_application_if' | 'frontmost_application_unless';
  bundle_identifiers: string[];
}

/**
 * Per-manipulator parameter overrides. Used by tap_hold rules to control the
 * tap timeout vs hold threshold (we set both to the same value).
 * See https://karabiner-elements.pqrs.org/docs/json/complex-modifications-manipulator-definition/parameters/
 */
export interface KarabinerManipulatorParameters {
  'basic.to_if_alone_timeout_milliseconds'?: number;
  'basic.to_if_held_down_threshold_milliseconds'?: number;
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

export function generateKarabiner(config: Config): KarabinerOutput {
  const output: KarabinerOutput = {
    title: 'HotkeySync — My Config',
    rules: [],
  };

  if (config.rules.length === 0) return output;

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
        let hold: KeyCombo;
        try {
          trigger = parseKeyCombo(rule.trigger);
          tap = parseKeyCombo(rule.tapAction);
          hold = parseKeyCombo(rule.holdAction);
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
              to_if_held_down: [buildKarabinerTo(hold)],
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
      let action: KeyCombo;
      try {
        trigger = parseKeyCombo(rule.trigger);
        action = parseKeyCombo(rule.action);
      } catch {
        // Defensive skip — same reasoning as the tap_hold branch above.
        continue;
      }

      output.rules.push({
        description: `${descPrefix}: ${rule.description}`,
        manipulators: [
          {
            type: 'basic',
            from: buildKarabinerFrom(trigger),
            to: [buildKarabinerTo(action)],
            conditions,
          },
        ],
      });
    }
  }

  return output;
}
