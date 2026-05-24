'use client';

import * as React from 'react';
import { Lightbulb, Plus, X, ShieldAlert, Sparkles } from 'lucide-react';
import { useConfigStore } from '@/store/useConfigStore';
import { suggestRules, type Suggestion } from '@/lib/suggestions';
import appsData from '@/data/apps.json';
import type { App } from '@/types';
import { Button } from '@/components/ui/button';
import { KeyBadge } from '@/components/key-badge';
import { cn } from '@/lib/utils';

const APPS = appsData as App[];
const APP_BY_ID = new Map<string, App>(APPS.map((a) => [a.id, a]));

const TAG_LABEL: Record<Suggestion['tag'], string> = {
  safety: 'Safety',
  standardise: 'Standardise',
  productivity: 'Productivity',
  vim: 'Vim',
};

const TAG_CLASS: Record<Suggestion['tag'], string> = {
  safety:
    'bg-destructive/10 text-destructive border-destructive/30',
  standardise:
    'bg-primary/10 text-primary border-primary/30',
  productivity:
    'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  vim: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
};

export function SuggestionsPanel(): React.JSX.Element | null {
  const selectedAppIds = useConfigStore((s) => s.selectedAppIds);
  const rules = useConfigStore((s) => s.rules);
  const addRule = useConfigStore((s) => s.addRule);

  // Dismissed suggestions stay dismissed for this session only — refresh
  // clears them so the user sees the full list again. Deliberately NOT
  // persisted: a returning user benefits from re-seeing suggestions they
  // may have missed.
  const [dismissed, setDismissed] = React.useState<Set<string>>(
    () => new Set(),
  );

  const suggestions = React.useMemo(
    () =>
      suggestRules({
        selectedAppIds,
        existingRules: rules,
        dismissedIds: dismissed,
      }),
    [selectedAppIds, rules, dismissed],
  );

  if (selectedAppIds.length === 0) return null;
  if (suggestions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card/30 p-4">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-medium">All suggestions applied</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          You&apos;ve picked up every recommendation we have for the apps you
          selected. Add more apps to see more suggestions.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <div className="flex items-start gap-3">
        <Lightbulb className="h-5 w-5 text-primary mt-0.5" />
        <div className="flex-1">
          <h3 className="text-base font-semibold">Suggested for you</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {suggestions.length} individual remap
            {suggestions.length === 1 ? '' : 's'} we think you&apos;d benefit
            from. Click <strong>Add</strong> to apply one without disturbing
            your other rules.
          </p>
        </div>
      </div>

      <ul className="space-y-2" data-testid="suggestion-list">
        {suggestions.map((s) => {
          const app = APP_BY_ID.get(s.rule.appId);
          return (
            <li
              key={s.id}
              className="rounded-md border bg-background p-3 space-y-1.5"
              data-suggestion-id={s.id}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border',
                    TAG_CLASS[s.tag],
                  )}
                >
                  {s.tag === 'safety' && (
                    <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                  )}
                  {TAG_LABEL[s.tag]}
                </span>
                <span className="text-xs text-muted-foreground">
                  <span aria-hidden="true">{app?.icon ?? '📦'}</span>{' '}
                  {app?.name ?? s.rule.appId}
                </span>
                <KeyBadge combo={s.rule.trigger} size="sm" />
                <span className="text-muted-foreground text-xs">→</span>
                {s.rule.kind === 'basic' ? (
                  <KeyBadge combo={s.rule.action} size="sm" />
                ) : s.rule.kind === 'tap_hold' ? (
                  <span className="inline-flex items-center gap-1 text-[11px]">
                    <span className="text-muted-foreground">tap</span>
                    <KeyBadge combo={s.rule.tapAction} size="sm" />
                    <span className="text-muted-foreground">/ hold</span>
                    <KeyBadge combo={s.rule.holdAction} size="sm" />
                  </span>
                ) : (
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    disabled
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {s.rationale}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => addRule(s.rule)}
                  aria-label={`Add suggestion ${s.id}`}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDismissed((prev) => {
                      const next = new Set(prev);
                      next.add(s.id);
                      return next;
                    })
                  }
                  aria-label={`Dismiss suggestion ${s.id}`}
                >
                  <X className="h-4 w-4" />
                  Dismiss
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
