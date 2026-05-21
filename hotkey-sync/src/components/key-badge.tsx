'use client';

import * as React from 'react';
import { parseKeyCombo, type Modifier, type TriggerKey } from '@/lib/keys';
import { useConfigStore } from '@/store/useConfigStore';
import { cn } from '@/lib/utils';

interface KeyBadgeProps {
  combo: string;
  size?: 'sm' | 'md';
}

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

const SPECIAL_KEY_LABELS: Partial<Record<TriggerKey, string>> = {
  return_or_enter: 'Enter',
  delete_or_backspace: '⌫',
  delete_forward: 'Del',
  up_arrow: '↑',
  down_arrow: '↓',
  left_arrow: '←',
  right_arrow: '→',
  space: 'Space',
  escape: 'Esc',
  tab: 'Tab',
  home: 'Home',
  end: 'End',
  page_up: 'PgUp',
  page_down: 'PgDn',
  comma: ',',
  period: '.',
  slash: '/',
  semicolon: ';',
  quote: "'",
  open_bracket: '[',
  close_bracket: ']',
  backslash: '\\',
  grave_accent: '`',
  minus: '-',
  equal: '=',
};

function labelForKey(key: TriggerKey): string {
  const special = SPECIAL_KEY_LABELS[key];
  if (special !== undefined) return special;
  if (/^f\d+$/.test(key)) return key.toUpperCase();
  if (key.length === 1) return key.toUpperCase();
  return key;
}

const sizeClasses = {
  sm: 'text-[10px] px-1.5 py-0.5 rounded min-w-[1.25rem]',
  md: 'text-xs px-2 py-1 rounded-md min-w-[1.5rem]',
} as const;

export function KeyBadge({ combo, size = 'md' }: KeyBadgeProps): React.JSX.Element {
  const os = useConfigStore((s) => s.os);
  const modLabels = os === 'mac' ? MODIFIER_LABELS_MAC : MODIFIER_LABELS_WINDOWS;

  let parsed;
  try {
    parsed = parseKeyCombo(combo);
  } catch {
    return (
      <kbd
        className={cn(
          sizeClasses[size],
          'inline-flex items-center justify-center bg-muted text-muted-foreground font-mono border border-border',
        )}
        style={{ boxShadow: '0 1px 0 0 hsl(var(--border))' }}
      >
        {combo || '—'}
      </kbd>
    );
  }

  const items: React.ReactNode[] = [];
  parsed.modifiers.forEach((m, i) => {
    items.push(
      <kbd
        key={`m-${i}`}
        className={cn(
          sizeClasses[size],
          'inline-flex items-center justify-center bg-muted text-muted-foreground font-mono border border-border',
        )}
        style={{ boxShadow: '0 1px 0 0 hsl(var(--border))' }}
      >
        {modLabels[m]}
      </kbd>,
    );
    items.push(
      <span
        key={`p-${i}`}
        className="text-muted-foreground text-xs select-none"
        aria-hidden="true"
      >
        +
      </span>,
    );
  });
  items.push(
    <kbd
      key="k"
      className={cn(
        sizeClasses[size],
        'inline-flex items-center justify-center bg-muted text-muted-foreground font-mono border border-border',
      )}
      style={{ boxShadow: '0 1px 0 0 hsl(var(--border))' }}
    >
      {labelForKey(parsed.key)}
    </kbd>,
  );

  return <span className="inline-flex items-center gap-1">{items}</span>;
}
