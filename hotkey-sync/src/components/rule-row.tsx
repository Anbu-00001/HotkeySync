'use client';

import * as React from 'react';
import { Trash2, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KeyCaptureInput } from '@/components/key-capture-input';
import type { HotkeyRule } from '@/types';
import { cn } from '@/lib/utils';

interface RuleRowProps {
  rule: HotkeyRule;
  appId: string;
  onUpdate: (updates: Partial<Omit<HotkeyRule, 'appId' | 'trigger'>>) => void;
  onRemove: () => void;
  hasConflict: boolean;
}

export function RuleRow({
  rule,
  onUpdate,
  onRemove,
  hasConflict,
}: RuleRowProps): React.JSX.Element {
  const [actionError, setActionError] = React.useState<string | null>(null);

  return (
    <div
      className={cn(
        'rounded-md border bg-card p-3 transition-colors',
        hasConflict && 'border-l-4 border-l-destructive',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <KeyCaptureInput
          value={rule.trigger}
          onChange={() => {
            /* trigger is immutable */
          }}
          onValidationError={() => {
            /* not used for locked field */
          }}
          placeholder="No trigger"
          disabled
          aria-label="Trigger key (locked)"
        />
        <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <KeyCaptureInput
          value={rule.action}
          onChange={(v) => onUpdate({ action: v })}
          onValidationError={setActionError}
          placeholder="Capture action"
          aria-label="Action key"
        />
        <Input
          value={rule.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          maxLength={120}
          placeholder="Describe what this rule does"
          className="flex-1 min-w-48"
          aria-label="Rule description"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label="Remove rule"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {hasConflict && (
        <div className="mt-2 flex items-center gap-1.5 text-destructive text-xs">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Duplicate trigger — only the first rule will apply.</span>
        </div>
      )}
      {actionError && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {actionError}
        </p>
      )}
    </div>
  );
}
