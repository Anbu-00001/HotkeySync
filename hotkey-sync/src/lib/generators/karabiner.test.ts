import { describe, it, expect } from 'vitest';
import { generateKarabiner } from '@/lib/generators/karabiner';
import type { Config, HotkeyRule, OS } from '@/types';

function makeConfig(rules: HotkeyRule[], os: OS = 'mac'): Config {
  return { os, rules };
}

function rule(
  appId: string,
  trigger: string,
  action: string,
  description = 'desc',
): HotkeyRule {
  return { appId, trigger, action, description };
}

describe('generateKarabiner — empty config', () => {
  it('returns an object with the expected title', () => {
    const out = generateKarabiner(makeConfig([]));
    expect(out.title).toBe('HotkeySync — My Config');
  });

  it('returns an empty rules array', () => {
    expect(generateKarabiner(makeConfig([])).rules).toEqual([]);
  });
});

describe('generateKarabiner — single rule', () => {
  const r = rule('google-chrome', 'ctrl+p', 'ctrl+comma', 'Open Preferences');
  const out = generateKarabiner(makeConfig([r]));

  it('produces exactly one rule', () => {
    expect(out.rules).toHaveLength(1);
  });

  it('prefixes description with app name', () => {
    expect(out.rules[0].description).toBe('Google Chrome: Open Preferences');
  });

  it('maps trigger key to from.key_code', () => {
    expect(out.rules[0].manipulators[0].from.key_code).toBe('p');
  });

  it('puts ctrl in from.modifiers.mandatory', () => {
    expect(out.rules[0].manipulators[0].from.modifiers?.mandatory).toContain(
      'control',
    );
  });

  it('puts caps_lock in from.modifiers.optional', () => {
    expect(out.rules[0].manipulators[0].from.modifiers?.optional).toContain(
      'caps_lock',
    );
  });

  it('maps action key to to[0].key_code', () => {
    expect(out.rules[0].manipulators[0].to[0].key_code).toBe('comma');
  });

  it('puts left_control in to[0].modifiers', () => {
    expect(out.rules[0].manipulators[0].to[0].modifiers).toContain('left_control');
  });

  it('sets condition type to frontmost_application_if', () => {
    expect(out.rules[0].manipulators[0].conditions[0].type).toBe(
      'frontmost_application_if',
    );
  });

  it('emits an anchored, dot-escaped bundle identifier', () => {
    expect(
      out.rules[0].manipulators[0].conditions[0].bundle_identifiers[0],
    ).toBe('^com\\.google\\.Chrome$');
  });
});

describe('generateKarabiner — caps_lock optional always present', () => {
  it('includes caps_lock even when trigger has no modifiers', () => {
    const out = generateKarabiner(
      makeConfig([rule('google-chrome', 'p', 'ctrl+comma')]),
    );
    expect(out.rules[0].manipulators[0].from.modifiers?.optional).toContain(
      'caps_lock',
    );
  });

  it('preserves mandatory modifiers alongside caps_lock optional', () => {
    const out = generateKarabiner(
      makeConfig([rule('google-chrome', 'ctrl+p', 'ctrl+comma')]),
    );
    expect(out.rules[0].manipulators[0].from.modifiers?.mandatory).toEqual([
      'control',
    ]);
    expect(out.rules[0].manipulators[0].from.modifiers?.optional).toEqual([
      'caps_lock',
    ]);
  });
});

describe('generateKarabiner — to.modifiers is a flat array', () => {
  it('to[0].modifiers is a JS Array', () => {
    const out = generateKarabiner(
      makeConfig([rule('google-chrome', 'ctrl+p', 'ctrl+comma')]),
    );
    expect(Array.isArray(out.rules[0].manipulators[0].to[0].modifiers)).toBe(true);
  });

  it('emits all action modifiers using left_ prefixed names', () => {
    const out = generateKarabiner(
      makeConfig([rule('google-chrome', 'ctrl+p', 'ctrl+shift+p')]),
    );
    const mods = out.rules[0].manipulators[0].to[0].modifiers;
    expect(mods).toContain('left_control');
    expect(mods).toContain('left_shift');
  });

  it('omits to.modifiers when action has no modifiers', () => {
    const out = generateKarabiner(
      makeConfig([rule('google-chrome', 'ctrl+p', 'escape')]),
    );
    expect(out.rules[0].manipulators[0].to[0].modifiers).toBeUndefined();
  });
});

describe('generateKarabiner — bundle identifier regex', () => {
  it('escapes dots in com.tinyspeck.slackmacgap', () => {
    const out = generateKarabiner(
      makeConfig([rule('slack', 'ctrl+p', 'ctrl+comma')]),
    );
    expect(
      out.rules[0].manipulators[0].conditions[0].bundle_identifiers[0],
    ).toBe('^com\\.tinyspeck\\.slackmacgap$');
  });

  it('escapes dots in md.obsidian', () => {
    const out = generateKarabiner(
      makeConfig([rule('obsidian', 'ctrl+p', 'ctrl+comma')]),
    );
    expect(
      out.rules[0].manipulators[0].conditions[0].bundle_identifiers[0],
    ).toBe('^md\\.obsidian$');
  });

  it('escapes dots in notion.id', () => {
    const out = generateKarabiner(
      makeConfig([rule('notion', 'ctrl+p', 'ctrl+comma')]),
    );
    expect(
      out.rules[0].manipulators[0].conditions[0].bundle_identifiers[0],
    ).toBe('^notion\\.id$');
  });
});

describe('generateKarabiner — one KarabinerRule per HotkeyRule', () => {
  it('two rules across two apps → 2 rules in output', () => {
    const out = generateKarabiner(
      makeConfig([
        rule('google-chrome', 'ctrl+p', 'ctrl+comma'),
        rule('vs-code', 'ctrl+p', 'ctrl+shift+p'),
      ]),
    );
    expect(out.rules).toHaveLength(2);
  });

  it('two rules for the same app → 2 rules in output', () => {
    const out = generateKarabiner(
      makeConfig([
        rule('google-chrome', 'ctrl+p', 'ctrl+comma'),
        rule('google-chrome', 'ctrl+w', 'ctrl+shift+w'),
      ]),
    );
    expect(out.rules).toHaveLength(2);
  });
});

describe('generateKarabiner — special keys', () => {
  it('trigger tab → from.key_code "tab"', () => {
    const out = generateKarabiner(
      makeConfig([rule('google-chrome', 'tab', 'ctrl+p')]),
    );
    expect(out.rules[0].manipulators[0].from.key_code).toBe('tab');
  });

  it('action up_arrow → to[0].key_code "up_arrow"', () => {
    const out = generateKarabiner(
      makeConfig([rule('google-chrome', 'ctrl+k', 'up_arrow')]),
    );
    expect(out.rules[0].manipulators[0].to[0].key_code).toBe('up_arrow');
  });

  it('trigger f1 → from.key_code "f1"', () => {
    const out = generateKarabiner(
      makeConfig([rule('google-chrome', 'f1', 'ctrl+p')]),
    );
    expect(out.rules[0].manipulators[0].from.key_code).toBe('f1');
  });

  it('action return_or_enter → to[0].key_code "return_or_enter"', () => {
    const out = generateKarabiner(
      makeConfig([rule('google-chrome', 'ctrl+k', 'return_or_enter')]),
    );
    expect(out.rules[0].manipulators[0].to[0].key_code).toBe('return_or_enter');
  });

  it('action meta+p → to[0].modifiers contains "left_command"', () => {
    const out = generateKarabiner(
      makeConfig([rule('google-chrome', 'ctrl+k', 'meta+p')]),
    );
    expect(out.rules[0].manipulators[0].to[0].modifiers).toContain('left_command');
  });
});

describe('generateKarabiner — unknown appId', () => {
  it('skips rules whose appId is not in apps.json', () => {
    const out = generateKarabiner(
      makeConfig([rule('nonexistent-app', 'ctrl+p', 'ctrl+comma')]),
    );
    expect(out.rules).toEqual([]);
  });
});
