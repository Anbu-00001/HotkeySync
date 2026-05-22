'use client';

import * as React from 'react';
import { MousePointerClick, Zap } from 'lucide-react';
import appsData from '@/data/apps.json';
import { useConfigStore } from '@/store/useConfigStore';
import { detectConflicts } from '@/lib/conflicts';
import { RulePanel } from '@/components/rule-panel';
import type { App } from '@/types';

const APPS = appsData as App[];
const APP_BY_ID = new Map<string, App>(APPS.map((a) => [a.id, a]));

export function RuleSection(): React.JSX.Element {
  const selectedAppIds = useConfigStore((s) => s.selectedAppIds);
  const rules = useConfigStore((s) => s.rules);
  const addRule = useConfigStore((s) => s.addRule);
  const updateRule = useConfigStore((s) => s.updateRule);
  const removeRule = useConfigStore((s) => s.removeRule);

  if (selectedAppIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/20 py-12">
        <MousePointerClick className="h-8 w-8 text-muted-foreground" />
        <div className="text-center">
          <p className="text-base font-medium">No apps selected yet</p>
          <p className="text-sm text-muted-foreground">
            Select apps above to start defining rules.
          </p>
        </div>
      </div>
    );
  }

  const hasTapHold = rules.some((r) => r.kind === 'tap_hold');

  return (
    <div className="space-y-4">
      <details className="rounded-md border bg-card/50 text-xs">
        <summary className="cursor-pointer px-3 py-2 flex items-center gap-2 select-none">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <strong>When to use Tap &amp; Hold</strong>
          <span className="text-muted-foreground">— and when to avoid it</span>
        </summary>
        <div className="px-3 pb-3 space-y-2 text-muted-foreground leading-relaxed">
          <p>
            A Tap &amp; Hold rule gives a single key two behaviours: one if
            released within the timeout, another if held longer. Karabiner runs
            this natively; AHK emulates it with a polling helper that can mis-fire
            on fast typing rolls.
          </p>
          <p className="font-medium text-foreground">Good fits</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>Modifier-position keys (Caps Lock, right Cmd) — rarely tapped accidentally during prose.</li>
            <li>Function keys (F1–F12) that you don&apos;t type in a chord.</li>
            <li>Punctuation you only use intentionally (` , ; etc.).</li>
          </ul>
          <p className="font-medium text-foreground">Avoid</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>Letter keys you type in normal text (a, e, n, o, t, i, s, r — common home-row letters). Every typing roll risks firing the hold action.</li>
            <li>Keys where both the tap and the hold actions feel equally important — you&apos;ll be unhappy at any timeout.</li>
            <li>Timeouts below 150 ms (false hold) or above 400 ms (sluggish). 200 ms is the QMK community sweet spot.</li>
          </ul>
        </div>
      </details>

      {hasTapHold && (
        <div
          className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400"
          role="status"
        >
          You have Tap &amp; Hold rules. They run natively on Karabiner but the
          AHK output emulates them with a polling helper — fast typing rolls
          may briefly trigger the wrong action on Windows.
        </div>
      )}

      {selectedAppIds.map((appId) => {
        const app = APP_BY_ID.get(appId);
        if (!app) return null;
        const appRules = rules.filter((r) => r.appId === appId);
        const conflicts = detectConflicts(appRules);
        const conflictingTriggers = new Set(conflicts.map((c) => c.trigger));
        return (
          <RulePanel
            key={appId}
            app={app}
            rules={appRules}
            conflictingTriggers={conflictingTriggers}
            onAddRule={addRule}
            onUpdateRule={(trigger, updates) =>
              updateRule(appId, trigger, updates)
            }
            onRemoveRule={(trigger) => removeRule(appId, trigger)}
          />
        );
      })}
    </div>
  );
}
