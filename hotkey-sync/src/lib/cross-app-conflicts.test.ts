import { describe, it, expect } from 'vitest';
import {
  detectCrossAppUsage,
  summariseCrossAppUsage,
} from '@/lib/cross-app-conflicts';
import type { HotkeyRule } from '@/types';

function r(
  appId: string,
  trigger: string,
  action: string,
  description = 'd',
): HotkeyRule {
  return { kind: 'basic', appId, trigger, action, description };
}

describe('detectCrossAppUsage', () => {
  it('returns empty when no rules', () => {
    expect(detectCrossAppUsage([])).toEqual([]);
  });

  it('omits triggers used in only one app', () => {
    const out = detectCrossAppUsage([
      r('google-chrome', 'ctrl+p', 'ctrl+comma'),
    ]);
    expect(out).toEqual([]);
  });

  it('detects same-trigger different-actions as conflict', () => {
    const out = detectCrossAppUsage([
      r('google-chrome', 'ctrl+p', 'ctrl+comma', 'Prefs'),
      r('vs-code', 'ctrl+p', 'ctrl+shift+p', 'Cmd palette'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].trigger).toBe('ctrl+p');
    expect(out[0].hasConflict).toBe(true);
    expect(out[0].uniqueActions).toBe(2);
    expect(out[0].usages.map((u) => u.appId).sort()).toEqual([
      'google-chrome',
      'vs-code',
    ]);
  });

  it('marks same-trigger same-action across apps as consistent (not conflict)', () => {
    const out = detectCrossAppUsage([
      r('google-chrome', 'ctrl+p', 'ctrl+comma'),
      r('mozilla-firefox', 'ctrl+p', 'ctrl+comma'),
      r('microsoft-edge', 'ctrl+p', 'ctrl+comma'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].hasConflict).toBe(false);
    expect(out[0].uniqueActions).toBe(1);
    expect(out[0].usages).toHaveLength(3);
  });

  it('sorts conflicts before consistent uses', () => {
    const out = detectCrossAppUsage([
      // Consistent across browsers
      r('google-chrome', 'ctrl+p', 'ctrl+comma'),
      r('mozilla-firefox', 'ctrl+p', 'ctrl+comma'),
      // Conflict — same trigger, different actions
      r('vs-code', 'ctrl+w', 'ctrl+shift+w'),
      r('slack', 'ctrl+w', 'escape'),
    ]);
    expect(out[0].trigger).toBe('ctrl+w');
    expect(out[0].hasConflict).toBe(true);
    expect(out[1].trigger).toBe('ctrl+p');
    expect(out[1].hasConflict).toBe(false);
  });

  it('does not flag same-app duplicates (those are same-app conflicts, not cross-app)', () => {
    // detectConflicts in Phase 1 already covers same-app duplicates.
    // This function only cares about cross-app usage.
    const out = detectCrossAppUsage([
      r('google-chrome', 'ctrl+p', 'ctrl+comma'),
      r('google-chrome', 'ctrl+p', 'ctrl+period'),
    ]);
    expect(out).toEqual([]);
  });

  it('three-way conflict reports all three apps', () => {
    const out = detectCrossAppUsage([
      r('google-chrome', 'ctrl+p', 'ctrl+comma'),
      r('vs-code', 'ctrl+p', 'ctrl+shift+p'),
      r('slack', 'ctrl+p', 'escape'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].uniqueActions).toBe(3);
    expect(out[0].usages).toHaveLength(3);
  });
});

describe('summariseCrossAppUsage', () => {
  it('counts conflicts vs consistent triggers', () => {
    const s = summariseCrossAppUsage([
      // consistent
      r('google-chrome', 'ctrl+p', 'ctrl+comma'),
      r('mozilla-firefox', 'ctrl+p', 'ctrl+comma'),
      // conflicting
      r('vs-code', 'ctrl+w', 'ctrl+shift+w'),
      r('slack', 'ctrl+w', 'escape'),
    ]);
    expect(s).toEqual({
      totalTriggers: 2,
      consistentTriggers: 1,
      conflictingTriggers: 1,
      mixedKindTriggers: 0,
    });
  });

  it('zero for empty rules', () => {
    expect(summariseCrossAppUsage([])).toEqual({
      totalTriggers: 0,
      consistentTriggers: 0,
      conflictingTriggers: 0,
      mixedKindTriggers: 0,
    });
  });
});

describe('detectCrossAppUsage — tap_hold rules', () => {
  function th(
    appId: string,
    trigger: string,
    tapAction: string,
    holdAction: string,
    tapTimeoutMs = 200,
  ): HotkeyRule {
    return {
      kind: 'tap_hold',
      appId,
      trigger,
      tapAction,
      holdAction,
      tapTimeoutMs,
      description: 'th',
    };
  }

  it('two identical tap_hold rules across apps are consistent (same tap/hold/timing)', () => {
    const out = detectCrossAppUsage([
      th('vs-code', 'meta+grave_accent', 'escape', 'ctrl+grave_accent'),
      th('google-chrome', 'meta+grave_accent', 'escape', 'ctrl+grave_accent'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].hasConflict).toBe(false);
    expect(out[0].mixedKind).toBe(false);
  });

  it('two tap_hold rules with different timings conflict', () => {
    const out = detectCrossAppUsage([
      th('vs-code', 'meta+grave_accent', 'escape', 'ctrl+grave_accent', 200),
      th('google-chrome', 'meta+grave_accent', 'escape', 'ctrl+grave_accent', 350),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].hasConflict).toBe(true);
  });

  it('two tap_hold rules with different hold actions conflict', () => {
    const out = detectCrossAppUsage([
      th('vs-code', 'meta+grave_accent', 'escape', 'ctrl+grave_accent'),
      th('google-chrome', 'meta+grave_accent', 'escape', 'ctrl+1'),
    ]);
    expect(out[0].hasConflict).toBe(true);
  });

  it('basic + tap_hold on same trigger is flagged as conflict AND mixedKind', () => {
    const out = detectCrossAppUsage([
      r('google-chrome', 'meta+grave_accent', 'meta+1'),
      th('vs-code', 'meta+grave_accent', 'escape', 'ctrl+grave_accent'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].hasConflict).toBe(true);
    expect(out[0].mixedKind).toBe(true);
  });

  it('mixedKind conflicts sort before same-kind conflicts', () => {
    const out = detectCrossAppUsage([
      // same-kind conflict on ctrl+w
      r('vs-code', 'ctrl+w', 'ctrl+shift+w'),
      r('slack', 'ctrl+w', 'escape'),
      // mixed-kind conflict on meta+`
      r('google-chrome', 'meta+grave_accent', 'meta+1'),
      th('vs-code', 'meta+grave_accent', 'escape', 'ctrl+grave_accent'),
    ]);
    expect(out[0].mixedKind).toBe(true);
    expect(out[1].mixedKind).toBe(false);
  });

  it('summariseCrossAppUsage counts mixedKindTriggers', () => {
    const s = summariseCrossAppUsage([
      r('google-chrome', 'meta+grave_accent', 'meta+1'),
      th('vs-code', 'meta+grave_accent', 'escape', 'ctrl+grave_accent'),
    ]);
    expect(s.mixedKindTriggers).toBe(1);
  });
});
