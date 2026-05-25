import { describe, it, expect } from 'vitest';
import {
  validateKarabinerOutput,
  karabinerOutputSchema,
} from '@/lib/generators/karabiner-schema';
import { generateKarabiner } from '@/lib/generators/karabiner';
import { PRESETS } from '@/data/presets';
import type { Config } from '@/types';

describe('Karabiner schema — generator output validates', () => {
  it('empty config produces schema-valid output', () => {
    const result = validateKarabinerOutput(
      generateKarabiner({ os: 'mac', rules: [] }),
    );
    expect(result.ok).toBe(true);
  });

  it('single rule produces schema-valid output', () => {
    const cfg: Config = {
      os: 'mac',
      rules: [
        { kind: 'basic',
          appId: 'google-chrome',
          trigger: 'ctrl+p',
          action: 'ctrl+comma',
          description: 'Preferences',
        },
      ],
    };
    expect(validateKarabinerOutput(generateKarabiner(cfg)).ok).toBe(true);
  });

  it('every Phase 1 preset produces schema-valid output', () => {
    for (const preset of PRESETS) {
      const cfg: Config = { os: 'mac', rules: preset.rules };
      const result = validateKarabinerOutput(generateKarabiner(cfg));
      expect(result.ok, `preset "${preset.id}" failed validation`).toBe(true);
    }
  });

  it('tap_hold rule output passes schema validation', () => {
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
          description: 'dual-role',
        },
      ],
    };
    expect(validateKarabinerOutput(generateKarabiner(cfg)).ok).toBe(true);
  });

  it('rule with no-modifier trigger still validates (caps_lock optional path)', () => {
    const cfg: Config = {
      os: 'mac',
      rules: [
        { kind: 'basic',
          appId: 'vs-code',
          trigger: 'escape',
          action: 'ctrl+open_bracket',
          description: 'Esc → Ctrl+[',
        },
      ],
    };
    expect(validateKarabinerOutput(generateKarabiner(cfg)).ok).toBe(true);
  });
});

describe('Karabiner schema — rejection cases', () => {
  it('rejects extra unknown top-level fields (strict mode)', () => {
    const bad = {
      title: 'x',
      rules: [],
      extra: 'nope',
    };
    expect(validateKarabinerOutput(bad).ok).toBe(false);
  });

  it('rejects manipulator type other than "basic"', () => {
    const bad = {
      title: 'x',
      rules: [
        {
          description: 'd',
          manipulators: [
            {
              type: 'mouse_motion_to_scroll',
              from: { key_code: 'p' },
              to: [{ key_code: 'q' }],
              conditions: [
                { type: 'frontmost_application_if', bundle_identifiers: ['^x$'] },
              ],
            },
          ],
        },
      ],
    };
    expect(validateKarabinerOutput(bad).ok).toBe(false);
  });

  it('rejects condition type not in the accepted union', () => {
    // Wave 2.7 — `variable_if` is now accepted alongside frontmost_application_*.
    // This case uses an entirely unknown discriminator to keep the rejection
    // assertion meaningful.
    const bad = {
      title: 'x',
      rules: [
        {
          description: 'd',
          manipulators: [
            {
              type: 'basic',
              from: { key_code: 'p' },
              to: [{ key_code: 'q' }],
              conditions: [{ type: 'something_else', bundle_identifiers: ['^x$'] }],
            },
          ],
        },
      ],
    };
    expect(validateKarabinerOutput(bad).ok).toBe(false);
  });

  it('accepts `variable_if` conditions with name + value (Wave 2.7 layer gate)', () => {
    const good = {
      title: 'x',
      rules: [
        {
          description: 'd',
          manipulators: [
            {
              type: 'basic',
              from: { key_code: 'p' },
              to: [{ key_code: 'q' }],
              conditions: [{ type: 'variable_if', name: 'hotkeysync_layer_x', value: 1 }],
            },
          ],
        },
      ],
    };
    expect(validateKarabinerOutput(good).ok).toBe(true);
  });

  it('rejects empty bundle_identifiers array', () => {
    const bad = {
      title: 'x',
      rules: [
        {
          description: 'd',
          manipulators: [
            {
              type: 'basic',
              from: { key_code: 'p' },
              to: [{ key_code: 'q' }],
              conditions: [
                { type: 'frontmost_application_if', bundle_identifiers: [] },
              ],
            },
          ],
        },
      ],
    };
    expect(validateKarabinerOutput(bad).ok).toBe(false);
  });

  it('rejects manipulator with empty `to` array', () => {
    const bad = {
      title: 'x',
      rules: [
        {
          description: 'd',
          manipulators: [
            {
              type: 'basic',
              from: { key_code: 'p' },
              to: [],
              conditions: [
                {
                  type: 'frontmost_application_if',
                  bundle_identifiers: ['^x$'],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(validateKarabinerOutput(bad).ok).toBe(false);
  });

  it('rejects manipulator with NO action arrays at all (no to, no to_if_*)', () => {
    const bad = {
      title: 'x',
      rules: [
        {
          description: 'd',
          manipulators: [
            {
              type: 'basic',
              from: { key_code: 'p' },
              conditions: [
                { type: 'frontmost_application_if', bundle_identifiers: ['^x$'] },
              ],
            },
          ],
        },
      ],
    };
    expect(validateKarabinerOutput(bad).ok).toBe(false);
  });

  it('rejects unknown keys in parameters object (strict)', () => {
    const bad = {
      title: 'x',
      rules: [
        {
          description: 'd',
          manipulators: [
            {
              type: 'basic',
              from: { key_code: 'p' },
              to_if_alone: [{ key_code: 'q' }],
              parameters: { 'unknown.param': 1 },
              conditions: [
                { type: 'frontmost_application_if', bundle_identifiers: ['^x$'] },
              ],
            },
          ],
        },
      ],
    };
    expect(validateKarabinerOutput(bad).ok).toBe(false);
  });

  it('returns a structured error list on failure (path + message)', () => {
    const bad = { title: 123, rules: 'not-an-array' };
    const result = validateKarabinerOutput(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
    for (const e of result.errors) {
      expect(typeof e.path).toBe('string');
      expect(typeof e.message).toBe('string');
    }
  });
});

describe('Karabiner schema — exported schema type', () => {
  it('exported schema accepts a manually-constructed minimum valid object', () => {
    const minimum = {
      title: 'Test',
      rules: [],
    };
    expect(karabinerOutputSchema.safeParse(minimum).success).toBe(true);
  });
});
