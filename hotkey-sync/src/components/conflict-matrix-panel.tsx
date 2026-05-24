'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Grid3x3 } from 'lucide-react';
import { useConfigStore } from '@/store/useConfigStore';
import {
  detectCrossAppUsage,
  summariseCrossAppUsage,
} from '@/lib/cross-app-conflicts';
import { KeyBadge } from '@/components/key-badge';
import appsData from '@/data/apps.json';
import type { App } from '@/types';
import { cn } from '@/lib/utils';

const APPS = appsData as App[];
const APP_BY_ID = new Map<string, App>(APPS.map((a) => [a.id, a]));

export function ConflictMatrixPanel(): React.JSX.Element {
  const rules = useConfigStore((s) => s.rules);

  const usages = React.useMemo(() => detectCrossAppUsage(rules), [rules]);
  const summary = React.useMemo(() => summariseCrossAppUsage(rules), [rules]);

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <div className="flex items-start gap-3">
        <Grid3x3 className="h-5 w-5 text-primary mt-0.5" />
        <div className="flex-1">
          <h3 className="text-base font-semibold">Cross-app usage</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            How the same trigger key behaves across your apps. Inconsistent
            actions are flagged; consistent uses are shown so you can verify
            them on purpose.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div className="rounded-md border bg-background p-2">
          <p className="text-muted-foreground">Triggers used in ≥ 2 apps</p>
          <p className="text-lg font-semibold">{summary.totalTriggers}</p>
        </div>
        <div className="rounded-md border bg-background p-2">
          <p className="text-muted-foreground">Consistent</p>
          <p className="text-lg font-semibold text-green-600">
            {summary.consistentTriggers}
          </p>
        </div>
        <div className="rounded-md border bg-background p-2">
          <p className="text-muted-foreground">Conflicting</p>
          <p
            className={cn(
              'text-lg font-semibold',
              summary.conflictingTriggers > 0
                ? 'text-destructive'
                : 'text-muted-foreground',
            )}
          >
            {summary.conflictingTriggers}
          </p>
        </div>
        <div className="rounded-md border bg-background p-2">
          <p className="text-muted-foreground">Mixed kind</p>
          <p
            className={cn(
              'text-lg font-semibold',
              summary.mixedKindTriggers > 0
                ? 'text-destructive'
                : 'text-muted-foreground',
            )}
          >
            {summary.mixedKindTriggers}
          </p>
        </div>
      </div>

      {usages.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No triggers are mapped across multiple apps yet. As you add rules,
          shared triggers will appear here.
        </p>
      ) : (
        <ul className="space-y-3">
          {usages.map((u) => (
            <li
              key={u.trigger}
              className={cn(
                'rounded-md border p-3',
                u.hasConflict
                  ? 'border-destructive/50 bg-destructive/5'
                  : 'border-green-500/30 bg-green-500/5',
              )}
            >
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {u.hasConflict ? (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                )}
                <KeyBadge combo={u.trigger} size="sm" />
                <span
                  className={cn(
                    'text-xs',
                    u.hasConflict
                      ? 'text-destructive'
                      : 'text-green-700 dark:text-green-400',
                  )}
                >
                  {u.hasConflict
                    ? `does ${u.uniqueActions} different things across ${u.usages.length} apps`
                    : `consistently does the same thing across ${u.usages.length} apps`}
                </span>
                {u.mixedKind && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                    basic + Tap &amp; Hold — feels completely different
                  </span>
                )}
              </div>
              <ul className="space-y-1 text-xs pl-6">
                {u.usages.map((usage) => {
                  const app = APP_BY_ID.get(usage.appId);
                  return (
                    <li
                      key={`${usage.appId}-${usage.behaviourKey}`}
                      className="flex items-center gap-2 flex-wrap"
                    >
                      <span className="w-32 truncate">
                        <span aria-hidden="true">{app?.icon ?? '📦'}</span>{' '}
                        {app?.name ?? usage.appId}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      {usage.kind === 'basic' ? (
                        <KeyBadge combo={usage.action} size="sm" />
                      ) : usage.kind === 'tap_hold' ? (
                        <span className="inline-flex items-center gap-1 text-[11px]">
                          <span className="text-muted-foreground">tap</span>
                          <KeyBadge combo={usage.tapAction} size="sm" />
                          <span className="text-muted-foreground">/ hold</span>
                          <KeyBadge combo={usage.holdAction} size="sm" />
                          <span className="text-muted-foreground">
                            @ {usage.tapTimeoutMs}&thinsp;ms
                          </span>
                        </span>
                      ) : (
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          disabled
                        </span>
                      )}
                      {usage.description && (
                        <span className="text-muted-foreground italic truncate">
                          {usage.description}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
