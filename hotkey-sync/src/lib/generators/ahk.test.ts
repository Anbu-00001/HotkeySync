import { describe, it, expect } from 'vitest';
import { generateAHK } from '@/lib/generators/ahk';
import type { Config, HotkeyRule, OS } from '@/types';

function makeConfig(rules: HotkeyRule[], os: OS = 'windows'): Config {
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

describe('generateAHK — empty config', () => {
  it('contains AHK v2 requirement directive', () => {
    expect(generateAHK(makeConfig([]))).toContain('#Requires AutoHotkey v2.0+');
  });

  it('contains SingleInstance Force', () => {
    expect(generateAHK(makeConfig([]))).toContain('#SingleInstance Force');
  });

  it('contains the no-rules-configured comment', () => {
    expect(generateAHK(makeConfig([]))).toContain('No rules configured');
  });

  it('does not contain #HotIf when no rules exist', () => {
    expect(generateAHK(makeConfig([]))).not.toContain('#HotIf');
  });
});

describe('generateAHK — single rule, simple combo', () => {
  const r = rule('google-chrome', 'ctrl+p', 'ctrl+comma', 'Open Preferences');
  const out = generateAHK(makeConfig([r]));

  it('emits the WinActive header for chrome.exe', () => {
    expect(out).toContain('#HotIf WinActive("ahk_exe chrome.exe")');
  });

  it('emits ^p:: Send("^,") on the rule line', () => {
    expect(out).toContain('^p:: Send("^,")');
  });

  it('emits the description as a trailing comment', () => {
    expect(out).toContain('; Open Preferences');
  });

  it('emits a closing #HotIf with no argument', () => {
    expect(out).toMatch(/\n#HotIf\n/);
  });

  it('ends with a newline', () => {
    expect(out.endsWith('\n')).toBe(true);
  });
});

describe('generateAHK — LHS special keys (no braces)', () => {
  it('trigger tab → "Tab::"', () => {
    expect(generateAHK(makeConfig([rule('google-chrome', 'tab', 'ctrl+p')]))).toMatch(
      /^Tab::/m,
    );
  });

  it('trigger ctrl+tab → "^Tab::"', () => {
    expect(
      generateAHK(makeConfig([rule('google-chrome', 'ctrl+tab', 'ctrl+p')])),
    ).toMatch(/^\^Tab::/m);
  });

  it('trigger f1 → "F1::"', () => {
    expect(generateAHK(makeConfig([rule('google-chrome', 'f1', 'ctrl+p')]))).toMatch(
      /^F1::/m,
    );
  });

  it('trigger escape → "Escape::"', () => {
    expect(
      generateAHK(makeConfig([rule('google-chrome', 'escape', 'ctrl+p')])),
    ).toMatch(/^Escape::/m);
  });
});

describe('generateAHK — RHS special keys (braces required)', () => {
  function action(a: string): string {
    return generateAHK(makeConfig([rule('google-chrome', 'ctrl+1', a)]));
  }

  it('action tab → Send("{Tab}")', () => {
    expect(action('tab')).toContain('Send("{Tab}")');
  });

  it('action ctrl+tab → Send("^{Tab}")', () => {
    expect(action('ctrl+tab')).toContain('Send("^{Tab}")');
  });

  it('action f1 → Send("{F1}")', () => {
    expect(action('f1')).toContain('Send("{F1}")');
  });

  it('action escape → Send("{Escape}")', () => {
    expect(action('escape')).toContain('Send("{Escape}")');
  });

  it('action up_arrow → Send("{Up}")', () => {
    expect(action('up_arrow')).toContain('Send("{Up}")');
  });

  it('action return_or_enter → Send("{Enter}")', () => {
    expect(action('return_or_enter')).toContain('Send("{Enter}")');
  });

  it('action delete_or_backspace → Send("{Backspace}")', () => {
    expect(action('delete_or_backspace')).toContain('Send("{Backspace}")');
  });
});

describe('generateAHK — multi-app grouping', () => {
  it('two apps → two #HotIf blocks', () => {
    const out = generateAHK(
      makeConfig([
        rule('google-chrome', 'ctrl+p', 'ctrl+comma'),
        rule('vs-code', 'ctrl+p', 'ctrl+shift+p'),
      ]),
    );
    const headerMatches = out.match(/#HotIf WinActive\(/g) ?? [];
    expect(headerMatches.length).toBe(2);
  });

  it('two rules for same app → exactly one #HotIf block, both rules inside', () => {
    const out = generateAHK(
      makeConfig([
        rule('google-chrome', 'ctrl+p', 'ctrl+comma'),
        rule('google-chrome', 'ctrl+w', 'ctrl+shift+w'),
      ]),
    );
    const headerMatches = out.match(/#HotIf WinActive\(/g) ?? [];
    expect(headerMatches.length).toBe(1);
    expect(out).toContain('^p:: Send("^,")');
    expect(out).toContain('^w:: Send("^+w")');
  });

  it('apps appear in rules grouping (insertion) order', () => {
    const out = generateAHK(
      makeConfig([
        rule('vs-code', 'ctrl+p', 'ctrl+comma'),
        rule('google-chrome', 'ctrl+p', 'ctrl+comma'),
      ]),
    );
    const vsCodeIdx = out.indexOf('ahk_exe Code.exe');
    const chromeIdx = out.indexOf('ahk_exe chrome.exe');
    expect(vsCodeIdx).toBeGreaterThan(-1);
    expect(chromeIdx).toBeGreaterThan(-1);
    expect(vsCodeIdx).toBeLessThan(chromeIdx);
  });
});

describe('generateAHK — modifier combinations', () => {
  function trigger(t: string): string {
    return generateAHK(makeConfig([rule('google-chrome', t, 'ctrl+1')]));
  }

  it('ctrl+shift+p → ^+p::', () => {
    expect(trigger('ctrl+shift+p')).toMatch(/^\^\+p::/m);
  });

  it('ctrl+alt+p → !^p:: (Phase 1 sorts modifiers alphabetically: alt, ctrl)', () => {
    expect(trigger('ctrl+alt+p')).toMatch(/^!\^p::/m);
  });

  it('ctrl+shift+alt+p → !^+p:: (alphabetical: alt, ctrl, shift = ! ^ +)', () => {
    expect(trigger('ctrl+shift+alt+p')).toMatch(/^!\^\+p::/m);
  });

  it('meta+p (Win key) → #p::', () => {
    expect(trigger('meta+p')).toMatch(/^#p::/m);
  });
});

describe('generateAHK — tap_hold rules', () => {
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

  it('injects the TapHoldAction helper iff any tap_hold rule exists', () => {
    const withTH = generateAHK(
      makeConfig([tapHold('vs-code', 'meta+grave_accent', 'escape', 'ctrl+grave_accent')]),
    );
    expect(withTH).toContain('TapHoldAction(timeoutMs, tapAction, holdAction)');
    expect(withTH).toContain('while (A_TickCount < endTime)');

    const withoutTH = generateAHK(
      makeConfig([rule('google-chrome', 'ctrl+p', 'ctrl+comma')]),
    );
    expect(withoutTH).not.toContain('TapHoldAction');
  });

  it('injects the helper exactly once even with many tap_hold rules', () => {
    const out = generateAHK(
      makeConfig([
        tapHold('vs-code', 'meta+grave_accent', 'escape', 'ctrl+grave_accent'),
        tapHold('google-chrome', 'meta+1', 'f1', 'ctrl+1'),
        tapHold('slack', 'meta+2', 'f2', 'ctrl+2'),
      ]),
    );
    const occurrences = (out.match(/TapHoldAction\(timeoutMs/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it('per-rule line uses TapHoldAction with ms, tap, hold args', () => {
    const out = generateAHK(
      makeConfig([
        tapHold('google-chrome', 'ctrl+p', 'ctrl+comma', 'ctrl+shift+w', 250, 'dual'),
      ]),
    );
    expect(out).toContain('^p:: TapHoldAction(250, "^,", "^+w")  ; dual');
  });

  it('tap_hold action with special key uses braced send syntax', () => {
    const out = generateAHK(
      makeConfig([tapHold('vs-code', 'meta+grave_accent', 'escape', 'ctrl+grave_accent')]),
    );
    expect(out).toContain('TapHoldAction(200, "{Escape}", "^`")');
  });

  it('tap_hold lives inside the per-app #HotIf block', () => {
    const out = generateAHK(
      makeConfig([
        tapHold('vs-code', 'meta+grave_accent', 'escape', 'ctrl+grave_accent'),
      ]),
    );
    // Helper appears BEFORE any #HotIf block; per-rule call lives INSIDE one
    const helperIdx = out.indexOf('TapHoldAction(timeoutMs');
    const hotIfIdx = out.indexOf('#HotIf WinActive("ahk_exe Code.exe")');
    const ruleIdx = out.indexOf('TapHoldAction(200,');
    expect(helperIdx).toBeLessThan(hotIfIdx);
    expect(hotIfIdx).toBeLessThan(ruleIdx);
  });

  it('mixed basic + tap_hold rules produce both line styles in one file', () => {
    const out = generateAHK(
      makeConfig([
        rule('google-chrome', 'ctrl+p', 'ctrl+comma', 'basic prefs'),
        tapHold('vs-code', 'meta+grave_accent', 'escape', 'ctrl+grave_accent'),
      ]),
    );
    expect(out).toContain('^p:: Send("^,")');
    expect(out).toContain('TapHoldAction(200, "{Escape}", "^`")');
  });

  it('output still ends with a newline', () => {
    const out = generateAHK(
      makeConfig([tapHold('vs-code', 'meta+grave_accent', 'escape', 'ctrl+grave_accent')]),
    );
    expect(out.endsWith('\n')).toBe(true);
  });

  it('tap_hold with malformed combos is skipped with a comment, never thrown', () => {
    const out = generateAHK(
      makeConfig([
        {
          kind: 'tap_hold',
          appId: 'vs-code',
          trigger: 'ctrl+nope',
          tapAction: 'escape',
          holdAction: 'ctrl+grave_accent',
          tapTimeoutMs: 200,
          description: 'bad',
        },
      ]),
    );
    expect(out).toContain('; Skipped malformed tap_hold rule');
  });
});

describe('generateAHK — unknown appId', () => {
  it('skips the rule and emits the skip comment', () => {
    const out = generateAHK(
      makeConfig([rule('nonexistent-app', 'ctrl+p', 'ctrl+comma')]),
    );
    expect(out).toContain("skipped rule for unknown app 'nonexistent-app'");
    expect(out).not.toContain('#HotIf WinActive');
  });
});

describe('generateAHK — global rules (Wave 2.5)', () => {
  it('global rule with no exceptApps emits NO #HotIf wrapper', () => {
    const out = generateAHK(
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
    expect(out).toContain('; ═══ Global');
    expect(out).toContain('CapsLock:: Send("{Escape}")');
    // Crucially: no #HotIf directive surrounding the global rule. AHK treats
    // bare hotkeys as global, which is exactly what we want.
    expect(out).not.toContain('#HotIf');
  });

  it('global rule with exceptApps emits #HotIf !(...) wrapper', () => {
    const out = generateAHK(
      makeConfig([
        {
          kind: 'disable',
          appId: '__global',
          trigger: 'ctrl+q',
          description: 'No Ctrl+Q (except in iTerm)',
          exceptApps: ['iterm2'],
        },
      ]),
    );
    // iterm2 has no exeName in our catalogue (mac-only). Should fall back
    // to NO wrapper, since exes.length will be 0 after filtering.
    // Sanity-check that scenario; the more important wrapped path is exercised
    // below via a Windows-capable app.
    expect(out).not.toContain('#HotIf');
  });

  it('global rule with windows-capable exceptApps emits the negated WinActive', () => {
    const out = generateAHK(
      makeConfig([
        {
          kind: 'disable',
          appId: '__global',
          trigger: 'ctrl+q',
          description: 'No Ctrl+Q (except in Chrome)',
          exceptApps: ['google-chrome'],
        },
      ]),
    );
    expect(out).toContain('#HotIf !(WinActive("ahk_exe chrome.exe"))');
    expect(out).toContain('^q:: return');
  });
});

describe('generateAHK — modifier actions (Wave 2.6)', () => {
  it('basic rule with single-modifier action emits paired *Trigger down + up', () => {
    const out = generateAHK(
      makeConfig([
        {
          kind: 'basic',
          appId: 'vs-code',
          trigger: 'caps_lock',
          action: { kind: 'modifier', modifiers: ['ctrl'] },
          description: 'Caps as Ctrl',
        },
      ]),
    );
    expect(out).toContain('*CapsLock:: Send("{Blind}{LControl down}")');
    expect(out).toContain('*CapsLock up:: Send("{Blind}{LControl up}")');
  });

  it('Hyper bundle emits all four modifier down events in canonical order', () => {
    const out = generateAHK(
      makeConfig([
        {
          kind: 'basic',
          appId: 'vs-code',
          trigger: 'caps_lock',
          action: { kind: 'modifier', modifiers: ['ctrl', 'shift', 'alt', 'meta'] },
          description: 'Caps as Hyper',
        },
      ]),
    );
    // Canonical order: ctrl, shift, alt, meta. {Blind} stays at the head.
    expect(out).toContain('*CapsLock:: Send("{Blind}{LControl down}{LShift down}{LAlt down}{LWin down}")');
  });

  it('tap_hold with ModifierAction holdAction emits TapHoldAction with {LControl down} hold', () => {
    const out = generateAHK(
      makeConfig([
        {
          kind: 'tap_hold',
          appId: 'vs-code',
          trigger: 'caps_lock',
          tapAction: 'escape',
          holdAction: { kind: 'modifier', modifiers: ['ctrl'], lazy: true },
          tapTimeoutMs: 200,
          description: 'Caps tap=Esc / hold=Ctrl',
        },
      ]),
    );
    expect(out).toMatch(/CapsLock:: TapHoldAction\(200, "\{Escape\}", "\{LControl down\}"\)/);
  });
});

describe('generateAHK — disable rule', () => {
  const disableRule: HotkeyRule = {
    kind: 'disable',
    appId: 'mozilla-firefox',
    trigger: 'ctrl+q',
    description: 'Stop Firefox quitting',
  };
  const out = generateAHK(makeConfig([disableRule]));

  it('opens a #HotIf block scoped to the app exe', () => {
    expect(out).toContain('#HotIf WinActive("ahk_exe firefox.exe")');
  });

  it('emits the canonical Trigger:: return line', () => {
    expect(out).toMatch(/\^q:: return\s+; Stop Firefox quitting \(disabled\)/);
  });

  it('does NOT inject the tap-hold helper for disable-only configs', () => {
    expect(out).not.toContain('TapHoldAction(');
  });

  it('skips a malformed disable trigger with a skip comment', () => {
    const out2 = generateAHK(
      makeConfig([
        {
          kind: 'disable',
          appId: 'mozilla-firefox',
          trigger: 'ctrl+nope',
          description: 'bad',
        },
      ]),
    );
    expect(out2).toContain('; Skipped malformed disable rule');
  });
});

describe('generateAHK — layer rules (Wave 2.7)', () => {
  it('emits a `global g_LayerXxx := false` flag declaration for each layer', () => {
    const out = generateAHK({
      os: 'windows',
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
    expect(out).toContain('global g_LayerVimArrows := false');
  });

  it('emits a SetTimer watchdog and HotkeySync_LayerWatchdog function', () => {
    const out = generateAHK({
      os: 'windows',
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
    expect(out).toMatch(/SetTimer\(HotkeySync_LayerWatchdog,\s*1000\)/);
    expect(out).toMatch(/HotkeySync_LayerWatchdog\(\)\s*\{/);
    expect(out).toMatch(/GetKeyState\("CapsLock", "P"\)/);
  });

  it('emits paired *Trigger down/up handlers toggling the flag', () => {
    const out = generateAHK({
      os: 'windows',
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
    expect(out).toMatch(/\*CapsLock::\s*\{\s*global g_LayerVimArrows := true\s*\}/);
    expect(out).toMatch(/\*CapsLock up::\s*\{\s*global g_LayerVimArrows := false\s*\}/);
  });

  it('groups layer children under `#HotIf g_LayerXxx` blocks', () => {
    const out = generateAHK({
      os: 'windows',
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
    expect(out).toMatch(/#HotIf g_LayerVimArrows\s*$/m);
    expect(out).toMatch(/h::\s*Send\("\{Left\}"\)/);
  });
});

describe('generateAHK — one-shot layer (Wave 2.8)', () => {
  it('emits a one-shot activator without an `up` partner', () => {
    const out = generateAHK({
      os: 'windows',
      rules: [
        {
          kind: 'layer',
          appId: '__global',
          trigger: 'caps_lock',
          layerName: 'os-vim',
          mode: 'oneshot',
          description: 'one-shot',
        },
      ],
    });
    expect(out).toMatch(/\*CapsLock::\s*\{\s*global g_LayerOsVim := true\s*\}/);
    expect(out).not.toMatch(/\*CapsLock up::/);
  });

  it('emits SetTimer with negative ms when oneshotTimeoutMs is set', () => {
    const out = generateAHK({
      os: 'windows',
      rules: [
        {
          kind: 'layer',
          appId: '__global',
          trigger: 'caps_lock',
          layerName: 'os-vim',
          mode: 'oneshot',
          oneshotTimeoutMs: 2000,
          description: 'one-shot timed',
        },
      ],
    });
    expect(out).toMatch(/SetTimer\(\(\)\s*=>\s*HotkeySync_OneShotExpire_OsVim\(\),\s*-2000\)/);
    expect(out).toMatch(/HotkeySync_OneShotExpire_OsVim\(\)/);
  });

  it('wraps one-shot child handler with flag-clear at end', () => {
    const out = generateAHK({
      os: 'windows',
      rules: [
        {
          kind: 'layer',
          appId: '__global',
          trigger: 'caps_lock',
          layerName: 'os-vim',
          mode: 'oneshot',
          description: 'one-shot',
        },
        {
          kind: 'basic',
          appId: '__global',
          trigger: 'h',
          action: 'left_arrow',
          layerName: 'os-vim',
          description: 'one-shot H to left',
        },
      ],
    });
    expect(out).toMatch(
      /h::\s*\{\s*Send\("\{Left\}"\)\s*;\s*global g_LayerOsVim := false\s*\}/,
    );
  });

  it('emits cancel-key rules inside the one-shot #HotIf block', () => {
    const out = generateAHK({
      os: 'windows',
      rules: [
        {
          kind: 'layer',
          appId: '__global',
          trigger: 'caps_lock',
          layerName: 'os-vim',
          mode: 'oneshot',
          cancelKeys: ['escape'],
          description: 'one-shot cancel',
        },
        {
          kind: 'basic',
          appId: '__global',
          trigger: 'h',
          action: 'left_arrow',
          layerName: 'os-vim',
          description: 'one-shot H',
        },
      ],
    });
    expect(out).toMatch(/Escape::\s*\{\s*global g_LayerOsVim := false\s*\}/);
  });

  it('watchdog tracks only hold layers, not one-shot', () => {
    const out = generateAHK({
      os: 'windows',
      rules: [
        {
          kind: 'layer',
          appId: '__global',
          trigger: 'caps_lock',
          layerName: 'os-vim',
          mode: 'oneshot',
          description: 'one-shot only',
        },
      ],
    });
    // No watchdog SetTimer should appear when the file has no hold layers.
    expect(out).not.toMatch(/SetTimer\(HotkeySync_LayerWatchdog/);
  });
});
