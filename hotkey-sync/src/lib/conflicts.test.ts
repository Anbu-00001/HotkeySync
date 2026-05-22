import { describe, it, expect } from 'vitest';
import { detectConflicts } from '@/lib/conflicts';
import type { HotkeyRule } from '@/types';

function rule(appId: string, trigger: string, description = 'desc'): HotkeyRule {
  return { kind: 'basic', appId, trigger, action: 'ctrl+comma', description };
}

describe('detectConflicts', () => {
  it('returns no conflicts for an empty rules array', () => {
    expect(detectConflicts([])).toEqual([]);
  });

  it('returns no conflicts when every appId+trigger pair is unique', () => {
    const rules = [
      rule('vs-code', 'ctrl+p'),
      rule('vs-code', 'ctrl+w'),
      rule('google-chrome', 'ctrl+p'),
    ];
    expect(detectConflicts(rules)).toEqual([]);
  });

  it('reports a conflict when one app has the same trigger twice', () => {
    const r1 = rule('vs-code', 'ctrl+p', 'first');
    const r2 = rule('vs-code', 'ctrl+p', 'second');
    const reports = detectConflicts([r1, r2]);
    expect(reports).toHaveLength(1);
    expect(reports[0].appId).toBe('vs-code');
    expect(reports[0].trigger).toBe('ctrl+p');
    expect(reports[0].conflictingRules).toHaveLength(2);
  });

  it('does not treat the same trigger across different apps as a conflict', () => {
    const rules = [
      rule('vs-code', 'ctrl+p'),
      rule('google-chrome', 'ctrl+p'),
    ];
    expect(detectConflicts(rules)).toEqual([]);
  });

  it('reports all rules involved when three or more collide', () => {
    const rules = [
      rule('vs-code', 'ctrl+p', 'a'),
      rule('vs-code', 'ctrl+p', 'b'),
      rule('vs-code', 'ctrl+p', 'c'),
    ];
    const reports = detectConflicts(rules);
    expect(reports).toHaveLength(1);
    expect(reports[0].conflictingRules).toHaveLength(3);
  });
});
