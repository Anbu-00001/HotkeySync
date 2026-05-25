'use client';

import * as React from 'react';
import { useConfigStore } from '@/store/useConfigStore';
import { KeyBadge } from '@/components/key-badge';
import { isModifierAction, canonicaliseModifiers } from '@/lib/actions';
import { cn } from '@/lib/utils';
import type { Action } from '@/types';
import type { Modifier } from '@/lib/keys';

interface ActionBadgeProps {
  action: Action;
  size?: 'sm' | 'md';
}

/**
 * Platform-aware modifier glyphs. Matches KeyBadge's labels exactly so
 * a `ModifierAction` renders consistent with key combos that share a modifier
 * prefix (Cmd in a key combo vs Cmd-as-action look identical).
 */
const MODIFIER_LABELS_WINDOWS: Record<Modifier, string> = {
  ctrl: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  meta: 'Win',
};
const MODIFIER_LABELS_MAC: Record<Modifier, string> = {
  ctrl: '⌃',
  shift: '⇧',
  alt: '⌥',
  meta: '⌘',
};

const sizeClasses = {
  sm: 'text-[10px] px-1.5 py-0.5 rounded min-w-[1.25rem]',
  md: 'text-xs px-2 py-1 rounded-md min-w-[1.5rem]',
} as const;

/**
 * Unified renderer for the `Action` union. Defers to KeyBadge for string-form
 * key combos; renders modifier bundles inline with the platform's glyphs and
 * a "Hyper" suffix when all four modifiers are present.
 */
export function ActionBadge({
  action,
  size = 'md',
}: ActionBadgeProps): React.JSX.Element {
  const os = useConfigStore((s) => s.os);

  if (!isModifierAction(action)) {
    return <KeyBadge combo={action} size={size} />;
  }

  const modLabels = os === 'mac' ? MODIFIER_LABELS_MAC : MODIFIER_LABELS_WINDOWS;
  const mods = canonicaliseModifiers(action.modifiers);
  const isHyper = mods.length === 4;

  return (
    <span
      className="inline-flex items-center gap-0.5"
      data-testid={isHyper ? 'hyper-action-badge' : 'modifier-action-badge'}
      title={
        isHyper
          ? 'Hyper Key (all four modifiers). Bind apps in Karabiner/Raycast — macOS shortcut-recording sheets drop modifiers and won\'t see this binding.'
          : `Modifier-only: holds ${mods.join('+')}`
      }
    >
      {mods.map((m, i) => (
        <React.Fragment key={`m-${i}`}>
          <kbd
            className={cn(
              sizeClasses[size],
              'inline-flex items-center justify-center bg-muted text-muted-foreground font-mono border border-border',
            )}
            style={{ boxShadow: '0 1px 0 0 hsl(var(--border))' }}
          >
            {modLabels[m]}
          </kbd>
          {i < mods.length - 1 && (
            <span className="text-muted-foreground text-xs select-none" aria-hidden="true">
              +
            </span>
          )}
        </React.Fragment>
      ))}
      {isHyper && (
        <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Hyper
        </span>
      )}
      {action.lazy && (
        <span
          className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground"
          title="Lazy modifier — only fires when chained with another key. Karabiner-only; AHK approximates."
        >
          lazy
        </span>
      )}
    </span>
  );
}
