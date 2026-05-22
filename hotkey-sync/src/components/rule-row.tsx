'use client';

import * as React from 'react';
import { Trash2, AlertTriangle, ArrowRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KeyCaptureInput } from '@/components/key-capture-input';
import { Badge } from '@/components/ui/badge';
import type { HotkeyRule } from '@/types';
import {
  TAP_HOLD_MIN_TIMEOUT_MS,
  TAP_HOLD_MAX_TIMEOUT_MS,
} from '@/types';
import type { HotkeyRuleUpdate } from '@/store/useConfigStore';
import { cn } from '@/lib/utils';

interface RuleRowProps {
  rule: HotkeyRule;
  appId: string;
  onUpdate: (updates: HotkeyRuleUpdate) => void;
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

  const isTapHold = rule.kind === 'tap_hold';

  return (
    <div
      className={cn(
        'rounded-md border bg-card p-3 transition-colors',
        hasConflict && 'border-l-4 border-l-destructive',
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
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
            {isTapHold && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Zap className="h-2.5 w-2.5" />
                Tap &amp; Hold
              </Badge>
            )}
          </div>
        </div>
        <ArrowRight
          className="h-4 w-4 text-muted-foreground mt-2"
          aria-hidden="true"
        />
        {rule.kind === 'basic' ? (
          <KeyCaptureInput
            value={rule.action}
            onChange={(v) => onUpdate({ action: v })}
            onValidationError={setActionError}
            placeholder="Capture action"
            aria-label="Action key"
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-12">
                Tap
              </span>
              <KeyCaptureInput
                value={rule.tapAction}
                onChange={(v) => onUpdate({ tapAction: v })}
                onValidationError={setActionError}
                placeholder="Tap action"
                aria-label="Tap action key"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-12">
                Hold
              </span>
              <KeyCaptureInput
                value={rule.holdAction}
                onChange={(v) => onUpdate({ holdAction: v })}
                onValidationError={setActionError}
                placeholder="Hold action"
                aria-label="Hold action key"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-12">
                Timeout
              </span>
              <input
                type="range"
                min={TAP_HOLD_MIN_TIMEOUT_MS}
                max={TAP_HOLD_MAX_TIMEOUT_MS}
                step={10}
                value={rule.tapTimeoutMs}
                onChange={(e) =>
                  onUpdate({ tapTimeoutMs: Number(e.target.value) })
                }
                className="w-40"
                aria-label="Tap timeout (milliseconds)"
                title="Below 150 ms tends to mis-fire when typing. Above 400 ms feels sluggish. 200 ms is the QMK community sweet spot."
              />
              <span className="text-[10px] text-muted-foreground font-mono w-12">
                {rule.tapTimeoutMs}&thinsp;ms
              </span>
            </div>
          </div>
        )}
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
