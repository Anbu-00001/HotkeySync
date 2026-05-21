import {
  KARABINER_KEY_MAP,
  comboToKarabinerFrom,
  parseKeyCombo,
  type KeyCombo,
  type Modifier,
} from '@/lib/keys';
import type { Config } from '@/types';
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
  type: 'frontmost_application_if';
  bundle_identifiers: string[];
}

export interface KarabinerManipulator {
  type: 'basic';
  from: KarabinerFrom;
  to: KarabinerTo[];
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
    const app = getAppById(appId);
    // Defensive: store prevents unknown appIds; if one slips through, skip the whole group.
    if (!app) continue;

    const bundlePattern = escapeBundleId(app.bundleId);

    for (const rule of appRules) {
      let trigger: KeyCombo;
      let action: KeyCombo;
      try {
        trigger = parseKeyCombo(rule.trigger);
        action = parseKeyCombo(rule.action);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown parse error';
        // Generators must never throw — log and skip the rule.
        console.warn(
          `[karabiner] skipped rule for ${appId} (${rule.trigger} → ${rule.action}): ${message}`,
        );
        continue;
      }

      output.rules.push({
        description: `${app.name}: ${rule.description}`,
        manipulators: [
          {
            type: 'basic',
            from: buildKarabinerFrom(trigger),
            to: [buildKarabinerTo(action)],
            conditions: [
              {
                type: 'frontmost_application_if',
                bundle_identifiers: [bundlePattern],
              },
            ],
          },
        ],
      });
    }
  }

  return output;
}
