'use client';

import * as React from 'react';
import { Monitor, Laptop } from 'lucide-react';
import { useConfigStore } from '@/store/useConfigStore';
import type { OS } from '@/types';
import { cn } from '@/lib/utils';

interface OptionMeta {
  id: OS;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  note: string;
}

const OPTIONS: readonly OptionMeta[] = [
  {
    id: 'windows',
    label: 'Windows',
    Icon: Monitor,
    note: 'Generates hotkeys.ahk for AutoHotkey v2',
  },
  {
    id: 'mac',
    label: 'macOS',
    Icon: Laptop,
    note: 'Generates hotkeys.json for Karabiner-Elements',
  },
] as const;

export function OSToggle(): React.JSX.Element {
  const os = useConfigStore((s) => s.os);
  const setOS = useConfigStore((s) => s.setOS);
  const groupRef = React.useRef<HTMLDivElement>(null);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next: OS = os === 'windows' ? 'mac' : 'windows';
    setOS(next);
    requestAnimationFrame(() => {
      const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="radio"]',
      );
      buttons?.forEach((b) => {
        if (b.dataset.os === next) b.focus();
      });
    });
  }

  const active = OPTIONS.find((o) => o.id === os) ?? OPTIONS[0];

  return (
    <div className="space-y-2">
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label="Operating system"
        onKeyDown={handleKeyDown}
        className="relative inline-flex items-center rounded-full border bg-muted p-1"
      >
        {OPTIONS.map((opt) => {
          const isActive = opt.id === os;
          const Icon = opt.Icon;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              data-os={opt.id}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setOS(opt.id)}
              className={cn(
                'relative z-10 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-200',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{active.note}</p>
    </div>
  );
}
