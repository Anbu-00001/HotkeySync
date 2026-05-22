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
