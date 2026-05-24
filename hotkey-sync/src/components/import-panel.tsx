'use client';

import * as React from 'react';
import {
  Upload,
  FileWarning,
  CheckCircle2,
  FileCode,
  Globe,
  Loader2,
} from 'lucide-react';
import { useConfigStore } from '@/store/useConfigStore';
import { parseAHK, type AHKImportResult } from '@/lib/import/ahk-parser';
import {
  parseKarabinerJSON,
  type KarabinerImportResult,
} from '@/lib/import/karabiner-parser';
import { fetchGalleryURL } from '@/lib/import/gallery-fetch';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

type Source = 'ahk' | 'karabiner';

interface ParsedPreview {
  source: Source;
  result: AHKImportResult | KarabinerImportResult;
  /** True when parsing produced anything we can import. */
  hasRules: boolean;
}

export function ImportPanel(): React.JSX.Element {
  const replaceConfig = useConfigStore((s) => s.replaceConfig);
  const [source, setSource] = React.useState<Source>('ahk');
  const [text, setText] = React.useState('');
  const [preview, setPreview] = React.useState<ParsedPreview | null>(null);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [galleryURL, setGalleryURL] = React.useState('');
  const [galleryStatus, setGalleryStatus] = React.useState<
    | { state: 'idle' }
    | { state: 'fetching' }
    | { state: 'error'; message: string }
    | { state: 'success'; fetchedUrl: string; wasDeepLink: boolean }
  >({ state: 'idle' });

  const handleParse = () => {
    setParseError(null);
    if (text.trim().length === 0) {
      setParseError('Paste an AHK script or Karabiner JSON first.');
      setPreview(null);
      return;
    }
    if (source === 'ahk') {
      const result = parseAHK(text);
      setPreview({ source, result, hasRules: result.rules.length > 0 });
      return;
    }
    const outcome = parseKarabinerJSON(text);
    if (!outcome.ok) {
      setParseError(`${outcome.error.kind}: ${outcome.error.message}`);
      setPreview(null);
      return;
    }
    setPreview({
      source,
      result: outcome.result,
      hasRules: outcome.result.rules.length > 0,
    });
  };

  const handleApply = () => {
    if (!preview || !preview.hasRules) return;
    const result = preview.result;
    replaceConfig({
      os: result.os,
      selectedAppIds: result.selectedAppIds,
      rules: result.rules,
    });
    // Keep the preview visible so the user knows what just got applied.
  };

  const handleFetchGallery = async () => {
    setGalleryStatus({ state: 'fetching' });
    setParseError(null);
    const outcome = await fetchGalleryURL(galleryURL);
    if (!outcome.ok) {
      setGalleryStatus({ state: 'error', message: outcome.error });
      return;
    }
    setGalleryStatus({
      state: 'success',
      fetchedUrl: outcome.fetchedUrl,
      wasDeepLink: outcome.wasDeepLink,
    });
    setSource('karabiner');
    setText(outcome.json);
    // Auto-parse so the user sees the preview without a second click.
    const parsed = parseKarabinerJSON(outcome.json);
    if (!parsed.ok) {
      setParseError(`${parsed.error.kind}: ${parsed.error.message}`);
      setPreview(null);
      return;
    }
    setPreview({
      source: 'karabiner',
      result: parsed.result,
      hasRules: parsed.result.rules.length > 0,
    });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
    setParseError(null);
    setPreview(null);
    // Auto-pick source from extension when possible.
    if (file.name.toLowerCase().endsWith('.json')) setSource('karabiner');
    else if (file.name.toLowerCase().endsWith('.ahk')) setSource('ahk');
  };

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <FileCode className="h-5 w-5 text-primary mt-0.5" />
        <div className="flex-1">
          <h3 className="text-base font-semibold">Import an existing config</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Paste an AutoHotkey v2 script or Karabiner-Elements JSON. Round-trip
            of HotkeySync-generated files is exact; hand-written files import
            best-effort with warnings.
          </p>
        </div>
      </div>

      <Tabs value={source} onValueChange={(v) => setSource(v as Source)}>
        <TabsList>
          <TabsTrigger value="ahk">AutoHotkey (.ahk)</TabsTrigger>
          <TabsTrigger value="karabiner">Karabiner (.json)</TabsTrigger>
        </TabsList>
        <TabsContent value="ahk" className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Expected pattern: <code className="font-mono">#HotIf WinActive(&quot;ahk_exe X.exe&quot;)</code>{' '}
            blocks containing <code className="font-mono">^p:: Send(&quot;^,&quot;)</code> lines.
          </p>
        </TabsContent>
        <TabsContent value="karabiner" className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Standard <code className="font-mono">complex_modifications</code> JSON. Only{' '}
            <code className="font-mono">type: &quot;basic&quot;</code> manipulators with a{' '}
            <code className="font-mono">frontmost_application_if</code> condition are imported.
          </p>
          <div className="rounded-md border border-dashed bg-muted/20 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Globe className="h-3.5 w-3.5 text-primary" />
              Import from the Karabiner community gallery
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Paste a <code className="font-mono">karabiner://…?url=…</code>{' '}
              deep-link from{' '}
              <span className="font-mono">ke-complex-modifications.pqrs.org</span>{' '}
              or a direct{' '}
              <span className="font-mono">raw.githubusercontent.com</span> JSON URL.
              We fetch it client-side and run it through the same Karabiner parser.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={galleryURL}
                onChange={(e) => {
                  setGalleryURL(e.target.value);
                  if (galleryStatus.state !== 'idle')
                    setGalleryStatus({ state: 'idle' });
                }}
                spellCheck={false}
                placeholder="karabiner://… or https://raw.githubusercontent.com/…/foo.json"
                aria-label="Karabiner gallery URL"
                className="flex-1 min-w-[260px] rounded-md border bg-background px-3 py-1.5 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                onClick={handleFetchGallery}
                disabled={
                  galleryStatus.state === 'fetching' ||
                  galleryURL.trim().length === 0
                }
                aria-disabled={
                  galleryStatus.state === 'fetching' ||
                  galleryURL.trim().length === 0
                }
                variant="secondary"
                size="sm"
              >
                {galleryStatus.state === 'fetching' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Globe className="h-4 w-4" />
                )}
                Fetch
              </Button>
            </div>
            {galleryStatus.state === 'error' && (
              <p className="text-[11px] text-destructive">
                {galleryStatus.message}
              </p>
            )}
            {galleryStatus.state === 'success' && (
              <p className="text-[11px] text-green-700 dark:text-green-400">
                Fetched{' '}
                <span className="font-mono break-all">
                  {galleryStatus.fetchedUrl}
                </span>
                {galleryStatus.wasDeepLink &&
                  ' (extracted from karabiner:// deep-link)'}
                . Preview below.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <div className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder={
            source === 'ahk'
              ? '#Requires AutoHotkey v2.0+\n#HotIf WinActive("ahk_exe chrome.exe")\n^p:: Send("^,")\n#HotIf'
              : '{ "title": "...", "rules": [ ... ] }'
          }
          className="w-full h-40 rounded-md border bg-background p-3 font-mono text-xs resize-vertical focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={
            source === 'ahk' ? 'AutoHotkey source' : 'Karabiner JSON source'
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleParse} variant="secondary">
            <Upload className="h-4 w-4" />
            Parse
          </Button>
          <label className="inline-flex items-center gap-2 text-xs cursor-pointer rounded-md border px-3 py-1.5 hover:bg-accent">
            Choose file…
            <input
              type="file"
              accept=".ahk,.json,text/plain,application/json"
              onChange={handleFile}
              className="hidden"
            />
          </label>
          {parseError && (
            <span className="text-xs text-destructive">{parseError}</span>
          )}
        </div>
      </div>

      {preview && (
        <ImportPreview
          preview={preview}
          onApply={handleApply}
          disableApply={!preview.hasRules}
        />
      )}
    </div>
  );
}

interface ImportPreviewProps {
  preview: ParsedPreview;
  onApply: () => void;
  disableApply: boolean;
}

function ImportPreview({
  preview,
  onApply,
  disableApply,
}: ImportPreviewProps): React.JSX.Element {
  const { result } = preview;
  const warnings =
    'warnings' in result ? result.warnings : [];

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          {preview.hasRules ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <FileWarning className="h-4 w-4 text-amber-600" />
          )}
          <span>
            {result.rules.length} rule{result.rules.length === 1 ? '' : 's'} parsed
            across {result.selectedAppIds.length} app
            {result.selectedAppIds.length === 1 ? '' : 's'} (target OS:{' '}
            <strong>{result.os === 'mac' ? 'macOS' : 'Windows'}</strong>)
          </span>
        </div>
        <Button
          onClick={onApply}
          disabled={disableApply}
          aria-disabled={disableApply}
          variant="default"
          size="sm"
        >
          Replace config with import
        </Button>
      </div>

      {warnings.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-amber-700 dark:text-amber-400">
            {warnings.length} warning{warnings.length === 1 ? '' : 's'} — click
            to expand
          </summary>
          <ul className="mt-2 space-y-1 list-disc pl-5">
            {warnings.slice(0, 20).map((w, i) => (
              <li key={i} className="text-muted-foreground">
                {'line' in w ? (
                  <>
                    <span className="font-mono">line {w.line}</span> — {w.reason}
                  </>
                ) : (
                  <>
                    <span className="font-mono">{w.rulePath}</span> — {w.reason}
                  </>
                )}
              </li>
            ))}
            {warnings.length > 20 && (
              <li className="text-muted-foreground italic">
                …and {warnings.length - 20} more.
              </li>
            )}
          </ul>
        </details>
      )}

      {result.rules.length > 0 && (
        <details className="text-xs" open>
          <summary className="cursor-pointer">
            Preview {result.rules.length} rule
            {result.rules.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 space-y-1 font-mono">
            {result.rules.slice(0, 30).map((r, i) => (
              <li key={i} className="text-muted-foreground">
                <strong>{r.appId}</strong>: {r.trigger} →{' '}
                {r.kind === 'basic'
                  ? r.action
                  : r.kind === 'tap_hold'
                    ? `${r.tapAction} (tap) / ${r.holdAction} (hold @${r.tapTimeoutMs}ms)`
                    : '(disabled)'}{' '}
                {r.description && (
                  <span className={cn('text-foreground/60')}>({r.description})</span>
                )}
              </li>
            ))}
            {result.rules.length > 30 && (
              <li className="italic">…and {result.rules.length - 30} more.</li>
            )}
          </ul>
        </details>
      )}
    </div>
  );
}
