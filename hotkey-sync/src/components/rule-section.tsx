'use client';

import * as React from 'react';
import { MousePointerClick } from 'lucide-react';
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

  return (
    <div className="space-y-4">
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
