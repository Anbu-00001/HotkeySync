'use client';

import * as React from 'react';
import { Copy, Check, AlertCircle, FileCode2 } from 'lucide-react';
import { createHighlighter, type Highlighter } from 'shiki';
import { useConfigStore } from '@/store/useConfigStore';
import { generateAHK } from '@/lib/generators/ahk';
import { generateKarabiner } from '@/lib/generators/karabiner';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { OS } from '@/types';
import type { HotkeyRule } from '@/types';
import { cn } from '@/lib/utils';

type Tab = 'windows' | 'mac';

const LANGS = ['ini', 'json'] as const;
const THEMES = ['github-dark', 'github-light'] as const;

let highlighterPromise: Promise<Highlighter> | null = null;
function getSharedHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [...THEMES],
      langs: [...LANGS],
    });
  }
  return highlighterPromise;
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function usePrefersDark(): boolean {
  return React.useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', notify);
      return () => mq.removeEventListener('change', notify);
    },
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
    () => false,
  );
}

interface GeneratedSnapshot {
  ahk: string;
  karabiner: string;
}

function buildGenerated(os: OS, rules: HotkeyRule[]): GeneratedSnapshot {
  const ahk = generateAHK({ os, rules });
  const karabiner = JSON.stringify(generateKarabiner({ os, rules }), null, 2);
  return { ahk, karabiner };
}

type CopyState = 'idle' | 'copied' | 'unavailable';

export function CodePreview(): React.JSX.Element {
  const os = useConfigStore((s) => s.os);
  const rules = useConfigStore((s) => s.rules);
  const debouncedRules = useDebounced(rules, 300);

  const generated = React.useMemo(
    () => buildGenerated(os, debouncedRules),
    [os, debouncedRules],
  );

  // Tab follows the OS unless the user manually overrides it; the override resets
  // when the OS changes (by checking which OS it was tied to).
  const [userTab, setUserTab] = React.useState<{ tab: Tab; forOs: OS } | null>(null);
  const activeTab: Tab = userTab && userTab.forOs === os ? userTab.tab : os;
  const setActiveTab = (t: Tab) => setUserTab({ tab: t, forOs: os });

  const [highlighter, setHighlighter] = React.useState<Highlighter | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    getSharedHighlighter().then((h) => {
      if (!cancelled) setHighlighter(h);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isDark = usePrefersDark();
  const theme = isDark ? 'github-dark' : 'github-light';

  const activeCode = activeTab === 'windows' ? generated.ahk : generated.karabiner;
  const activeLang = activeTab === 'windows' ? 'ini' : 'json';
  const lineCount = activeCode === '' ? 0 : activeCode.split('\n').length;

  const highlightedHtml = React.useMemo(() => {
    if (!highlighter) return null;
    try {
      return highlighter.codeToHtml(activeCode, { lang: activeLang, theme });
    } catch {
      return null;
    }
  }, [highlighter, activeCode, activeLang, theme]);

  const [copyState, setCopyState] = React.useState<CopyState>('idle');
  const copy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setCopyState('unavailable');
      return;
    }
    try {
      await navigator.clipboard.writeText(activeCode);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('unavailable');
    }
  };

  if (rules.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <FileCode2 className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="text-base font-medium">Nothing to preview yet</p>
            <p className="text-sm text-muted-foreground">
              Add rules above to see your generated config file here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const ariaLabel =
    activeTab === 'windows'
      ? 'Generated AutoHotkey v2 script'
      : 'Generated Karabiner-Elements configuration';

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="windows">Windows (.ahk)</TabsTrigger>
            <TabsTrigger value="mac">macOS (.json)</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{lineCount} lines</span>
          {copyState === 'unavailable' ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Copy unavailable">
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy unavailable in this context.</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={copy}
              aria-label={copyState === 'copied' ? 'Copied' : 'Copy code'}
            >
              {copyState === 'copied' ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
        <TabsContent value="windows" className="m-0">
          <CodeBlock
            code={generated.ahk}
            lang="ini"
            html={
              activeTab === 'windows' && highlightedHtml ? highlightedHtml : null
            }
            isDark={isDark}
            ariaLabel="Generated AutoHotkey v2 script"
          />
        </TabsContent>
        <TabsContent value="mac" className="m-0">
          <CodeBlock
            code={generated.karabiner}
            lang="json"
            html={activeTab === 'mac' && highlightedHtml ? highlightedHtml : null}
            isDark={isDark}
            ariaLabel="Generated Karabiner-Elements configuration"
          />
        </TabsContent>
      </Tabs>

      <span className="sr-only" role="status" aria-live="polite">
        {copyState === 'copied' ? 'Copied to clipboard' : ''}
      </span>
      <span className="sr-only">{ariaLabel}</span>
    </div>
  );
}

interface CodeBlockProps {
  code: string;
  lang: string;
  html: string | null;
  isDark: boolean;
  ariaLabel: string;
}

function CodeBlock({ code, html, isDark, ariaLabel }: CodeBlockProps): React.JSX.Element {
  if (html) {
    return (
      <div
        className={cn(
          'max-h-[400px] overflow-auto text-xs [&_pre]:p-4 [&_pre]:m-0 [&_pre]:bg-transparent',
          isDark ? 'bg-zinc-950' : 'bg-zinc-50',
        )}
        tabIndex={0}
        role="region"
        aria-label={ariaLabel}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <pre
      className={cn(
        'max-h-[400px] overflow-auto m-0 p-4 text-xs font-mono whitespace-pre',
        isDark ? 'bg-zinc-950 text-zinc-200' : 'bg-zinc-50 text-zinc-800',
      )}
      tabIndex={0}
      aria-label={ariaLabel}
    >
      {code}
    </pre>
  );
}
