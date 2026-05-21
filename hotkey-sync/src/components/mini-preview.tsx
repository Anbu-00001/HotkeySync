'use client';

import * as React from 'react';
import { FileCode, ArrowRight } from 'lucide-react';
import { useConfigStore } from '@/store/useConfigStore';
import appsData from '@/data/apps.json';
import { Badge } from '@/components/ui/badge';
import { KeyBadge } from '@/components/key-badge';
import type { App, HotkeyRule } from '@/types';

const APPS = appsData as App[];
const APP_BY_ID = new Map<string, App>(APPS.map((a) => [a.id, a]));

function groupByApp(rules: HotkeyRule[]): Map<string, HotkeyRule[]> {
  const out = new Map<string, HotkeyRule[]>();
  for (const r of rules) {
    const arr = out.get(r.appId);
    if (arr) arr.push(r);
    else out.set(r.appId, [r]);
  }
  return out;
}

export function MiniPreview(): React.JSX.Element {
  const rules = useConfigStore((s) => s.rules);
  const grouped = React.useMemo(() => groupByApp(rules), [rules]);

  const appCount = grouped.size;
  const ruleCount = rules.length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b pb-3 mb-3">
        <h2 className="text-sm font-semibold">Your rules</h2>
        <Badge variant="secondary">{ruleCount}</Badge>
      </header>
      {ruleCount === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <FileCode className="h-8 w-8 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Rules you add will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {Array.from(grouped.entries()).map(([appId, appRules]) => {
              const app = APP_BY_ID.get(appId);
              return (
                <section key={appId} className="space-y-2">
                  <h3 className="flex items-center gap-2 text-xs font-medium">
                    <span aria-hidden="true">{app?.icon ?? '📦'}</span>
                    <span>{app?.name ?? appId}</span>
                  </h3>
                  <ul className="space-y-2">
                    {appRules.map((r) => (
                      <li
                        key={`${r.appId}:${r.trigger}`}
                        className="rounded-md border bg-card/50 p-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <KeyBadge combo={r.trigger} size="sm" />
                          <ArrowRight
                            className="h-3 w-3 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <KeyBadge combo={r.action} size="sm" />
                        </div>
                        {r.description && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {r.description}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          <p className="border-t pt-3 mt-3 text-[11px] text-muted-foreground">
            {ruleCount} rules across {appCount} app{appCount === 1 ? '' : 's'}
          </p>
        </>
      )}
    </div>
  );
}
