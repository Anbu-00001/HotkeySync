'use client';

import * as React from 'react';
import { Zap, Check } from 'lucide-react';
import { useConfigStore } from '@/store/useConfigStore';
import { PRESETS, type Preset } from '@/data/presets';
import appsData from '@/data/apps.json';
import type { App } from '@/types';
import { Button } from '@/components/ui/button';

const APPS = appsData as App[];
const APP_BY_ID = new Map<string, App>(APPS.map((a) => [a.id, a]));

function PresetCard({
  preset,
  selectedAppIds,
  onApply,
}: {
  preset: Preset;
  selectedAppIds: string[];
  onApply: (preset: Preset) => void;
}): React.JSX.Element {
  const [justApplied, setJustApplied] = React.useState(false);

  const presetApps = React.useMemo(() => {
    const ids = new Set(preset.rules.map((r) => r.appId));
    return Array.from(ids)
      .map((id) => APP_BY_ID.get(id))
      .filter((a): a is App => a !== undefined);
  }, [preset]);

  const matchingApps = presetApps.filter((a) => selectedAppIds.includes(a.id));
  const visible = matchingApps.slice(0, 3);
  const more = matchingApps.length - visible.length;

  const disabled = selectedAppIds.length === 0;

  const handleApply = () => {
    onApply(preset);
    setJustApplied(true);
    window.setTimeout(() => setJustApplied(false), 1500);
  };

  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold">{preset.name}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
      </div>
      <div className="text-xs">
        {matchingApps.length === 0 ? (
          <span className="text-muted-foreground italic">
            None of your selected apps are in this preset
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {visible.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"
              >
                <span aria-hidden="true">{a.icon}</span>
                <span>{a.name}</span>
              </span>
            ))}
            {more > 0 && (
              <span className="text-muted-foreground">+{more} more</span>
            )}
          </div>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || matchingApps.length === 0}
        onClick={handleApply}
        className="self-start"
      >
        {justApplied ? (
          <>
            <Check className="h-4 w-4" />
            Applied
          </>
        ) : (
          'Apply'
        )}
      </Button>
    </div>
  );
}

export function PresetsPanel(): React.JSX.Element {
  const selectedAppIds = useConfigStore((s) => s.selectedAppIds);
  const applyPreset = useConfigStore((s) => s.applyPreset);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Zap className="h-5 w-5 text-primary" />
          Presets
        </h2>
        <p className="text-sm text-muted-foreground">
          Apply a curated rule pack. Only rules for your selected apps will be added.
        </p>
      </header>
      {selectedAppIds.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          Select apps first to use presets.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {PRESETS.map((p) => (
          <PresetCard
            key={p.id}
            preset={p}
            selectedAppIds={selectedAppIds}
            onApply={applyPreset}
          />
        ))}
      </div>
    </div>
  );
}
