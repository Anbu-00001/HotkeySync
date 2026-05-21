'use client';

import * as React from 'react';
import { saveAs } from 'file-saver';
import {
  Download,
  CheckCircle2,
  ExternalLink,
  CircleDot,
} from 'lucide-react';
import { useConfigStore } from '@/store/useConfigStore';
import { generateAHK } from '@/lib/generators/ahk';
import { generateKarabiner } from '@/lib/generators/karabiner';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { OS } from '@/types';
import { cn } from '@/lib/utils';

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

function downloadForOS(os: OS, rules: { appId: string; trigger: string; action: string; description: string }[]) {
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

  const handleDownload = () => {
    if (disabled) return;
    downloadForOS(os, rules);
    setJustDownloaded(true);
    window.setTimeout(() => setJustDownloaded(false), 2000);
  };

  const downloadButton = (
    <Button
      onClick={handleDownload}
      disabled={disabled}
      aria-disabled={disabled}
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
        {disabled ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>{downloadButton}</span>
            </TooltipTrigger>
            <TooltipContent>Add at least one rule to download.</TooltipContent>
          </Tooltip>
        ) : (
          downloadButton
        )}
      </div>

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
