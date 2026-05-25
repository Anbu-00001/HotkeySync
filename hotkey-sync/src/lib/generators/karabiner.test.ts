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
  return { kind: 'basic', appId, trigger, action, description };
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
    expect(out.rules[0].manipulators[0].to?.[0].key_code).toBe('comma');
  });

  it('puts left_control in to[0].modifiers', () => {
    expect(out.rules[0].manipulators[0].to?.[0].modifiers).toContain('left_control');
  });

  it('sets condition type to frontmost_application_if', () => {
    expect(out.rules[0].manipulators[0].conditions[0].type).toBe(
      'frontmost_application_if',
    );
  });

  it('emits an anchored, dot-escaped bundle identifier', () => {
    expect(
      out.rules[0].manipulators[0].conditions[0].bundle_identifiers![0],
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
    expect(Array.isArray(out.rules[0].manipulators[0].to?.[0].modifiers)).toBe(true);
  });

  it('emits all action modifiers using left_ prefixed names', () => {
    const out = generateKarabiner(
      makeConfig([rule('google-chrome', 'ctrl+p', 'ctrl+shift+p')]),
    );
    const mods = out.rules[0].manipulators[0].to?.[0].modifiers;
    expect(mods).toContain('left_control');
    expect(mods).toContain('left_shift');
  });

  it('omits to.modifiers when action has no modifiers', () => {
    const out = generateKarabiner(
      makeConfig([rule('google-chrome', 'ctrl+p', 'escape')]),
    );
    expect(out.rules[0].manipulators[0].to?.[0].modifiers).toBeUndefined();
  });
});

describe('generateKarabiner — bundle identifier regex', () => {
  it('escapes dots in com.tinyspeck.slackmacgap', () => {
    const out = generateKarabiner(
      makeConfig([rule('slack', 'ctrl+p', 'ctrl+comma')]),
    );
    expect(
      out.rules[0].manipulators[0].conditions[0].bundle_identifiers![0],
    ).toBe('^com\\.tinyspeck\\.slackmacgap$');
  });

  it('escapes dots in md.obsidian', () => {
    const out = generateKarabiner(
      makeConfig([rule('obsidian', 'ctrl+p', 'ctrl+comma')]),
    );
    expect(
      out.rules[0].manipulators[0].conditions[0].bundle_identifiers![0],
    ).toBe('^md\\.obsidian$');
  });

  it('escapes dots in notion.id', () => {
    const out = generateKarabiner(
      makeConfig([rule('notion', 'ctrl+p', 'ctrl+comma')]),
    );
    expect(
      out.rules[0].manipulators[0].conditions[0].bundle_identifiers![0],
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
    expect(out.rules[0].manipulators[0].to?.[0].key_code).toBe('up_arrow');
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
    expect(out.rules[0].manipulators[0].to?.[0].key_code).toBe('return_or_enter');
  });

  it('action meta+p → to[0].modifiers contains "left_command"', () => {
    const out = generateKarabiner(
      makeConfig([rule('google-chrome', 'ctrl+k', 'meta+p')]),
    );
    expect(out.rules[0].manipulators[0].to?.[0].modifiers).toContain('left_command');
  });
});

describe('generateKarabiner — tap_hold rules', () => {
  const tapHold = (
    appId: string,
    trigger: string,
    tapAction: string,
    holdAction: string,
    tapTimeoutMs = 200,
    description = 'tap-hold',
  ): HotkeyRule => ({
    kind: 'tap_hold',
    appId,
    trigger,
    tapAction,
    holdAction,
    tapTimeoutMs,
    description,
  });

  it('emits to_if_alone + to_if_held_down (and OMITS `to`)', () => {
    const out = generateKarabiner(
      makeConfig([tapHold('google-chrome', 'ctrl+p', 'ctrl+comma', 'ctrl+shift+w')]),
    );
    const m = out.rules[0].manipulators[0];
    expect(m.to).toBeUndefined();
    expect(m.to_if_alone).toEqual([
      { key_code: 'comma', modifiers: ['left_control'] },
    ]);
    expect(m.to_if_held_down).toEqual([
      { key_code: 'w', modifiers: ['left_control', 'left_shift'] },
    ]);
  });

  it('writes both timing parameters from tapTimeoutMs', () => {
    const out = generateKarabiner(
      makeConfig([tapHold('google-chrome', 'ctrl+p', 'ctrl+comma', 'ctrl+shift+w', 250)]),
    );
    const m = out.rules[0].manipulators[0];
    expect(m.parameters).toEqual({
      'basic.to_if_alone_timeout_milliseconds': 250,
      'basic.to_if_held_down_threshold_milliseconds': 250,
    });
  });

  it('preserves caps_lock optional on tap_hold from.modifiers', () => {
    const out = generateKarabiner(
      makeConfig([tapHold('google-chrome', 'ctrl+p', 'ctrl+comma', 'ctrl+shift+w')]),
    );
    const m = out.rules[0].manipulators[0];
    expect(m.from.modifiers?.optional).toContain('caps_lock');
    expect(m.from.modifiers?.mandatory).toContain('control');
  });

  it('preserves the per-app frontmost condition', () => {
    const out = generateKarabiner(
      makeConfig([tapHold('vs-code', 'meta+grave_accent', 'escape', 'ctrl+grave_accent')]),
    );
    const m = out.rules[0].manipulators[0];
    expect(m.conditions[0].type).toBe('frontmost_application_if');
    expect(m.conditions[0].bundle_identifiers![0]).toBe('^com\\.microsoft\\.VSCode$');
  });

  it('description includes app name prefix like basic rules', () => {
    const out = generateKarabiner(
      makeConfig([tapHold('vs-code', 'meta+grave_accent', 'escape', 'ctrl+grave_accent', 200, 'dual')]),
    );
    expect(out.rules[0].description).toBe('VS Code: dual');
  });

  it('tap_hold trigger with no modifiers still gets caps_lock optional', () => {
    const out = generateKarabiner(
      makeConfig([tapHold('vs-code', 'escape', 'escape', 'ctrl+open_bracket')]),
    );
    const m = out.rules[0].manipulators[0];
    expect(m.from.modifiers?.optional).toEqual(['caps_lock']);
    expect(m.from.modifiers?.mandatory).toBeUndefined();
  });

  it('mixed basic + tap_hold config emits one KarabinerRule per HotkeyRule', () => {
    const out = generateKarabiner(
      makeConfig([
        rule('google-chrome', 'ctrl+p', 'ctrl+comma'),
        tapHold('vs-code', 'meta+grave_accent', 'escape', 'ctrl+grave_accent'),
      ]),
    );
    expect(out.rules).toHaveLength(2);
    expect(out.rules[0].manipulators[0].to).toBeDefined();
    expect(out.rules[1].manipulators[0].to).toBeUndefined();
    expect(out.rules[1].manipulators[0].to_if_alone).toBeDefined();
  });

  it('tap_hold with no-modifier hold action omits to_if_held_down.modifiers', () => {
    const out = generateKarabiner(
      makeConfig([tapHold('vs-code', 'ctrl+p', 'ctrl+comma', 'escape')]),
    );
    expect(out.rules[0].manipulators[0].to_if_held_down?.[0]).toEqual({
      key_code: 'escape',
    });
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

describe('generateKarabiner — modifier actions (Wave 2.6)', () => {
  it('basic rule with single-modifier action emits { key_code: <modifier> }', () => {
    const out = generateKarabiner(
      makeConfig([
        {
          kind: 'basic',
          appId: '__global',
          trigger: 'caps_lock',
          action: { kind: 'modifier', modifiers: ['ctrl'] },
          description: 'Caps as Ctrl',
        },
      ]),
    );
    const to = out.rules[0].manipulators[0].to;
    expect(to).toEqual([{ key_code: 'left_control' }]);
  });

  it('Hyper bundle uses the carrier-key trick (shift carrier + other 3 modifiers)', () => {
    const out = generateKarabiner(
      makeConfig([
        {
          kind: 'basic',
          appId: '__global',
          trigger: 'caps_lock',
          action: {
            kind: 'modifier',
            modifiers: ['ctrl', 'shift', 'alt', 'meta'],
            lazy: true,
          },
          description: 'Caps as Hyper',
        },
      ]),
    );
    const event = out.rules[0].manipulators[0].to![0];
    expect(event.key_code).toBe('left_shift');
    expect(new Set(event.modifiers)).toEqual(
      new Set(['left_command', 'left_control', 'left_option']),
    );
    expect(event.lazy).toBe(true);
  });

  it('tap_hold with ModifierAction holdAction emits to_if_held_down with the modifier', () => {
    const out = generateKarabiner(
      makeConfig([
        {
          kind: 'tap_hold',
          appId: '__global',
          trigger: 'caps_lock',
          tapAction: 'escape',
          holdAction: { kind: 'modifier', modifiers: ['ctrl'], lazy: true },
          tapTimeoutMs: 200,
          description: 'Caps tap=Esc / hold=Ctrl',
        },
      ]),
    );
    const heldDown = out.rules[0].manipulators[0].to_if_held_down![0];
    expect(heldDown).toEqual({ key_code: 'left_control', lazy: true });
  });
});

describe('generateKarabiner — global rules (Wave 2.5)', () => {
  it('global rule with no exceptApps emits empty conditions array', () => {
    const out = generateKarabiner(
      makeConfig([
        {
          kind: 'basic',
          appId: '__global',
          trigger: 'caps_lock',
          action: 'escape',
          description: 'Caps Lock to Esc',
        },
      ]),
    );
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0].manipulators[0].conditions).toEqual([]);
    expect(out.rules[0].description).toBe('Global: Caps Lock to Esc');
  });

  it('global rule with exceptApps emits frontmost_application_unless', () => {
    const out = generateKarabiner(
      makeConfig([
        {
          kind: 'disable',
          appId: '__global',
          trigger: 'meta+space',
          description: 'Free Cmd+Space',
          exceptApps: ['iterm2', 'zoom'],
        },
      ]),
    );
    const conds = out.rules[0].manipulators[0].conditions;
    expect(conds).toHaveLength(1);
    expect(conds[0].type).toBe('frontmost_application_unless');
    // Both iterm2 and zoom resolve to bundle ids in the catalogue.
    expect(conds[0].bundle_identifiers).toHaveLength(2);
  });
});

describe('generateKarabiner — disable rule', () => {
  const disableRule: HotkeyRule = {
    kind: 'disable',
    appId: 'mozilla-firefox',
    trigger: 'meta+q',
    description: 'Stop Firefox quitting',
  };
  const out = generateKarabiner(makeConfig([disableRule]));

  it('emits exactly one manipulator', () => {
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0].manipulators).toHaveLength(1);
  });

  it('emits vk_none as the to target (Karabiner swallow sentinel)', () => {
    expect(out.rules[0].manipulators[0].to).toEqual([{ key_code: 'vk_none' }]);
  });

  it('omits to_if_alone / to_if_held_down (disable is not tap_hold)', () => {
    const m = out.rules[0].manipulators[0];
    expect(m.to_if_alone).toBeUndefined();
    expect(m.to_if_held_down).toBeUndefined();
  });

  it('prefixes description with app name like other kinds', () => {
    expect(out.rules[0].description).toBe('Mozilla Firefox: Stop Firefox quitting');
  });

  it('still scopes to the app via frontmost_application_if', () => {
    const conds = out.rules[0].manipulators[0].conditions;
    expect(conds[0].type).toBe('frontmost_application_if');
    expect(conds[0].bundle_identifiers![0]).toMatch(/firefox/i);
  });
});

describe('generateKarabiner — layer rules (Wave 2.7)', () => {
  it('emits set_variable on `to` and `to_after_key_up` for the layer trigger', () => {
    const out = generateKarabiner({
      os: 'mac',
      rules: [
        {
          kind: 'layer',
          appId: '__global',
          trigger: 'caps_lock',
          layerName: 'vim-arrows',
          mode: 'hold',
          description: 'Caps layer',
        },
      ],
    });
    const m = out.rules[0].manipulators[0];
    expect(m.to?.[0].set_variable).toEqual({
      name: 'hotkeysync_layer_vim_arrows',
      value: 1,
    });
    expect(m.to?.[0].lazy).toBe(true);
    expect(m.to_after_key_up?.[0].set_variable).toEqual({
      name: 'hotkeysync_layer_vim_arrows',
      value: 0,
    });
  });

  it('emits `variable_if` on child basic rules referencing the layer', () => {
    const out = generateKarabiner({
      os: 'mac',
      rules: [
        {
          kind: 'layer',
          appId: '__global',
          trigger: 'caps_lock',
          layerName: 'vim-arrows',
          mode: 'hold',
          description: 'Caps layer',
        },
        {
          kind: 'basic',
          appId: '__global',
          trigger: 'h',
          action: 'left_arrow',
          layerName: 'vim-arrows',
          description: 'Caps+H → Left',
        },
      ],
    });
    // The child rule's manipulator conditions include a variable_if matching
    // the layer variable name.
    const child = out.rules.find((r) => r.description.endsWith('Caps+H → Left'));
    expect(child).toBeDefined();
    const varCond = child!.manipulators[0].conditions.find(
      (c) => c.type === 'variable_if',
    );
    expect(varCond?.name).toBe('hotkeysync_layer_vim_arrows');
    expect(varCond?.value).toBe(1);
  });

  it('omits `variable_if` on basic rules without a layerName', () => {
    const out = generateKarabiner({
      os: 'mac',
      rules: [
        {
          kind: 'basic',
          appId: 'google-chrome',
          trigger: 'ctrl+p',
          action: 'ctrl+comma',
          description: 'Prefs',
        },
      ],
    });
    const conds = out.rules[0].manipulators[0].conditions;
    expect(conds.some((c) => c.type === 'variable_if')).toBe(false);
  });

  it('attaches tapAction via `to_if_alone` for dual-role layer triggers', () => {
    const out = generateKarabiner({
      os: 'mac',
      rules: [
        {
          kind: 'layer',
          appId: '__global',
          trigger: 'caps_lock',
          layerName: 'vim-arrows',
          mode: 'hold',
          tapAction: 'escape',
          description: 'Caps layer tap=esc',
        },
      ],
    });
    const m = out.rules[0].manipulators[0];
    expect(m.to_if_alone?.[0].key_code).toBe('escape');
  });
});

describe('generateKarabiner — one-shot layer (Wave 2.8)', () => {
  it('emits set_variable=1 on `to` and omits to_after_key_up for one-shot trigger', () => {
    const out = generateKarabiner({
      os: 'mac',
      rules: [
        {
          kind: 'layer',
          appId: '__global',
          trigger: 'caps_lock',
          layerName: 'os-vim',
          mode: 'oneshot',
          description: 'one-shot vim arm',
        },
      ],
    });
    const m = out.rules[0].manipulators[0];
    expect(m.to?.[0].set_variable).toEqual({
      name: 'hotkeysync_layer_os_vim',
      value: 1,
    });
    expect(m.to_after_key_up).toBeUndefined();
  });

  it('child basic rule of a one-shot layer appends set_variable=0 to its `to` array', () => {
    const out = generateKarabiner({
      os: 'mac',
      rules: [
        {
          kind: 'layer',
          appId: '__global',
          trigger: 'caps_lock',
          layerName: 'os-vim',
          mode: 'oneshot',
          description: 'one-shot vim arm',
        },
        {
          kind: 'basic',
          appId: '__global',
          trigger: 'h',
          action: 'left_arrow',
          layerName: 'os-vim',
          description: 'tap then H',
        },
      ],
    });
    const child = out.rules.find((r) => r.description.endsWith('tap then H'));
    expect(child).toBeDefined();
    const childTo = child!.manipulators[0].to;
    expect(childTo).toHaveLength(2);
    expect(childTo?.[0].key_code).toBe('left_arrow');
    expect(childTo?.[1].set_variable).toEqual({
      name: 'hotkeysync_layer_os_vim',
      value: 0,
    });
  });

  it('emits to_delayed_action.to_if_invoked when oneshotTimeoutMs is set', () => {
    const out = generateKarabiner({
      os: 'mac',
      rules: [
        {
          kind: 'layer',
          appId: '__global',
          trigger: 'caps_lock',
          layerName: 'os-vim',
          mode: 'oneshot',
          oneshotTimeoutMs: 1500,
          description: 'one-shot with timeout',
        },
      ],
    });
    const m = out.rules[0].manipulators[0];
    expect(m.to_delayed_action?.to_if_invoked?.[0].set_variable).toEqual({
      name: 'hotkeysync_layer_os_vim',
      value: 0,
    });
    expect(m.parameters?.['basic.to_delayed_action_delay_milliseconds']).toBe(1500);
  });

  it('emits cancel-key manipulators when cancelKeys is non-empty', () => {
    const out = generateKarabiner({
      os: 'mac',
      rules: [
        {
          kind: 'layer',
          appId: '__global',
          trigger: 'caps_lock',
          layerName: 'os-vim',
          mode: 'oneshot',
          cancelKeys: ['escape', 'meta+period'],
          description: 'one-shot with cancel keys',
        },
      ],
    });
    const cancelEscape = out.rules.find((r) =>
      r.description.includes('cancel escape'),
    );
    expect(cancelEscape).toBeDefined();
    const cancelMeta = out.rules.find((r) =>
      r.description.includes('cancel meta+period'),
    );
    expect(cancelMeta).toBeDefined();
  });

  it('does NOT emit cancel manipulators on hold-mode layers', () => {
    const out = generateKarabiner({
      os: 'mac',
      rules: [
        {
          kind: 'layer',
          appId: '__global',
          trigger: 'caps_lock',
          layerName: 'os-vim',
          mode: 'hold',
          description: 'hold layer',
        },
      ],
    });
    expect(out.rules.find((r) => r.description.includes('cancel'))).toBeUndefined();
  });
});

describe('generateKarabiner — notification (Wave 2.9)', () => {
  it('emits set_notification_message in to_after_key_up of one-shot activator (KE #4104 workaround)', () => {
    const out = generateKarabiner({
      os: 'mac',
      rules: [
        {
          kind: 'layer',
          appId: '__global',
          trigger: 'caps_lock',
          layerName: 'vim',
          mode: 'oneshot',
          notification: 'Vim layer armed',
          description: 'oneshot with notification',
        },
      ],
    });
    const m = out.rules[0].manipulators[0];
    // Notification lives in to_after_key_up, NOT in `to[]` alongside set_variable.
    expect(m.to_after_key_up?.[0].set_notification_message).toEqual({
      id: 'hks_vim',
      text: 'Vim layer armed',
    });
    // to[] still carries only set_variable (no notification co-located).
    expect(m.to?.[0].set_variable).toBeDefined();
    expect(m.to?.some((e) => e.set_notification_message)).toBe(false);
  });

  it('empty notification string is auto-labeled from the layer name', () => {
    const out = generateKarabiner({
      os: 'mac',
      rules: [
        {
          kind: 'layer',
          appId: '__global',
          trigger: 'caps_lock',
          layerName: 'my-layer',
          mode: 'oneshot',
          notification: '',
          description: 'auto-label',
        },
      ],
    });
    const m = out.rules[0].manipulators[0];
    expect(m.to_after_key_up?.[0].set_notification_message?.text).toBe('my-layer layer armed');
  });

  it('child rule appends notification-clear in to_after_key_up', () => {
    const out = generateKarabiner({
      os: 'mac',
      rules: [
        {
          kind: 'layer',
          appId: '__global',
          trigger: 'caps_lock',
          layerName: 'vim',
          mode: 'oneshot',
          notification: '',
          description: 'one-shot',
        },
        {
          kind: 'basic',
          appId: '__global',
          trigger: 'h',
          action: 'left_arrow',
          layerName: 'vim',
          description: 'H to Left',
        },
      ],
    });
    const child = out.rules.find((r) => r.description.endsWith('H to Left'));
    expect(child).toBeDefined();
    const clear = child!.manipulators[0].to_after_key_up;
    expect(clear?.[0].set_notification_message).toEqual({ id: 'hks_vim', text: '' });
  });

  it('cancel-key manipulators also clear the notification', () => {
    const out = generateKarabiner({
      os: 'mac',
      rules: [
        {
          kind: 'layer',
          appId: '__global',
          trigger: 'caps_lock',
          layerName: 'vim',
          mode: 'oneshot',
          cancelKeys: ['escape'],
          notification: '',
          description: 'cancel test',
        },
      ],
    });
    const cancelRule = out.rules.find((r) =>
      r.description.includes('cancel escape'),
    );
    expect(cancelRule).toBeDefined();
    expect(
      cancelRule!.manipulators[0].to_after_key_up?.[0].set_notification_message?.text,
    ).toBe('');
  });

  it('timeout to_delayed_action also clears the notification when set', () => {
    const out = generateKarabiner({
      os: 'mac',
      rules: [
        {
          kind: 'layer',
          appId: '__global',
          trigger: 'caps_lock',
          layerName: 'vim',
          mode: 'oneshot',
          oneshotTimeoutMs: 1500,
          notification: '',
          description: 'timeout + notification',
        },
      ],
    });
    const m = out.rules[0].manipulators[0];
    const invoked = m.to_delayed_action?.to_if_invoked;
    expect(invoked).toBeDefined();
    expect(invoked!.some((e) => e.set_variable?.value === 0)).toBe(true);
    expect(invoked!.some((e) => e.set_notification_message?.text === '')).toBe(true);
  });
});

describe('generateKarabiner — lock-on-double-tap (Wave 2.9)', () => {
  const makeLockableRule = () => ({
    kind: 'layer' as const,
    appId: '__global',
    trigger: 'caps_lock',
    layerName: 'vim',
    mode: 'oneshot' as const,
    oneshotLockOnTaps: 2 as const,
    cancelKeys: ['escape'],
    description: 'lockable one-shot',
  });

  it('emits exactly 3 manipulators (lock-clear, lock-promoter, first-tap) in order', () => {
    const out = generateKarabiner({ os: 'mac', rules: [makeLockableRule()] });
    const activator = out.rules.find((r) => r.description.includes('lockable one-shot'));
    expect(activator).toBeDefined();
    expect(activator!.manipulators).toHaveLength(3);
    // First manipulator = lock-clear (variable_if locked == 1)
    expect(
      activator!.manipulators[0].conditions.some(
        (c) => c.type === 'variable_if' && c.name?.endsWith('_locked') && c.value === 1,
      ),
    ).toBe(true);
    // Second = lock-promoter (variable_if tapcount == 1 AND locked == 0)
    expect(
      activator!.manipulators[1].conditions.some(
        (c) => c.type === 'variable_if' && c.name?.endsWith('_tapcount') && c.value === 1,
      ),
    ).toBe(true);
    // Third = first-tap (no variable_if for tapcount/locked)
    expect(
      activator!.manipulators[2].conditions.every(
        (c) =>
          !(c.type === 'variable_if' && (c.name?.endsWith('_locked') || c.name?.endsWith('_tapcount'))),
      ),
    ).toBe(true);
  });

  it('first-tap manipulator has both to_if_invoked and to_if_canceled for the tap-window reset', () => {
    const out = generateKarabiner({ os: 'mac', rules: [makeLockableRule()] });
    const activator = out.rules.find((r) => r.description.includes('lockable one-shot'));
    const firstTap = activator!.manipulators[2];
    expect(firstTap.to_delayed_action?.to_if_invoked).toBeDefined();
    expect(firstTap.to_delayed_action?.to_if_canceled).toBeDefined();
    expect(firstTap.to_delayed_action!.to_if_canceled![0].set_variable?.value).toBe(0);
  });

  it('cancel-key manipulator gates on `_locked == 0` (cannot cancel a locked layer)', () => {
    const out = generateKarabiner({ os: 'mac', rules: [makeLockableRule()] });
    const cancelRule = out.rules.find((r) => r.description.includes('cancel escape'));
    expect(cancelRule).toBeDefined();
    expect(
      cancelRule!.manipulators[0].conditions.some(
        (c) => c.type === 'variable_if' && c.name?.endsWith('_locked') && c.value === 0,
      ),
    ).toBe(true);
  });

  it('emits TWO child manipulators per child (locked variant first, then unlocked)', () => {
    const out = generateKarabiner({
      os: 'mac',
      rules: [
        makeLockableRule(),
        {
          kind: 'basic',
          appId: '__global',
          trigger: 'h',
          action: 'left_arrow',
          layerName: 'vim',
          description: 'H to Left',
        },
      ],
    });
    const child = out.rules.find((r) => r.description.endsWith('H to Left'));
    expect(child!.manipulators).toHaveLength(2);
    // Locked variant: conditions include locked == 1, to[] has only the action
    expect(
      child!.manipulators[0].conditions.some(
        (c) => c.type === 'variable_if' && c.name?.endsWith('_locked') && c.value === 1,
      ),
    ).toBe(true);
    expect(child!.manipulators[0].to).toHaveLength(1);
    // Unlocked variant: conditions include locked == 0, to[] also clears layer + tapcount
    expect(
      child!.manipulators[1].conditions.some(
        (c) => c.type === 'variable_if' && c.name?.endsWith('_locked') && c.value === 0,
      ),
    ).toBe(true);
    expect(child!.manipulators[1].to!.length).toBeGreaterThan(1);
  });
});
