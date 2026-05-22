import { describe, it, expect } from 'vitest';
import { lintAHK } from '@/lib/lint/ahk-lint';
import { generateAHK } from '@/lib/generators/ahk';
import { PRESETS } from '@/data/presets';
import type { Config } from '@/types';

describe('lintAHK — generator output', () => {
  it('accepts an empty rule list (just header)', () => {
    const out = lintAHK(generateAHK({ os: 'windows', rules: [] }));
    expect(out.ok).toBe(true);
    expect(out.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('accepts every shipped preset (basic + tap_hold) without errors', () => {
    for (const preset of PRESETS) {
      const cfg: Config = { os: 'windows', rules: preset.rules };
      const out = lintAHK(generateAHK(cfg));
      expect(
        out.ok,
        `preset "${preset.id}" produced lint errors: ${JSON.stringify(out.issues, null, 2)}`,
      ).toBe(true);
    }
  });

  it('accepts a basic-only file (no helper injected)', () => {
    const cfg: Config = {
      os: 'windows',
      rules: [
        {
          kind: 'basic',
          appId: 'google-chrome',
          trigger: 'ctrl+p',
          action: 'ctrl+comma',
          description: 'Prefs',
        },
      ],
    };
    const out = lintAHK(generateAHK(cfg));
    expect(out.ok).toBe(true);
  });

  it('accepts a tap_hold file (helper injected exactly once)', () => {
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
          description: 'tap esc / hold terminal',
        },
      ],
    };
    const out = lintAHK(generateAHK(cfg));
    expect(out.ok).toBe(true);
  });
});

describe('lintAHK — synthetic broken inputs', () => {
  it('AHK001: flags missing #Requires directive', () => {
    const src = `
#HotIf WinActive("ahk_exe chrome.exe")
^p:: Send("^,")
#HotIf
`.trim();
    const out = lintAHK(src);
    expect(out.ok).toBe(false);
    expect(out.issues.map((i) => i.code)).toContain('AHK001');
  });

  it('AHK002: flags nested #HotIf opener', () => {
    const src = `
#Requires AutoHotkey v2.0+
#HotIf WinActive("ahk_exe a.exe")
^p:: Send("^,")
#HotIf WinActive("ahk_exe b.exe")
^q:: Send("^.")
#HotIf
`.trim();
    const out = lintAHK(src);
    expect(out.issues.map((i) => i.code)).toContain('AHK002');
  });

  it('AHK002: flags closing #HotIf with no opener', () => {
    const src = `
#Requires AutoHotkey v2.0+
#HotIf
`.trim();
    const out = lintAHK(src);
    expect(out.issues.map((i) => i.code)).toContain('AHK002');
  });

  it('AHK003: flags #HotIf opened but never closed', () => {
    const src = `
#Requires AutoHotkey v2.0+
#HotIf WinActive("ahk_exe chrome.exe")
^p:: Send("^,")
`.trim();
    const out = lintAHK(src);
    expect(out.ok).toBe(false);
    expect(out.issues.map((i) => i.code)).toContain('AHK003');
  });

  it('AHK004: warns when a hotkey lives outside #HotIf', () => {
    const src = `
#Requires AutoHotkey v2.0+
^p:: Send("^,")
`.trim();
    const out = lintAHK(src);
    expect(out.issues.map((i) => i.code)).toContain('AHK004');
  });

  it('AHK005: errors on unrecognised RHS', () => {
    const src = `
#Requires AutoHotkey v2.0+
#HotIf WinActive("ahk_exe chrome.exe")
^p:: ExitApp()
#HotIf
`.trim();
    const out = lintAHK(src);
    expect(out.issues.map((i) => i.code)).toContain('AHK005');
  });

  it('AHK006: errors when TapHoldAction is called without the helper defined', () => {
    const src = `
#Requires AutoHotkey v2.0+
#HotIf WinActive("ahk_exe code.exe")
^p:: TapHoldAction(200, "^,", "^.")
#HotIf
`.trim();
    const out = lintAHK(src);
    expect(out.issues.map((i) => i.code)).toContain('AHK006');
  });

  it('AHK006: errors when the helper is defined twice', () => {
    const helper = `TapHoldAction(timeoutMs, tapAction, holdAction) {
  return
}`;
    const src = `
#Requires AutoHotkey v2.0+
${helper}
${helper}
#HotIf WinActive("ahk_exe code.exe")
^p:: TapHoldAction(200, "^,", "^.")
#HotIf
`.trim();
    const out = lintAHK(src);
    expect(out.issues.map((i) => i.code)).toContain('AHK006');
  });

  it('AHK007: warns on duplicate trigger within one block', () => {
    const src = `
#Requires AutoHotkey v2.0+
#HotIf WinActive("ahk_exe chrome.exe")
^p:: Send("^,")
^p:: Send("^.")
#HotIf
`.trim();
    const out = lintAHK(src);
    expect(out.issues.map((i) => i.code)).toContain('AHK007');
  });

  it('AHK009: warns on empty #HotIf block', () => {
    const src = `
#Requires AutoHotkey v2.0+
#HotIf WinActive("ahk_exe chrome.exe")
#HotIf
`.trim();
    const out = lintAHK(src);
    expect(out.issues.map((i) => i.code)).toContain('AHK009');
  });

  it('clean file produces zero issues', () => {
    const src = `
; HotkeySync output
#Requires AutoHotkey v2.0+
#SingleInstance Force

#HotIf WinActive("ahk_exe chrome.exe")
^p:: Send("^,")  ; Open Preferences
#HotIf
`.trim();
    const out = lintAHK(src);
    expect(out.issues).toEqual([]);
  });
});
