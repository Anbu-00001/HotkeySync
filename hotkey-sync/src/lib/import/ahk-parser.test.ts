import { describe, it, expect } from 'vitest';
import { parseAHK } from '@/lib/import/ahk-parser';
import { generateAHK } from '@/lib/generators/ahk';
import type { Config } from '@/types';

describe('AHK round-trip — generate → parse', () => {
  it('preserves a single ctrl+p → ctrl+comma rule for Chrome', () => {
    const cfg: Config = {
      os: 'windows',
      rules: [
        { kind: 'basic',
          appId: 'google-chrome',
          trigger: 'ctrl+p',
          action: 'ctrl+comma',
          description: 'Open Preferences',
        },
      ],
    };
    const ahk = generateAHK(cfg);
    const out = parseAHK(ahk);
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0]).toMatchObject({ kind: 'basic',
      appId: 'google-chrome',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
      description: 'Open Preferences',
    });
    expect(out.selectedAppIds).toEqual(['google-chrome']);
  });

  it('preserves multiple rules across multiple apps', () => {
    const cfg: Config = {
      os: 'windows',
      rules: [
        { kind: 'basic', appId: 'google-chrome', trigger: 'ctrl+p', action: 'ctrl+comma', description: 'Prefs' },
        { kind: 'basic', appId: 'google-chrome', trigger: 'ctrl+w', action: 'ctrl+shift+w', description: 'Close win' },
        { kind: 'basic', appId: 'vs-code', trigger: 'ctrl+p', action: 'ctrl+shift+p', description: 'Cmd palette' },
      ],
    };
    const ahk = generateAHK(cfg);
    const out = parseAHK(ahk);
    expect(out.rules).toHaveLength(3);
    expect(out.selectedAppIds).toEqual(['google-chrome', 'vs-code']);
  });

  it('round-trips special keys with brace semantics', () => {
    const cfg: Config = {
      os: 'windows',
      rules: [
        { kind: 'basic', appId: 'vs-code', trigger: 'ctrl+tab', action: 'ctrl+page_down', description: 'Next' },
        { kind: 'basic', appId: 'vs-code', trigger: 'f1', action: 'escape', description: 'Cancel help' },
        { kind: 'basic', appId: 'vs-code', trigger: 'alt+h', action: 'left_arrow', description: 'Vim left' },
      ],
    };
    const ahk = generateAHK(cfg);
    const out = parseAHK(ahk);
    expect(out.rules).toHaveLength(3);
    expect(out.rules[0]).toMatchObject({ trigger: 'ctrl+tab', action: 'ctrl+page_down' });
    expect(out.rules[1]).toMatchObject({ trigger: 'f1', action: 'escape' });
    expect(out.rules[2]).toMatchObject({ trigger: 'alt+h', action: 'left_arrow' });
  });

  it('round-trips every preset (including tap_hold) for selected apps', async () => {
    const { PRESETS } = await import('@/data/presets');
    for (const preset of PRESETS) {
      const cfg: Config = { os: 'windows', rules: preset.rules };
      const ahk = generateAHK(cfg);
      const out = parseAHK(ahk);
      expect(
        out.rules.length,
        `preset "${preset.id}" lost rules on round-trip`,
      ).toBe(preset.rules.length);
    }
  });
});

describe('AHK importer — hand-written / messy input', () => {
  it('parses with single-quoted Send() (alternate AHK style)', () => {
    const ahk = `
#HotIf WinActive("ahk_exe chrome.exe")
^p:: Send('^,')  ; Preferences
#HotIf
`;
    const out = parseAHK(ahk);
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0]).toMatchObject({
      appId: 'google-chrome',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
    });
  });

  it('parses without inline-comment description', () => {
    const ahk = `
#HotIf WinActive("ahk_exe chrome.exe")
^p:: Send("^,")
#HotIf
`;
    const out = parseAHK(ahk);
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0].description).toBe('Imported from AHK');
  });

  it('imports rules outside any #HotIf block as global (Wave 2.5)', () => {
    // After Wave 2.5 AHK semantics are respected: rules outside any #HotIf
    // are global, anchored to the __global sentinel.
    const ahk = `
^p:: Send("^,")
#HotIf WinActive("ahk_exe chrome.exe")
^w:: Send("^+w")
#HotIf
`;
    const out = parseAHK(ahk);
    expect(out.rules).toHaveLength(2);
    expect(out.rules[0]).toMatchObject({
      kind: 'basic',
      appId: '__global',
      trigger: 'ctrl+p',
    });
    expect(out.rules[1]).toMatchObject({
      kind: 'basic',
      appId: 'google-chrome',
      trigger: 'ctrl+w',
    });
  });

  it('reports unknown app exes as warnings, not crashes', () => {
    const ahk = `
#HotIf WinActive("ahk_exe nonexistent.exe")
^p:: Send("^,")
#HotIf
`;
    const out = parseAHK(ahk);
    expect(out.rules).toHaveLength(0);
    expect(out.unknownAppExes).toContain('nonexistent.exe');
    expect(out.warnings[0].reason).toMatch(/Unknown exeName/);
  });

  it('is case-insensitive on exe names (Chrome.EXE)', () => {
    const ahk = `
#HotIf WinActive("ahk_exe Chrome.EXE")
^p:: Send("^,")
#HotIf
`;
    const out = parseAHK(ahk);
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0].appId).toBe('google-chrome');
  });

  it('tolerates extra blank lines and comments', () => {
    const ahk = `
; My custom hotkeys
;;;

#Requires AutoHotkey v2.0+
#SingleInstance Force


#HotIf WinActive("ahk_exe chrome.exe")

^p:: Send("^,")  ; first rule

^w:: Send("^+w")  ; second rule
#HotIf
`;
    const out = parseAHK(ahk);
    expect(out.rules).toHaveLength(2);
  });

  it('skips rules with multi-key macro actions and warns', () => {
    // Send("Hello{Tab}World") is a multi-key macro — not supported yet.
    const ahk = `
#HotIf WinActive("ahk_exe chrome.exe")
^h:: Send("Hello{Tab}World")
#HotIf
`;
    const out = parseAHK(ahk);
    expect(out.rules).toHaveLength(0);
    expect(out.warnings.length).toBe(1);
    expect(out.warnings[0].reason).toMatch(/multi-key macros not supported|Could not parse action/);
  });

  it('always returns os: "windows"', () => {
    expect(parseAHK('').os).toBe('windows');
  });

  it('handles input with only directives gracefully', () => {
    const out = parseAHK('#Requires AutoHotkey v2.0+\n#SingleInstance Force\n');
    expect(out.rules).toEqual([]);
    expect(out.warnings).toEqual([]);
  });
});

describe('AHK importer — tap_hold patterns', () => {
  it('round-trips a tap_hold rule produced by our generator', async () => {
    const cfg: Config = {
      os: 'windows',
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
    const ahk = generateAHK(cfg);
    const out = parseAHK(ahk);
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0]).toMatchObject({
      kind: 'tap_hold',
      appId: 'vs-code',
      trigger: 'meta+grave_accent',
      tapAction: 'escape',
      holdAction: 'ctrl+grave_accent',
      tapTimeoutMs: 200,
    });
  });

  it('clamps out-of-bounds timeout from a hand-written line', () => {
    const ahk = `
#HotIf WinActive("ahk_exe Code.exe")
^p:: TapHoldAction(9999, "^,", "^+w")
#HotIf
`;
    const out = parseAHK(ahk);
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0]).toMatchObject({ kind: 'tap_hold', tapTimeoutMs: 2000 });
    expect(out.warnings.some((w) => /clamped/.test(w.reason))).toBe(true);
  });

  it('does not try to parse the TapHoldAction helper function body as rules', () => {
    const cfg: Config = {
      os: 'windows',
      rules: [
        {
          kind: 'tap_hold',
          appId: 'vs-code',
          trigger: 'meta+grave_accent',
          tapAction: 'escape',
          holdAction: 'ctrl+grave_accent',
          tapTimeoutMs: 200,
          description: 'dual',
        },
      ],
    };
    const out = parseAHK(generateAHK(cfg));
    // The output contains the helper function body, but no garbage warnings.
    expect(
      out.warnings.filter((w) => /Could not parse/i.test(w.reason)),
    ).toHaveLength(0);
  });

  it('mixed AHK file (basic + tap_hold) imports both rule kinds', () => {
    const cfg: Config = {
      os: 'windows',
      rules: [
        { kind: 'basic', appId: 'google-chrome', trigger: 'ctrl+p', action: 'ctrl+comma', description: 'prefs' },
        {
          kind: 'tap_hold',
          appId: 'vs-code',
          trigger: 'meta+grave_accent',
          tapAction: 'escape',
          holdAction: 'ctrl+grave_accent',
          tapTimeoutMs: 200,
          description: 'dual',
        },
      ],
    };
    const out = parseAHK(generateAHK(cfg));
    expect(out.rules).toHaveLength(2);
    expect(out.rules[0].kind).toBe('basic');
    expect(out.rules[1].kind).toBe('tap_hold');
  });
});

describe('AHK importer — defensive', () => {
  it('does not throw on empty string', () => {
    expect(() => parseAHK('')).not.toThrow();
  });

  it('does not throw on totally malformed input', () => {
    expect(() => parseAHK('not actual ahk: garbage::: ()')).not.toThrow();
  });
});

describe('AHK round-trip — ModifierAction (Wave 2.6)', () => {
  it('round-trips a basic rule with single-modifier action (paired down/up)', () => {
    const cfg: Config = {
      os: 'windows',
      rules: [
        {
          kind: 'basic',
          appId: 'vs-code',
          trigger: 'caps_lock',
          action: { kind: 'modifier', modifiers: ['ctrl'] },
          description: 'Caps as Ctrl',
        },
      ],
    };
    const ahk = generateAHK(cfg);
    const out = parseAHK(ahk);
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0]).toMatchObject({
      kind: 'basic',
      appId: 'vs-code',
      trigger: 'caps_lock',
      action: { kind: 'modifier', modifiers: ['ctrl'] },
    });
  });

  it('round-trips a Hyper bundle (4 modifiers) preserving canonical order', () => {
    const cfg: Config = {
      os: 'windows',
      rules: [
        {
          kind: 'basic',
          appId: 'vs-code',
          trigger: 'caps_lock',
          action: { kind: 'modifier', modifiers: ['ctrl', 'shift', 'alt', 'meta'] },
          description: 'Caps as Hyper',
        },
      ],
    };
    const ahk = generateAHK(cfg);
    const out = parseAHK(ahk);
    expect(out.rules).toHaveLength(1);
    const action = out.rules[0].kind === 'basic' && typeof out.rules[0].action !== 'string'
      ? out.rules[0].action
      : null;
    expect(action!.modifiers).toEqual(['ctrl', 'shift', 'alt', 'meta']);
  });

  it('round-trips a tap_hold with ModifierAction hold', () => {
    const cfg: Config = {
      os: 'windows',
      rules: [
        {
          kind: 'tap_hold',
          appId: 'vs-code',
          trigger: 'caps_lock',
          tapAction: 'escape',
          holdAction: { kind: 'modifier', modifiers: ['ctrl'] },
          tapTimeoutMs: 200,
          description: 'Caps tap=Esc / hold=Ctrl',
        },
      ],
    };
    const ahk = generateAHK(cfg);
    const out = parseAHK(ahk);
    expect(out.rules[0]).toMatchObject({
      kind: 'tap_hold',
      holdAction: { kind: 'modifier', modifiers: ['ctrl'] },
    });
  });
});

describe('AHK round-trip — disable kind', () => {
  it('round-trips a HotkeySync-emitted Trigger:: return line', () => {
    const src = [
      '#Requires AutoHotkey v2.0+',
      '#SingleInstance Force',
      '',
      '; ═══ Firefox ═══',
      '#HotIf WinActive("ahk_exe firefox.exe")',
      '^q:: return  ; Stop Firefox quitting (disabled)',
      '#HotIf',
      '',
    ].join('\n');
    const out = parseAHK(src);
    expect(out.warnings).toEqual([]);
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0]).toMatchObject({
      kind: 'disable',
      appId: 'mozilla-firefox',
      trigger: 'ctrl+q',
      description: 'Stop Firefox quitting',
    });
  });

  it('imports a disable line outside any #HotIf block as global (Wave 2.5)', () => {
    const src = '^q:: return\n';
    const out = parseAHK(src);
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0]).toMatchObject({
      kind: 'disable',
      appId: '__global',
      trigger: 'ctrl+q',
    });
  });
});

describe('AHK Wave 2.7 — layer rules', () => {
  it('parses a layer activator + child block back into LayerHotkeyRule + basic with layerName', async () => {
    const src = `
#Requires AutoHotkey v2.0+
#SingleInstance Force
global g_LayerVimArrows := false

SetTimer(HotkeySync_LayerWatchdog, 1000)
HotkeySync_LayerWatchdog() {
  global g_LayerVimArrows
  if (g_LayerVimArrows && !GetKeyState("CapsLock", "P"))
    g_LayerVimArrows := false
}

*CapsLock:: { global g_LayerVimArrows := true }  ; Caps layer
*CapsLock up:: { global g_LayerVimArrows := false }  ; layer off

#HotIf g_LayerVimArrows
h:: Send("{Left}")  ; Caps+H → Left
j:: Send("{Down}")  ; Caps+J → Down
#HotIf
`.trim();
    const out = parseAHK(src);
    const layers = out.rules.filter((r) => r.kind === 'layer');
    const childen = out.rules.filter(
      (r) => r.kind === 'basic' && r.layerName === 'vim-arrows',
    );
    expect(layers).toHaveLength(1);
    expect(layers[0]).toMatchObject({
      kind: 'layer',
      layerName: 'vim-arrows',
      trigger: 'caps_lock',
    });
    expect(childen).toHaveLength(2);
  });

  it('full round-trip: vim-arrows preset → AHK → parse retains layer + children', async () => {
    const { PRESETS } = await import('@/data/presets');
    const preset = PRESETS.find((p) => p.id === 'caps-lock-vim-arrows');
    expect(preset).toBeDefined();
    if (!preset) return;
    const cfg: Config = { os: 'windows', rules: preset.rules };
    const ahk = generateAHK(cfg);
    const out = parseAHK(ahk);
    const layerCount = out.rules.filter((r) => r.kind === 'layer').length;
    const childCount = out.rules.filter(
      (r) => r.kind === 'basic' && r.layerName === 'vim-arrows',
    ).length;
    expect(layerCount).toBe(1);
    expect(childCount).toBe(4);
  });
});

describe('AHK Wave 2.8 — one-shot layer round-trip', () => {
  it('parses an emitted one-shot activator + child handlers', () => {
    const src = `
#Requires AutoHotkey v2.0+
#SingleInstance Force
global g_LayerOsVim := false

*CapsLock:: { global g_LayerOsVim := true ; SetTimer(() => HotkeySync_OneShotExpire_OsVim(), -2000) }  ; one-shot (one-shot on)
HotkeySync_OneShotExpire_OsVim() {
  global g_LayerOsVim
  g_LayerOsVim := false
}

#HotIf g_LayerOsVim
h:: { Send("{Left}") ; global g_LayerOsVim := false }  ; H to Left
j:: { Send("{Down}") ; global g_LayerOsVim := false }  ; J to Down
Escape:: { global g_LayerOsVim := false }  ; cancel one-shot layer
#HotIf
`.trim();
    const out = parseAHK(src);
    const layer = out.rules.find((r) => r.kind === 'layer');
    expect(layer).toBeDefined();
    if (!layer || layer.kind !== 'layer') return;
    expect(layer.mode).toBe('oneshot');
    expect(layer.oneshotTimeoutMs).toBe(2000);
    const children = out.rules.filter(
      (r) => r.kind === 'basic' && r.layerName === 'os-vim',
    );
    expect(children).toHaveLength(2);
  });

  it('full round-trip: one-shot preset → AHK → parse preserves mode + children', async () => {
    const { PRESETS } = await import('@/data/presets');
    const preset = PRESETS.find((p) => p.id === 'caps-lock-vim-arrows-oneshot');
    expect(preset).toBeDefined();
    if (!preset) return;
    const cfg: Config = { os: 'windows', rules: preset.rules };
    const ahk = generateAHK(cfg);
    const out = parseAHK(ahk);
    const layer = out.rules.find((r) => r.kind === 'layer');
    expect(layer).toBeDefined();
    if (!layer || layer.kind !== 'layer') return;
    expect(layer.mode).toBe('oneshot');
    const childCount = out.rules.filter(
      (r) => r.kind === 'basic' && r.layerName === 'vim-arrows-os',
    ).length;
    expect(childCount).toBe(4);
  });
});
