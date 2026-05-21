'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StepNumber = 1 | 2 | 3 | 4 | 5;

interface StepTrackerProps {
  activeStep: StepNumber;
}

interface StepDef {
  num: StepNumber;
  label: string;
}

const STEPS: readonly StepDef[] = [
  { num: 1, label: 'Choose OS' },
  { num: 2, label: 'Select Apps' },
  { num: 3, label: 'Define Rules' },
  { num: 4, label: 'Presets' },
  { num: 5, label: 'Preview & Download' },
] as const;

export function StepTracker({ activeStep }: StepTrackerProps): React.JSX.Element {
  return (
    <ol className="relative space-y-2" aria-label="Progress">
      {STEPS.map((step, i) => {
        const state: 'complete' | 'active' | 'upcoming' =
          step.num < activeStep ? 'complete' : step.num === activeStep ? 'active' : 'upcoming';
        const isLast = i === STEPS.length - 1;
        return (
          <li key={step.num} className="relative flex items-start gap-3 pb-2">
            {!isLast && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px',
                  state === 'complete' ? 'bg-primary/60' : 'bg-border',
                )}
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                state === 'active' &&
                  'bg-primary text-primary-foreground border-primary',
                state === 'complete' &&
                  'bg-primary text-primary-foreground border-primary',
                state === 'upcoming' &&
                  'bg-background text-muted-foreground border-border',
              )}
            >
              {state === 'complete' ? <Check className="h-4 w-4" /> : step.num}
            </span>
            <span
              className={cn(
                'pt-1.5 text-sm',
                state === 'active'
                  ? 'font-semibold text-foreground'
                  : state === 'complete'
                  ? 'text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
