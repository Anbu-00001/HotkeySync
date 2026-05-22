/**
 * Cross-app conflict / usage analysis.
 *
 * "Conflict" here means: the same trigger is mapped to DIFFERENT behaviour
 * across multiple apps. The composite "behaviour key" depends on the rule kind:
 *   - basic:    action
 *   - tap_hold: `tap_hold:<tapAction>|<holdAction>@<tapTimeoutMs>ms`
 * A basic rule and a tap_hold rule on the same trigger automatically conflict
 * (different kinds = different behaviour). `mixedKind` flags this case so the
 * UI can show "basic in A, tap_hold in B — those will feel completely different".
 *
 * Pure function: deterministic, side-effect-free, fully unit-testable.
 */

import type { HotkeyRule } from '@/types';

/**
 * One usage of a trigger in one app. `behaviourKey` is the stable composite
 * used for equality (see file-level doc). The raw fields are kept too so the
 * UI can render tap_hold's tap/hold separately without re-parsing the key.
 */
export type TriggerUsage =
  | {
      appId: string;
      kind: 'basic';
      behaviourKey: string;
      action: string;
      description: string;
    }
  | {
      appId: string;
      kind: 'tap_hold';
      behaviourKey: string;
      tapAction: string;
      holdAction: string;
      tapTimeoutMs: number;
      description: string;
    };

export interface CrossAppUsage {
  trigger: string;
  usages: TriggerUsage[];
  /** How many distinct behaviour keys exist for this trigger across the apps. */
  uniqueActions: number;
  /** uniqueActions > 1 — the same trigger does different things in different apps. */
  hasConflict: boolean;
  /** True iff at least one usage is basic AND at least one is tap_hold. */
  mixedKind: boolean;
}

function behaviourKey(rule: HotkeyRule): string {
  return rule.kind === 'basic'
    ? `basic:${rule.action}`
    : `tap_hold:${rule.tapAction}|${rule.holdAction}@${rule.tapTimeoutMs}ms`;
}

/**
 * Returns triggers that appear in 2 or more apps, sorted with conflicts first.
 * Triggers used in only one app are omitted.
 */
export function detectCrossAppUsage(rules: HotkeyRule[]): CrossAppUsage[] {
  const byTrigger = new Map<string, HotkeyRule[]>();
  for (const r of rules) {
    const bucket = byTrigger.get(r.trigger);
    if (bucket) bucket.push(r);
    else byTrigger.set(r.trigger, [r]);
  }

  const out: CrossAppUsage[] = [];
  for (const [trigger, bucket] of byTrigger) {
    // Only count rules across DIFFERENT apps. (One app with the same trigger
    // twice is a same-app conflict, surfaced by detectConflicts — not here.)
    const distinctAppIds = new Set(bucket.map((r) => r.appId));
    if (distinctAppIds.size < 2) continue;

    const usages: TriggerUsage[] = bucket.map((r) =>
      r.kind === 'basic'
        ? {
            appId: r.appId,
            kind: 'basic',
            behaviourKey: behaviourKey(r),
            action: r.action,
            description: r.description,
          }
        : {
            appId: r.appId,
            kind: 'tap_hold',
            behaviourKey: behaviourKey(r),
            tapAction: r.tapAction,
            holdAction: r.holdAction,
            tapTimeoutMs: r.tapTimeoutMs,
            description: r.description,
          },
    );
    const uniqueActions = new Set(usages.map((u) => u.behaviourKey)).size;
    const hasBasic = usages.some((u) => u.kind === 'basic');
    const hasTapHold = usages.some((u) => u.kind === 'tap_hold');
    out.push({
      trigger,
      usages,
      uniqueActions,
      hasConflict: uniqueActions > 1,
      mixedKind: hasBasic && hasTapHold,
    });
  }

  // Conflicts first (true before false), then mixed-kind (more severe) before
  // same-kind conflicts, then alpha by trigger for stability.
  out.sort((a, b) => {
    if (a.hasConflict !== b.hasConflict) return a.hasConflict ? -1 : 1;
    if (a.mixedKind !== b.mixedKind) return a.mixedKind ? -1 : 1;
    return a.trigger.localeCompare(b.trigger);
  });
  return out;
}

export interface ConflictSummary {
  totalTriggers: number;
  consistentTriggers: number;
  conflictingTriggers: number;
  mixedKindTriggers: number;
}

export function summariseCrossAppUsage(rules: HotkeyRule[]): ConflictSummary {
  const all = detectCrossAppUsage(rules);
  let conflicting = 0;
  let mixed = 0;
  for (const u of all) {
    if (u.hasConflict) conflicting++;
    if (u.mixedKind) mixed++;
  }
  return {
    totalTriggers: all.length,
    consistentTriggers: all.length - conflicting,
    conflictingTriggers: conflicting,
    mixedKindTriggers: mixed,
  };
}
