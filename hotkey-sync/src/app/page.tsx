'use client';

import * as React from 'react';
import { PanelRightOpen, Keyboard } from 'lucide-react';
import { StepTracker } from '@/components/step-tracker';
import { OSToggle } from '@/components/os-toggle';
import { AppPicker } from '@/components/app-picker';
import { RuleSection } from '@/components/rule-section';
import { PresetsPanel } from '@/components/presets-panel';
import { MiniPreview } from '@/components/mini-preview';
import { CodePreview } from '@/components/code-preview';
import { DownloadPanel } from '@/components/download-panel';
import { ImportPanel } from '@/components/import-panel';
import { KeyboardSimulator } from '@/components/keyboard-simulator';
import { ConflictMatrixPanel } from '@/components/conflict-matrix-panel';
import { useURLConfigImport } from '@/lib/use-url-config-import';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useConfigStore } from '@/store/useConfigStore';

const SECTION_IDS = [
  'section-os',
  'section-apps',
  'section-rules',
  'section-presets',
  'section-preview',
  'section-power',
] as const;

type ActiveStep = 1 | 2 | 3 | 4 | 5 | 6;

function useActiveStep(): ActiveStep {
  const [activeStep, setActiveStep] = React.useState<ActiveStep>(1);

  React.useEffect(() => {
    const elements = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (elements.length === 0) return;

    const visibility = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibility.set(entry.target.id, entry.intersectionRatio);
        }
        let bestId: (typeof SECTION_IDS)[number] = SECTION_IDS[0];
        let bestRatio = -1;
        for (const id of SECTION_IDS) {
          const r = visibility.get(id) ?? 0;
          if (r > bestRatio) {
            bestRatio = r;
            bestId = id;
          }
        }
        const idx = SECTION_IDS.indexOf(bestId);
        if (idx >= 0) setActiveStep((idx + 1) as ActiveStep);
      },
      { threshold: [0.25, 0.5, 0.75] },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return activeStep;
}

export default function HomePage(): React.JSX.Element {
  const activeStep = useActiveStep();
  const selectedCount = useConfigStore((s) => s.selectedAppIds.length);
  const ruleCount = useConfigStore((s) => s.rules.length);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const urlImportStatus = useURLConfigImport();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {urlImportStatus.kind === 'applied' && (
        <div
          className="bg-primary/10 text-foreground text-xs py-2 px-4 text-center border-b"
          role="status"
        >
          Loaded shared config: <strong>{urlImportStatus.ruleCount}</strong> rule
          {urlImportStatus.ruleCount === 1 ? '' : 's'} applied from the URL.
        </div>
      )}
      {urlImportStatus.kind === 'failed' && (
        <div
          className="bg-destructive/10 text-destructive text-xs py-2 px-4 text-center border-b"
          role="alert"
        >
          Could not load shared config from URL: {urlImportStatus.reason}
        </div>
      )}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/80 backdrop-blur px-4 sm:px-8 py-3">
        <div className="flex items-center gap-2">
          <Keyboard className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold tracking-tight">HotkeySync</span>
        </div>
        <a
          href="https://github.com/"
          className="text-xs text-muted-foreground hover:text-foreground"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </header>

      <div className="flex flex-1 gap-6 px-4 sm:px-6 lg:px-8 py-6">
        <aside className="hidden md:flex w-[240px] shrink-0 flex-col gap-4 sticky top-[57px] self-start max-h-[calc(100vh-57px-1.5rem)]">
          <StepTracker activeStep={activeStep} />
          <div className="rounded-lg border bg-card p-3 text-xs space-y-1">
            <p className="text-muted-foreground">Apps selected</p>
            <p className="text-xl font-semibold">{selectedCount}</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-xs space-y-1">
            <p className="text-muted-foreground">Rules defined</p>
            <p className="text-xl font-semibold">{ruleCount}</p>
          </div>
        </aside>

        <main className="flex-1 min-w-0 space-y-12">
          <section id="section-os" className="scroll-mt-20">
            <h2 className="text-xl font-semibold mb-3">1 — Choose OS</h2>
            <OSToggle />
          </section>

          <section id="section-apps" className="scroll-mt-20">
            <h2 className="text-xl font-semibold mb-3">2 — Select Apps</h2>
            <AppPicker />
          </section>

          <section id="section-rules" className="scroll-mt-20">
            <h2 className="text-xl font-semibold mb-3">3 — Define Rules</h2>
            <RuleSection />
          </section>

          <section id="section-presets" className="scroll-mt-20">
            <h2 className="text-xl font-semibold mb-3">4 — Presets</h2>
            <PresetsPanel />
          </section>

          <section id="section-preview" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold">5 — Preview &amp; Download</h2>
            <CodePreview />
            <DownloadPanel />
          </section>

          <section id="section-power" className="scroll-mt-20 space-y-4">
            <h2 className="text-xl font-semibold">6 — Power Tools</h2>
            <p className="text-sm text-muted-foreground">
              Import an existing config, see exactly what your rules would do
              before you install anything, and audit cross-app conflicts.
            </p>
            <ImportPanel />
            <KeyboardSimulator />
            <ConflictMatrixPanel />
          </section>
        </main>

        <aside className="hidden xl:block w-[320px] shrink-0 sticky top-[57px] self-start max-h-[calc(100vh-57px-1.5rem)] overflow-hidden rounded-lg border bg-card p-4">
          <MiniPreview />
        </aside>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button
            variant="default"
            size="icon"
            aria-label="View rules and preview"
            className="xl:hidden fixed bottom-4 right-4 z-40 h-12 w-12 rounded-full shadow-lg"
          >
            <PanelRightOpen className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[340px] sm:max-w-[340px]">
          <SheetHeader>
            <SheetTitle>Your rules</SheetTitle>
            <SheetDescription>
              Quick summary of the rules in your current configuration.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 h-[calc(100%-2.5rem)]">
            <MiniPreview />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
