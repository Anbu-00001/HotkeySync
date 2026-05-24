'use client';

import * as React from 'react';
import { Check, Lock } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { App } from '@/types';

interface AppCardProps {
  app: App;
  isSelected: boolean;
  onToggle: (appId: string) => void;
}

export function AppCard({
  app,
  isSelected,
  onToggle,
}: AppCardProps): React.JSX.Element {
  function activate(e: React.KeyboardEvent | React.MouseEvent) {
    if ('key' in e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
    }
    onToggle(app.id);
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="checkbox"
          aria-checked={isSelected}
          aria-label={`${app.name} — ${app.category}`}
          tabIndex={0}
          onClick={activate}
          onKeyDown={activate}
          className={cn(
            'group relative flex h-24 w-24 sm:h-24 sm:w-24 max-sm:h-20 max-sm:w-20 cursor-pointer select-none flex-col items-center justify-center gap-1 rounded-lg border bg-card p-2 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isSelected
              ? 'border-primary bg-primary/10 ring-2 ring-primary'
              : 'border-border hover:ring-1 hover:ring-border',
          )}
        >
          {isSelected ? (
            <span
              className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground"
              aria-hidden="true"
            >
              <Check className="h-3 w-3" />
            </span>
          ) : (
            <Badge
              variant="outline"
              className="absolute right-1 top-1 hidden text-[9px] font-normal group-hover:inline-flex"
            >
              {app.category}
            </Badge>
          )}
          {app.lockedShortcuts && (
            <span
              className="absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300"
              aria-label="No native shortcut customization"
              data-testid="locked-shortcuts-badge"
            >
              <Lock className="h-2.5 w-2.5" />
            </span>
          )}
          <span className="text-2xl leading-none" aria-hidden="true">
            {app.icon}
          </span>
          <span className="text-xs leading-tight text-center truncate w-full px-1">
            {app.name}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {app.name}
        {app.lockedShortcuts && (
          <span className="block text-xs text-muted-foreground mt-0.5">
            Locked: no native shortcut editor — HotkeySync is the only way to rebind.
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
