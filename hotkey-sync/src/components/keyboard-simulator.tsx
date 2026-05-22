'use client';

import * as React from 'react';
import { Play, ArrowRight, ShieldOff, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useConfigStore } from '@/store/useConfigStore';
import { simulateForApps } from '@/lib/simulator';
import { detectCrossAppUsage } from '@/lib/cross-app-conflicts';
import { parseKeyCombo, serializeKeyCombo, type Modifier, type TriggerKey } from '@/lib/keys';
import { KeyBadge } from '@/components/key-badge';
import { cn } from '@/lib/utils';
import appsData from '@/data/apps.json';
import type { App } from '@/types';

const APPS = appsData as App[];
const APP_BY_ID = new Map<string, App>(APPS.map((a) => [a.id, a]));

const CODE_TO_TRIGGER_KEY: Record<string, TriggerKey> = {
  KeyA: 'a', KeyB: 'b', KeyC: 'c', KeyD: 'd', KeyE: 'e', KeyF: 'f',
  KeyG: 'g', KeyH: 'h', KeyI: 'i', KeyJ: 'j', KeyK: 'k', KeyL: 'l',
  KeyM: 'm', KeyN: 'n', KeyO: 'o', KeyP: 'p', KeyQ: 'q', KeyR: 'r',
  KeyS: 's', KeyT: 't', KeyU: 'u', KeyV: 'v', KeyW: 'w', KeyX: 'x',
  KeyY: 'y', KeyZ: 'z',
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
  F1: 'f1', F2: 'f2', F3: 'f3', F4: 'f4', F5: 'f5', F6: 'f6',
  F7: 'f7', F8: 'f8', F9: 'f9', F10: 'f10', F11: 'f11', F12: 'f12',
  Comma: 'comma', Period: 'period', Slash: 'slash',
  Semicolon: 'semicolon', Quote: 'quote',
  BracketLeft: 'open_bracket', BracketRight: 'close_bracket',
  Backslash: 'backslash', Backquote: 'grave_accent',
  Minus: 'minus', Equal: 'equal',
  Space: 'space', Tab: 'tab', Escape: 'escape',
  Enter: 'return_or_enter', NumpadEnter: 'return_or_enter',
  Backspace: 'delete_or_backspace', Delete: 'delete_forward',
  ArrowUp: 'up_arrow', ArrowDown: 'down_arrow',
  ArrowLeft: 'left_arrow', ArrowRight: 'right_arrow',
  Home: 'home', End: 'end', PageUp: 'page_up', PageDown: 'page_down',
};

function modifiersFromEvent(e: KeyboardEvent): Modifier[] {
  const out: Modifier[] = [];
  if (e.ctrlKey) out.push('ctrl');
  if (e.shiftKey) out.push('shift');
  if (e.altKey) out.push('alt');
  if (e.metaKey) out.push('meta');
  return out.sort((a, b) => a.localeCompare(b));
}

export function KeyboardSimulator(): React.JSX.Element {
  const selectedAppIds = useConfigStore((s) => s.selectedAppIds);
  const rules = useConfigStore((s) => s.rules);

  const [active, setActive] = React.useState(false);
  const [lastCombo, setLastCombo] = React.useState<string | null>(null);
  const [hint, setHint] = React.useState<string>('');

  const targetRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!active) return;
    const el = targetRef.current;
    if (!el) return;

    function handleKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      const mods = modifiersFromEvent(e);
      const tk = CODE_TO_TRIGGER_KEY[e.code];
      if (!tk) {
        setHint('Unmapped physical key — modifiers alone aren’t enough.');
        return;
      }
      try {
        const combo = serializeKeyCombo({ modifiers: mods, key: tk });
        parseKeyCombo(combo);
        setLastCombo(combo);
        setHint('');
      } catch (err) {
        setHint(err instanceof Error ? err.message : 'Could not interpret key.');
      }
    }

    el.addEventListener('keydown', handleKeyDown);
    return () => {
      el.removeEventListener('keydown', handleKeyDown);
    };
  }, [active]);

  const outcomes = React.useMemo(() => {
    if (!lastCombo) return [];
    return simulateForApps(lastCombo, selectedAppIds, rules);
  }, [lastCombo, selectedAppIds, rules]);

  // Cross-app conflict for *this specific captured combo*. Reuses the same
  // detector that powers the global conflict matrix — keeps semantics aligned.
  const conflictInfo = React.useMemo(() => {
    if (!lastCombo) return null;
    // Restrict to rules in currently-selected apps so the surfaced conflicts
    // match what the user sees in the per-app outcomes below.
    const selectedSet = new Set(selectedAppIds);
    const scoped = rules.filter((r) => selectedSet.has(r.appId));
    const all = detectCrossAppUsage(scoped);
    return all.find((u) => u.trigger === lastCombo) ?? null;
  }, [lastCombo, selectedAppIds, rules]);

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <div className="flex items-start gap-3">
        <Play className="h-5 w-5 text-primary mt-0.5" />
        <div className="flex-1">
          <h3 className="text-base font-semibold">Live keyboard simulator</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Click the box, press any key combo, and see exactly what each app
            would do once your config is installed. No need to install AHK or
            Karabiner first.
          </p>
        </div>
      </div>

      <div
        ref={targetRef}
        tabIndex={0}
        role="application"
        aria-label="Keyboard simulator capture area"
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
        className={cn(
          'flex flex-col items-center justify-center min-h-24 rounded-md border-2 border-dashed p-4 cursor-text transition-colors',
          active
            ? 'border-primary bg-primary/5'
            : 'border-border bg-muted/20 hover:bg-muted/40',
        )}
      >
        {lastCombo ? (
          <>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              You pressed
            </p>
            <KeyBadge combo={lastCombo} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {active
              ? 'Press any key combination…'
              : 'Click here, then press a key combination.'}
          </p>
        )}
        {hint && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">{hint}</p>
        )}
        <p className="text-[10px] text-muted-foreground mt-3 leading-snug">
          Browser-reserved combos (Ctrl+W, Ctrl+T, Ctrl+N) cannot be captured
          here, but your generated AHK / Karabiner config WILL still remap them
          at the OS level.
        </p>
      </div>

      {lastCombo && conflictInfo && (
        <div
          className={cn(
            'rounded-md border p-3 text-xs space-y-1',
            conflictInfo.hasConflict
              ? 'border-destructive/50 bg-destructive/5 text-destructive'
              : 'border-green-500/40 bg-green-500/5 text-green-700 dark:text-green-400',
          )}
          role="status"
          data-testid="simulator-conflict-banner"
        >
          {conflictInfo.hasConflict ? (
            <>
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                Cross-app conflict: this combo does{' '}
                {conflictInfo.uniqueActions} different things across{' '}
                {conflictInfo.usages.length} of your selected apps.
              </p>
              {conflictInfo.mixedKind && (
                <p className="text-[11px] pl-5">
                  One side is a basic remap, the other is Tap &amp; Hold —
                  those feel <em>completely</em> different at the keyboard.
                </p>
              )}
            </>
          ) : (
            <p className="flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Consistent across {conflictInfo.usages.length} apps — the same
              behaviour everywhere this trigger is bound.
            </p>
          )}
        </div>
      )}

      {lastCombo && (
        <div className="rounded-md border bg-background p-3 space-y-2">
          <p className="text-xs font-medium">
            With your current rules, this is what each app would do:
          </p>
          {selectedAppIds.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No apps selected. The simulator needs at least one selected app
              to show a per-app outcome.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {outcomes.map((o) => {
                const app = APP_BY_ID.get(o.appId);
                return (
                  <li
                    key={o.appId}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="w-32 truncate" aria-hidden="true">
                      {app?.icon ?? '📦'} {app?.name ?? o.appId}
                    </span>
                    {o.matched ? (
                      o.matched.kind === 'basic' ? (
                        <>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <KeyBadge combo={o.matched.action} size="sm" />
                          <span className="text-muted-foreground">
                            ({o.matched.description})
                          </span>
                        </>
                      ) : (
                        <>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="flex flex-col text-[10px] text-muted-foreground">
                            <span>
                              tap&nbsp;(&lt;{o.matched.tapTimeoutMs}&thinsp;ms): <KeyBadge combo={o.matched.tapAction} size="sm" />
                            </span>
                            <span>
                              hold&nbsp;(≥{o.matched.tapTimeoutMs}&thinsp;ms): <KeyBadge combo={o.matched.holdAction} size="sm" />
                            </span>
                          </span>
                        </>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground italic">
                        <ShieldOff className="h-3 w-3" />
                        no remap — passes through to the app
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
