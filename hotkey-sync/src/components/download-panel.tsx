'use client';

import * as React from 'react';
import { saveAs } from 'file-saver';
import {
  Download,
  CheckCircle2,
  ExternalLink,
  CircleDot,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { useConfigStore } from '@/store/useConfigStore';
import { generateAHK } from '@/lib/generators/ahk';
import { generateKarabiner } from '@/lib/generators/karabiner';
import { validateKarabinerOutput } from '@/lib/generators/karabiner-schema';
import { lintAHK } from '@/lib/lint/ahk-lint';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { OS, HotkeyRule } from '@/types';
import { cn } from '@/lib/utils';
import { ShareButton } from '@/components/share-button';

interface InstructionStep {
  text: React.ReactNode;
}

const WINDOWS_STEPS: InstructionStep[] = [
  {
    text: (
      <>
        Install <strong>AutoHotkey v2</strong> (free) from{' '}
        <a
          href="https://www.autohotkey.com/download/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
        >
          autohotkey.com/download
          <ExternalLink className="h-3 w-3" />
        </a>
        .
      </>
    ),
  },
  {
    text: (
      <>
        Double-click <code className="rounded bg-muted px-1 font-mono text-xs">hotkeys.ahk</code>{' '}
        to run it. A tray icon appears.
      </>
    ),
  },
  {
    text: (
      <>
        To start automatically at login: press <kbd>Win</kbd>+<kbd>R</kbd>, type{' '}
        <code className="rounded bg-muted px-1 font-mono text-xs">shell:startup</code>, press
        Enter, then copy <code className="rounded bg-muted px-1 font-mono text-xs">hotkeys.ahk</code>{' '}
        into that folder.
      </>
    ),
  },
  {
    text: <>To edit rules, update them here and download a new file.</>,
  },
];

const MAC_STEPS: InstructionStep[] = [
  {
    text: (
      <>
        Install <strong>Karabiner-Elements</strong> (free) from{' '}
        <a
          href="https://karabiner-elements.pqrs.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
        >
          karabiner-elements.pqrs.org
          <ExternalLink className="h-3 w-3" />
        </a>
        .
      </>
    ),
  },
  {
    text: (
      <>
        Move <code className="rounded bg-muted px-1 font-mono text-xs">hotkeys.json</code> to:{' '}
        <code className="rounded bg-muted px-1 font-mono text-xs">
          ~/.config/karabiner/assets/complex_modifications/
        </code>
      </>
    ),
  },
  {
    text: (
      <>
        Open Karabiner-Elements → <strong>Complex Modifications</strong> →{' '}
        <strong>Add predefined rule</strong>.
      </>
    ),
  },
  {
    text: (
      <>
        Find <strong>&ldquo;HotkeySync — My Config&rdquo;</strong> and click{' '}
        <strong>Enable All</strong>.
      </>
    ),
  },
  {
    text: <>Grant Accessibility and Input Monitoring permissions if prompted.</>,
  },
];

function downloadForOS(os: OS, rules: HotkeyRule[]) {
  if (os === 'windows') {
    const ahk = generateAHK({ os, rules });
    const blob = new Blob([ahk], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, 'hotkeys.ahk');
  } else {
    const karabiner = generateKarabiner({ os, rules });
    const blob = new Blob([JSON.stringify(karabiner, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    saveAs(blob, 'hotkeys.json');
  }
}

export function DownloadPanel(): React.JSX.Element {
  const os = useConfigStore((s) => s.os);
  const rules = useConfigStore((s) => s.rules);
  const [justDownloaded, setJustDownloaded] = React.useState(false);

  const disabled = rules.length === 0;
  const filename = os === 'windows' ? 'hotkeys.ahk' : 'hotkeys.json';
  const heading =
    os === 'windows' ? 'How to use your hotkeys.ahk' : 'How to use your hotkeys.json';
  const steps = os === 'windows' ? WINDOWS_STEPS : MAC_STEPS;

  // For macOS, run the strict Karabiner schema validator against the
  // generated payload before allowing download. Catches any generator drift
  // before a user installs a broken config.
  const karabinerValidation = React.useMemo(() => {
    if (os !== 'mac' || rules.length === 0) return null;
    return validateKarabinerOutput(generateKarabiner({ os, rules }));
  }, [os, rules]);

  const ahkLint = React.useMemo(() => {
    if (os !== 'windows' || rules.length === 0) return null;
    return lintAHK(generateAHK({ os, rules }));
  }, [os, rules]);

  const handleDownload = () => {
    if (disabled) return;
    if (karabinerValidation && !karabinerValidation.ok) return;
    if (ahkLint && !ahkLint.ok) return;
    downloadForOS(os, rules);
    setJustDownloaded(true);
    window.setTimeout(() => setJustDownloaded(false), 2000);
  };

  const validationBlocks =
    (karabinerValidation !== null && !karabinerValidation.ok) ||
    (ahkLint !== null && !ahkLint.ok);
  const buttonDisabled = disabled || validationBlocks;
  const downloadButton = (
    <Button
      onClick={handleDownload}
      disabled={buttonDisabled}
      aria-disabled={buttonDisabled}
      className={cn(
        'min-w-56 transition-colors',
        justDownloaded && 'border border-green-500',
      )}
    >
      {justDownloaded ? (
        <>
          <CheckCircle2 className="h-4 w-4" />
          Downloaded!
        </>
      ) : (
        <>
          <Download className="h-4 w-4" />
          Download {filename}
        </>
      )}
    </Button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {buttonDisabled ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>{downloadButton}</span>
            </TooltipTrigger>
            <TooltipContent>
              {disabled
                ? 'Add at least one rule to download.'
                : os === 'mac'
                  ? 'Resolve Karabiner schema validation errors first.'
                  : 'Resolve AutoHotkey lint errors first.'}
            </TooltipContent>
          </Tooltip>
        ) : (
          downloadButton
        )}
        <ShareButton />
      </div>

      {karabinerValidation && (
        <div
          className={cn(
            'rounded-md border p-3 text-xs',
            karabinerValidation.ok
              ? 'border-green-500/40 bg-green-500/5 text-green-700 dark:text-green-400'
              : 'border-destructive/50 bg-destructive/5 text-destructive',
          )}
        >
          {karabinerValidation.ok ? (
            <p className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              Karabiner JSON passes strict schema validation.
            </p>
          ) : (
            <div>
              <p className="flex items-center gap-1.5 font-medium">
                <ShieldAlert className="h-3.5 w-3.5" />
                Generated Karabiner JSON FAILS schema validation. Download
                blocked.
              </p>
              <ul className="mt-1 list-disc pl-5">
                {karabinerValidation.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>
                    <span className="font-mono">{e.path || '(root)'}</span> — {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {ahkLint && (
        <div
          className={cn(
            'rounded-md border p-3 text-xs',
            ahkLint.ok
              ? 'border-green-500/40 bg-green-500/5 text-green-700 dark:text-green-400'
              : 'border-destructive/50 bg-destructive/5 text-destructive',
          )}
        >
          {ahkLint.ok ? (
            <p className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              AutoHotkey script passes structural lint
              {ahkLint.issues.length > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  ({ahkLint.issues.length} warning
                  {ahkLint.issues.length === 1 ? '' : 's'})
                </span>
              )}
              .
            </p>
          ) : (
            <div>
              <p className="flex items-center gap-1.5 font-medium">
                <ShieldAlert className="h-3.5 w-3.5" />
                Generated AutoHotkey script FAILS structural lint. Download
                blocked.
              </p>
              <ul className="mt-1 list-disc pl-5">
                {ahkLint.issues
                  .filter((i) => i.severity === 'error')
                  .slice(0, 5)
                  .map((i, idx) => (
                    <li key={idx}>
                      <span className="font-mono">
                        {i.code} (line {i.line})
                      </span>{' '}
                      — {i.message}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border bg-card p-5">
        <h3 className="text-base font-semibold mb-3">{heading}</h3>
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm leading-relaxed">
              <span
                aria-hidden="true"
                className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
              >
                <CircleDot className="h-3 w-3" />
              </span>
              <span className="flex-1">{step.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
