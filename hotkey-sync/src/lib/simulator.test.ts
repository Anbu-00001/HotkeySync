import { describe, it, expect } from 'vitest';
import { simulateForApps, simulateForSingleApp } from '@/lib/simulator';
import type { HotkeyRule } from '@/types';

function rule(
  appId: string,
  trigger: string,
  action: string,
  description = 'd',
): HotkeyRule {
  return { kind: 'basic', appId, trigger, action, description };
}

describe('simulateForApps', () => {
  it('returns pass-through when no rules exist', () => {
    const outcomes = simulateForApps('ctrl+p', ['google-chrome'], []);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toEqual({
      appId: 'google-chrome',
      triggerCombo: 'ctrl+p',
      matched: null,
      passThrough: true,
    });
  });

  it('returns the matched rule for an app that has one', () => {
    const r = rule('google-chrome', 'ctrl+p', 'ctrl+comma', 'Prefs');
    const outcomes = simulateForApps('ctrl+p', ['google-chrome'], [r]);
    expect(outcomes[0].matched).toEqual(r);
    expect(outcomes[0].passThrough).toBe(false);
  });

  it('returns one outcome per appId in input order', () => {
    const rules: HotkeyRule[] = [
      rule('google-chrome', 'ctrl+p', 'ctrl+comma'),
      rule('vs-code', 'ctrl+p', 'ctrl+shift+p'),
    ];
    const outcomes = simulateForApps(
      'ctrl+p',
      ['vs-code', 'google-chrome', 'slack'],
      rules,
    );
    expect(outcomes.map((o) => o.appId)).toEqual([
      'vs-code',
      'google-chrome',
      'slack',
    ]);
  });

  it('a rule for one app does not match for another', () => {
    const outcomes = simulateForApps(
      'ctrl+p',
      ['google-chrome', 'vs-code'],
      [rule('google-chrome', 'ctrl+p', 'ctrl+comma')],
    );
    expect(outcomes[0].passThrough).toBe(false);
    expect(outcomes[1].passThrough).toBe(true);
  });

  it('different triggers do not collide', () => {
    const outcomes = simulateForApps(
      'ctrl+w',
      ['google-chrome'],
      [rule('google-chrome', 'ctrl+p', 'ctrl+comma')],
    );
    expect(outcomes[0].passThrough).toBe(true);
    expect(outcomes[0].matched).toBeNull();
  });

  it('handles empty appIds list', () => {
    expect(simulateForApps('ctrl+p', [], [])).toEqual([]);
  });

  it('exact-matches the canonical trigger string (no fuzzy match)', () => {
    // The store always stores canonical triggers; the simulator does not
    // re-normalise. If callers pass non-canonical strings, they get pass-through.
    const outcomes = simulateForApps(
      'p+ctrl',
      ['google-chrome'],
      [rule('google-chrome', 'ctrl+p', 'ctrl+comma')],
    );
    expect(outcomes[0].passThrough).toBe(true);
  });
});

describe('simulateForApps — tap_hold rules', () => {
  function tapHold(
    appId: string,
    trigger: string,
    tapAction: string,
    holdAction: string,
    tapTimeoutMs = 200,
    description = 'th',
  ): HotkeyRule {
    return {
      kind: 'tap_hold',
      appId,
      trigger,
      tapAction,
      holdAction,
      tapTimeoutMs,
      description,
    };
  }

  it('returns the tap_hold rule itself when matched', () => {
    const th = tapHold('vs-code', 'meta+grave_accent', 'escape', 'ctrl+grave_accent');
    const out = simulateForApps('meta+grave_accent', ['vs-code'], [th]);
    expect(out[0].matched).toEqual(th);
    expect(out[0].passThrough).toBe(false);
  });

  it('lets consumers narrow on matched.kind to read tap vs hold actions', () => {
    const th = tapHold('vs-code', 'meta+grave_accent', 'escape', 'ctrl+grave_accent');
    const out = simulateForApps('meta+grave_accent', ['vs-code'], [th]);
    const m = out[0].matched;
    if (!m) throw new Error('expected a match');
    if (m.kind !== 'tap_hold') throw new Error('expected tap_hold');
    expect(m.tapAction).toBe('escape');
    expect(m.holdAction).toBe('ctrl+grave_accent');
    expect(m.tapTimeoutMs).toBe(200);
  });

  it('a tap_hold rule still occupies the trigger slot (same trigger basic → pass-through in other app)', () => {
    const th = tapHold('vs-code', 'meta+grave_accent', 'escape', 'ctrl+grave_accent');
    const out = simulateForApps('meta+grave_accent', ['vs-code', 'google-chrome'], [th]);
    expect(out[0].matched).not.toBeNull();
    expect(out[1].matched).toBeNull();
  });
});

describe('simulateForSingleApp', () => {
  it('returns the same shape as the multi variant', () => {
    const r = rule('google-chrome', 'ctrl+p', 'ctrl+comma');
    const single = simulateForSingleApp('ctrl+p', 'google-chrome', [r]);
    const multi = simulateForApps('ctrl+p', ['google-chrome'], [r])[0];
    expect(single).toEqual(multi);
  });
});
