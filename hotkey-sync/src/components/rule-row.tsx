'use client';

import * as React from 'react';
import { Trash2, AlertTriangle, ArrowRight, Zap, Ban, Globe, ShieldAlert, Layers, Bell, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KeyCaptureInput } from '@/components/key-capture-input';
import { ActionBadge } from '@/components/action-badge';
import { Badge } from '@/components/ui/badge';
import { isModifierAction } from '@/lib/actions';
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
  const isDisable = rule.kind === 'disable';
  const isLayer = rule.kind === 'layer';
  const isGlobal = rule.appId === '__global';
  const exceptCount = isGlobal ? rule.exceptApps?.length ?? 0 : 0;

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
            {isDisable && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Ban className="h-2.5 w-2.5" />
                Disabled
              </Badge>
            )}
            {isLayer && (
              <Badge
                variant="outline"
                className="text-[10px] gap-1"
                data-testid="layer-rule-badge"
                title="Activates a layer while held — child rules with the matching layerName fire only during the hold."
              >
                <Layers className="h-2.5 w-2.5" />
                Layer
              </Badge>
            )}
            {isGlobal && (
              <Badge
                variant="outline"
                className="text-[10px] gap-1"
                data-testid="global-rule-badge"
                title="Applies in every app. macOS Secure Input fields (password prompts, VPN clients) silently swallow events — Karabiner and Hammerspoon are both blind there; this rule will appear to do nothing in those contexts."
              >
                <Globe className="h-2.5 w-2.5" />
                Global
              </Badge>
            )}
            {isGlobal && exceptCount > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] gap-1"
                data-testid="excluded-apps-chip"
                title={`Excluded in: ${(rule.exceptApps ?? []).join(', ')}`}
              >
                <ShieldAlert className="h-2.5 w-2.5" />
                Excluded in {exceptCount} {exceptCount === 1 ? 'app' : 'apps'}
              </Badge>
            )}
          </div>
        </div>
        <ArrowRight
          className="h-4 w-4 text-muted-foreground mt-2"
          aria-hidden="true"
        />
        {rule.kind === 'basic' ? (
          isModifierAction(rule.action) ? (
            // ModifierAction is read-only in the editor today — users add it
            // via preset/suggestion, then delete-and-recreate to change. The
            // key-capture surface only captures key combos, not modifier bundles.
            <div className="flex items-center gap-2 mt-2" data-testid="modifier-action-readonly">
              <ActionBadge action={rule.action} size="md" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                (read-only)
              </span>
            </div>
          ) : (
            <KeyCaptureInput
              value={rule.action}
              onChange={(v) => onUpdate({ action: v })}
              onValidationError={setActionError}
              placeholder="Capture action"
              aria-label="Action key"
            />
          )
        ) : rule.kind === 'disable' ? (
          <span className="text-xs text-muted-foreground italic mt-2">
            key is swallowed — does nothing in this app
          </span>
        ) : rule.kind === 'layer' ? (
          // Wave 2.7 / 2.8 — layer rules are read-only in the rule-row today;
          // edit by deleting and re-adding from a preset. Child basic rules
          // with matching layerName fire only while the layer is active.
          <div
            className="flex items-center gap-2 mt-2 flex-wrap"
            data-testid="layer-rule-readonly"
          >
            <span className="font-mono text-xs">layer “{rule.layerName}”</span>
            <Badge
              variant="secondary"
              className="text-[10px]"
              data-testid="layer-mode-badge"
              title={
                rule.mode === 'oneshot'
                  ? 'Tap arms the layer; the next child key fires through it and disarms.'
                  : 'Layer is active while the trigger is physically held.'
              }
            >
              {rule.mode === 'oneshot' ? 'One-Shot' : 'Hold'}
            </Badge>
            {rule.mode === 'oneshot' && rule.oneshotTimeoutMs !== undefined && (
              <span
                className="text-[10px] uppercase tracking-wide text-muted-foreground"
                data-testid="oneshot-timeout-chip"
              >
                {rule.oneshotTimeoutMs}&thinsp;ms timeout
              </span>
            )}
            {rule.mode === 'oneshot' && rule.notification !== undefined && (
              <Badge
                variant="outline"
                className="text-[10px] gap-1"
                data-testid="layer-notification-chip"
                title="Shows an on-screen indicator while the layer is armed (Karabiner HUD on macOS; ToolTip on Windows)."
              >
                <Bell className="h-2.5 w-2.5" />
                {rule.notification === '' ? `${rule.layerName} armed` : rule.notification}
              </Badge>
            )}
            {rule.mode === 'oneshot' && rule.oneshotLockOnTaps === 2 && (
              <Badge
                variant="outline"
                className="text-[10px] gap-1"
                data-testid="layer-lock-chip"
                title="Double-tap the trigger to lock the layer on. Re-tap the trigger to unlock. Cancel keys and the disarm timeout don't clear a locked layer (mirrors QMK ONESHOT_TAP_TOGGLE)."
              >
                <Lock className="h-2.5 w-2.5" />
                Lock on 2 taps
              </Badge>
            )}
            {rule.tapAction !== undefined && (
              <>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  tap →
                </span>
                <ActionBadge action={rule.tapAction} size="md" />
              </>
            )}
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              (read-only)
            </span>
          </div>
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
              {isModifierAction(rule.holdAction) ? (
                <div className="flex items-center gap-2" data-testid="modifier-hold-readonly">
                  <ActionBadge action={rule.holdAction} size="md" />
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    (read-only)
                  </span>
                </div>
              ) : (
                <KeyCaptureInput
                  value={rule.holdAction}
                  onChange={(v) => onUpdate({ holdAction: v })}
                  onValidationError={setActionError}
                  placeholder="Hold action"
                  aria-label="Hold action key"
                />
              )}
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
