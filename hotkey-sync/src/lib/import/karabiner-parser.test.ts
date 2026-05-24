import { describe, it, expect } from 'vitest';
import { parseKarabinerJSON } from '@/lib/import/karabiner-parser';
import { generateKarabiner } from '@/lib/generators/karabiner';
import { PRESETS } from '@/data/presets';
import type { Config } from '@/types';

function jsonStr(cfg: Config): string {
  return JSON.stringify(generateKarabiner(cfg), null, 2);
}

describe('Karabiner round-trip — generate → parse', () => {
  it('preserves a single ctrl+p → ctrl+comma Chrome rule', () => {
    const cfg: Config = {
      os: 'mac',
      rules: [
        { kind: 'basic',
          appId: 'google-chrome',
          trigger: 'ctrl+p',
          action: 'ctrl+comma',
          description: 'Open Preferences',
        },
      ],
    };
    const out = parseKarabinerJSON(jsonStr(cfg));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.rules).toHaveLength(1);
    expect(out.result.rules[0]).toMatchObject({ kind: 'basic',
      appId: 'google-chrome',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
      description: 'Open Preferences',
    });
  });

  it('preserves all presets (including tap_hold) through round-trip', () => {
    for (const preset of PRESETS) {
      const cfg: Config = { os: 'mac', rules: preset.rules };
      const out = parseKarabinerJSON(jsonStr(cfg));
      expect(out.ok, `preset "${preset.id}" failed to parse`).toBe(true);
      if (!out.ok) continue;
      expect(out.result.rules.length).toBe(preset.rules.length);
    }
  });

  it('reports os as "mac"', () => {
    const out = parseKarabinerJSON('{"title":"x","rules":[]}');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.os).toBe('mac');
  });

  it('records selectedAppIds from imported rules', () => {
    const cfg: Config = {
      os: 'mac',
      rules: [
        { kind: 'basic', appId: 'google-chrome', trigger: 'ctrl+p', action: 'ctrl+comma', description: 'a' },
        { kind: 'basic', appId: 'vs-code', trigger: 'ctrl+w', action: 'ctrl+shift+w', description: 'b' },
        { kind: 'basic', appId: 'google-chrome', trigger: 'ctrl+w', action: 'ctrl+shift+w', description: 'c' },
      ],
    };
    const out = parseKarabinerJSON(jsonStr(cfg));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.selectedAppIds).toEqual(['google-chrome', 'vs-code']);
  });

  it('strips "{App.name}: " prefix from descriptions on import', () => {
    const cfg: Config = {
      os: 'mac',
      rules: [
        { kind: 'basic',
          appId: 'google-chrome',
          trigger: 'ctrl+p',
          action: 'ctrl+comma',
          description: 'Open Preferences',
        },
      ],
    };
    const out = parseKarabinerJSON(jsonStr(cfg));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.rules[0].description).toBe('Open Preferences');
  });
});

describe('Karabiner importer — failure modes', () => {
  it('returns malformed-json on invalid JSON', () => {
    const out = parseKarabinerJSON('{not valid');
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.kind).toBe('malformed-json');
  });

  it('accepts empty rules array', () => {
    const out = parseKarabinerJSON('{"title":"x","rules":[]}');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.rules).toEqual([]);
  });

  it('warns and skips non-basic manipulator types', () => {
    const src = JSON.stringify({
      title: 'x',
      rules: [
        {
          description: 'd',
          manipulators: [
            { type: 'mouse_motion_to_scroll', from: { key_code: 'p' } },
          ],
        },
      ],
    });
    const out = parseKarabinerJSON(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.rules).toHaveLength(0);
    expect(out.result.warnings[0].reason).toMatch(/not supported.*basic/);
  });

  it('imports rules with no frontmost_application_if condition as global', () => {
    // Karabiner treats "no conditions" as "applies in every frontmost app".
    // After Wave 2.5 we mirror that: such a rule imports with appId = __global.
    const src = JSON.stringify({
      title: 'x',
      rules: [
        {
          description: 'global remap',
          manipulators: [
            {
              type: 'basic',
              from: { key_code: 'p', modifiers: { mandatory: ['control'] } },
              to: [{ key_code: 'comma', modifiers: ['left_control'] }],
              conditions: [],
            },
          ],
        },
      ],
    });
    const out = parseKarabinerJSON(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.rules).toHaveLength(1);
    expect(out.result.rules[0]).toMatchObject({
      kind: 'basic',
      appId: '__global',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
    });
  });

  it('warns on unknown bundle ids and records them', () => {
    const src = JSON.stringify({
      title: 'x',
      rules: [
        {
          manipulators: [
            {
              type: 'basic',
              from: { key_code: 'p', modifiers: { mandatory: ['control'] } },
              to: [{ key_code: 'comma', modifiers: ['left_control'] }],
              conditions: [
                {
                  type: 'frontmost_application_if',
                  bundle_identifiers: ['^com\\.unknown\\.App$'],
                },
              ],
            },
          ],
        },
      ],
    });
    const out = parseKarabinerJSON(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.rules).toHaveLength(0);
    expect(out.result.unknownBundleIds).toContain('com.unknown.App');
  });

  it('accepts unanchored bundle_identifier patterns', () => {
    const src = JSON.stringify({
      title: 'x',
      rules: [
        {
          manipulators: [
            {
              type: 'basic',
              from: { key_code: 'p', modifiers: { mandatory: ['control'] } },
              to: [{ key_code: 'comma', modifiers: ['left_control'] }],
              conditions: [
                {
                  type: 'frontmost_application_if',
                  bundle_identifiers: ['com.google.Chrome'],
                },
              ],
            },
          ],
        },
      ],
    });
    const out = parseKarabinerJSON(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.rules).toHaveLength(1);
    expect(out.result.rules[0].appId).toBe('google-chrome');
  });

  it('refuses bundle patterns with unsupported regex constructs', () => {
    const src = JSON.stringify({
      title: 'x',
      rules: [
        {
          manipulators: [
            {
              type: 'basic',
              from: { key_code: 'p' },
              to: [{ key_code: 'q' }],
              conditions: [
                {
                  type: 'frontmost_application_if',
                  bundle_identifiers: ['^(com.a|com.b)$'],
                },
              ],
            },
          ],
        },
      ],
    });
    const out = parseKarabinerJSON(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.rules).toHaveLength(0);
    expect(out.result.warnings[0].reason).toMatch(/Could not parse bundle_identifier regex/);
  });

  it('warns when a rule covers multiple bundle ids but imports the first', () => {
    const src = JSON.stringify({
      title: 'x',
      rules: [
        {
          manipulators: [
            {
              type: 'basic',
              from: { key_code: 'p', modifiers: { mandatory: ['control'] } },
              to: [{ key_code: 'comma', modifiers: ['left_control'] }],
              conditions: [
                {
                  type: 'frontmost_application_if',
                  bundle_identifiers: [
                    '^com\\.google\\.Chrome$',
                    '^org\\.mozilla\\.firefox$',
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const out = parseKarabinerJSON(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.rules).toHaveLength(1);
    expect(out.result.rules[0].appId).toBe('google-chrome');
    expect(out.result.warnings.some((w) => /covers 2 apps/.test(w.reason))).toBe(
      true,
    );
  });

  it('does not throw on totally malformed JSON', () => {
    expect(() => parseKarabinerJSON('!@#$%')).not.toThrow();
  });
});

describe('Karabiner importer — tap_hold patterns', () => {
  it('clean tap_hold (to_if_alone + to_if_held_down) round-trips perfectly', () => {
    const cfg: Config = {
      os: 'mac',
      rules: [
        {
          kind: 'tap_hold',
          appId: 'vs-code',
          trigger: 'meta+grave_accent',
          tapAction: 'escape',
          holdAction: 'ctrl+grave_accent',
          tapTimeoutMs: 200,
          description: 'Tap → Esc, Hold → terminal',
        },
      ],
    };
    const json = JSON.stringify(generateKarabiner(cfg), null, 2);
    const out = parseKarabinerJSON(json);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.rules).toHaveLength(1);
    expect(out.result.rules[0]).toMatchObject({
      kind: 'tap_hold',
      appId: 'vs-code',
      trigger: 'meta+grave_accent',
      tapAction: 'escape',
      holdAction: 'ctrl+grave_accent',
      tapTimeoutMs: 200,
    });
  });

  it('reads tapTimeoutMs from parameters when present', () => {
    const src = JSON.stringify({
      title: 'x',
      rules: [
        {
          manipulators: [
            {
              type: 'basic',
              from: { key_code: 'a', modifiers: { mandatory: ['command'] } },
              to_if_alone: [{ key_code: 'escape' }],
              to_if_held_down: [{ key_code: 'b', modifiers: ['left_control'] }],
              parameters: {
                'basic.to_if_alone_timeout_milliseconds': 350,
                'basic.to_if_held_down_threshold_milliseconds': 350,
              },
              conditions: [
                { type: 'frontmost_application_if', bundle_identifiers: ['^com\\.google\\.Chrome$'] },
              ],
            },
          ],
        },
      ],
    });
    const out = parseKarabinerJSON(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.rules[0]).toMatchObject({ kind: 'tap_hold', tapTimeoutMs: 350 });
  });

  it('clamps an out-of-bounds tap timeout (and warns)', () => {
    const src = JSON.stringify({
      title: 'x',
      rules: [
        {
          manipulators: [
            {
              type: 'basic',
              from: { key_code: 'a', modifiers: { mandatory: ['command'] } },
              to_if_alone: [{ key_code: 'escape' }],
              to_if_held_down: [{ key_code: 'b', modifiers: ['left_control'] }],
              parameters: { 'basic.to_if_alone_timeout_milliseconds': 9999 },
              conditions: [
                { type: 'frontmost_application_if', bundle_identifiers: ['^com\\.google\\.Chrome$'] },
              ],
            },
          ],
        },
      ],
    });
    const out = parseKarabinerJSON(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.rules[0]).toMatchObject({ kind: 'tap_hold', tapTimeoutMs: 2000 });
    expect(out.result.warnings.some((w) => /clamped/.test(w.reason))).toBe(true);
  });

  it('imports `to_if_alone` only as tap_hold with hold = trigger (with warning)', () => {
    const src = JSON.stringify({
      title: 'x',
      rules: [
        {
          manipulators: [
            {
              type: 'basic',
              from: { key_code: 'a', modifiers: { mandatory: ['command'] } },
              to_if_alone: [{ key_code: 'escape' }],
              conditions: [
                { type: 'frontmost_application_if', bundle_identifiers: ['^com\\.google\\.Chrome$'] },
              ],
            },
          ],
        },
      ],
    });
    const out = parseKarabinerJSON(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.rules[0]).toMatchObject({
      kind: 'tap_hold',
      tapAction: 'escape',
      holdAction: 'meta+a',
    });
    expect(out.result.warnings.some((w) => /alone/.test(w.reason))).toBe(true);
  });

  it('imports `to` + `to_if_alone` (dual-role) as tap_hold with hold = trigger', () => {
    const src = JSON.stringify({
      title: 'x',
      rules: [
        {
          manipulators: [
            {
              type: 'basic',
              from: { key_code: 'a', modifiers: { mandatory: ['command'] } },
              to: [{ key_code: 'a', modifiers: ['left_command'] }],
              to_if_alone: [{ key_code: 'escape' }],
              conditions: [
                { type: 'frontmost_application_if', bundle_identifiers: ['^com\\.google\\.Chrome$'] },
              ],
            },
          ],
        },
      ],
    });
    const out = parseKarabinerJSON(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.rules[0]).toMatchObject({
      kind: 'tap_hold',
      tapAction: 'escape',
      holdAction: 'meta+a',
    });
    expect(out.result.warnings.some((w) => /Dual-role/.test(w.reason))).toBe(true);
  });

  it('skips `to_if_held_down` only patterns with a warning', () => {
    const src = JSON.stringify({
      title: 'x',
      rules: [
        {
          manipulators: [
            {
              type: 'basic',
              from: { key_code: 'a', modifiers: { mandatory: ['command'] } },
              to_if_held_down: [{ key_code: 'escape' }],
              conditions: [
                { type: 'frontmost_application_if', bundle_identifiers: ['^com\\.google\\.Chrome$'] },
              ],
            },
          ],
        },
      ],
    });
    const out = parseKarabinerJSON(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.rules).toHaveLength(0);
    expect(out.result.warnings.some((w) => /unusual/.test(w.reason))).toBe(true);
  });

  it('skips `to_after_key_up` manipulators with a warning', () => {
    const src = JSON.stringify({
      title: 'x',
      rules: [
        {
          manipulators: [
            {
              type: 'basic',
              from: { key_code: 'a', modifiers: { mandatory: ['command'] } },
              to: [{ key_code: 'escape' }],
              to_after_key_up: [{ key_code: 'b' }],
              conditions: [
                { type: 'frontmost_application_if', bundle_identifiers: ['^com\\.google\\.Chrome$'] },
              ],
            },
          ],
        },
      ],
    });
    const out = parseKarabinerJSON(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.rules).toHaveLength(0);
    expect(out.result.warnings.some((w) => /to_after_key_up/.test(w.reason))).toBe(true);
  });
});

describe('Karabiner round-trip — disable kind', () => {
  it('round-trips a single disable rule (vk_none) without warnings', () => {
    const cfg: Config = {
      os: 'mac',
      rules: [
        {
          kind: 'disable',
          appId: 'mozilla-firefox',
          trigger: 'meta+q',
          description: 'Stop Firefox quitting',
        },
      ],
    };
    const out = parseKarabinerJSON(jsonStr(cfg));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.warnings).toEqual([]);
    expect(out.result.rules).toHaveLength(1);
    expect(out.result.rules[0]).toMatchObject({
      kind: 'disable',
      appId: 'mozilla-firefox',
      trigger: 'meta+q',
    });
  });

  it('parses a hand-written vk_none manipulator', () => {
    const raw = JSON.stringify({
      rules: [
        {
          description: 'Hand: kill q',
          manipulators: [
            {
              type: 'basic',
              from: { key_code: 'q', modifiers: { mandatory: ['command'] } },
              to: [{ key_code: 'vk_none' }],
              conditions: [
                {
                  type: 'frontmost_application_if',
                  bundle_identifiers: ['^org\\.mozilla\\.firefox$'],
                },
              ],
            },
          ],
        },
      ],
    });
    const out = parseKarabinerJSON(raw);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.rules[0].kind).toBe('disable');
  });
});
