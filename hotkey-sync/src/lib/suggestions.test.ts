import { describe, it, expect } from 'vitest';
import {
  allSuggestions,
  SUGGESTIONS_COUNT,
  suggestRules,
} from '@/lib/suggestions';
import { hotkeyRuleSchema } from '@/lib/schemas';
import appsData from '@/data/apps.json';
import type { App, HotkeyRule } from '@/types';

const APPS = appsData as App[];
const APP_IDS = new Set(APPS.map((a) => a.id));

describe('suggestions catalogue invariants', () => {
  it('every suggestion targets a real app in apps.json', () => {
    for (const s of allSuggestions()) {
      expect(APP_IDS.has(s.rule.appId), `unknown appId: ${s.rule.appId}`).toBe(
        true,
      );
    }
  });

  it('every suggestion has a non-empty rationale', () => {
    for (const s of allSuggestions()) {
      expect(s.rationale.length).toBeGreaterThan(0);
      expect(s.rationale.length).toBeLessThan(500);
    }
  });

  it('suggestion ids are unique', () => {
    const ids = allSuggestions().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('SUGGESTIONS_COUNT matches allSuggestions().length', () => {
    expect(SUGGESTIONS_COUNT).toBe(allSuggestions().length);
  });

  it('every suggestion rule passes hotkeyRuleSchema validation (Wave 2.5)', () => {
    for (const s of allSuggestions()) {
      const result = hotkeyRuleSchema.safeParse(s.rule);
      if (!result.success) {
        console.error(s.id, result.error.issues);
      }
      expect(result.success, `suggestion "${s.id}" failed schema`).toBe(true);
    }
  });

  it('rejects exceptApps on a non-global rule (Wave 2.5 refinement)', () => {
    const bogus = {
      kind: 'basic' as const,
      appId: 'google-chrome',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
      description: 'should not validate',
      exceptApps: ['vs-code'],
    };
    const result = hotkeyRuleSchema.safeParse(bogus);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/exceptApps/);
    }
  });
});

describe('suggestRules', () => {
  it('returns an empty array when no apps are selected', () => {
    expect(
      suggestRules({ selectedAppIds: [], existingRules: [] }),
    ).toEqual([]);
  });

  it('only surfaces suggestions whose app is selected', () => {
    const out = suggestRules({
      selectedAppIds: ['google-chrome'],
      existingRules: [],
    });
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(s.rule.appId).toBe('google-chrome');
    }
  });

  it('filters out triggers already bound for that app', () => {
    const existing: HotkeyRule[] = [
      {
        kind: 'basic',
        appId: 'google-chrome',
        trigger: 'ctrl+p',
        action: 'ctrl+t', // user has SOME other action bound; we still skip the suggestion
        description: 'user-defined',
      },
    ];
    const out = suggestRules({
      selectedAppIds: ['google-chrome'],
      existingRules: existing,
    });
    expect(out.find((s) => s.id === 'chrome-prefs')).toBeUndefined();
  });

  it('honours dismissedIds', () => {
    const out = suggestRules({
      selectedAppIds: ['google-chrome'],
      existingRules: [],
      dismissedIds: new Set(['chrome-prefs']),
    });
    expect(out.find((s) => s.id === 'chrome-prefs')).toBeUndefined();
  });

  it('sorts safety-tagged suggestions before standardise/productivity/vim', () => {
    const out = suggestRules({
      selectedAppIds: ['google-chrome', 'discord'],
      existingRules: [],
    });
    // First should be a safety tag (discord-close-tab), then standardise (chrome-prefs).
    expect(out[0].tag).toBe('safety');
    expect(out.some((s) => s.tag === 'standardise')).toBe(true);
  });

  it('produces stable order between calls with identical inputs', () => {
    const a = suggestRules({
      selectedAppIds: ['vs-code', 'sublime-text'],
      existingRules: [],
    });
    const b = suggestRules({
      selectedAppIds: ['vs-code', 'sublime-text'],
      existingRules: [],
    });
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id));
  });

  it('does not suggest the same trigger twice for a single app (catalogue dedupe)', () => {
    // We allow multiple suggestions per app, but each suggestion's trigger
    // must be unique within that app or the engine would surface contradictions.
    const byAppTrigger = new Map<string, string[]>();
    for (const s of allSuggestions()) {
      const key = `${s.rule.appId}::${s.rule.trigger}`;
      const arr = byAppTrigger.get(key) ?? [];
      arr.push(s.id);
      byAppTrigger.set(key, arr);
    }
    for (const [key, ids] of byAppTrigger) {
      expect(
        ids.length,
        `multiple suggestions bind the same trigger for ${key}: ${ids.join(',')}`,
      ).toBe(1);
    }
  });
});
