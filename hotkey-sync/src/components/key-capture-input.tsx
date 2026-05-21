'use client';

import * as React from 'react';
import { Lock, X } from 'lucide-react';
import {
  parseKeyCombo,
  serializeKeyCombo,
  type Modifier,
  type TriggerKey,
} from '@/lib/keys';
import { hotkeyRuleSchema } from '@/lib/schemas';
import { KeyBadge } from '@/components/key-badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface KeyCaptureInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidationError: (error: string | null) => void;
  placeholder: string;
  disabled?: boolean;
  'aria-label': string;
}

const CODE_TO_TRIGGER_KEY: Record<string, TriggerKey> = {
  KeyA: 'a', KeyB: 'b', KeyC: 'c', KeyD: 'd', KeyE: 'e', KeyF: 'f',
  KeyG: 'g', KeyH: 'h', KeyI: 'i', KeyJ: 'j', KeyK: 'k', KeyL: 'l',
  KeyM: 'm', KeyN: 'n', KeyO: 'o', KeyP: 'p', KeyQ: 'q', KeyR: 'r',
  KeyS: 's', KeyT: 't', KeyU: 'u', KeyV: 'v', KeyW: 'w', KeyX: 'x',
  KeyY: 'y', KeyZ: 'z',
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
  F1: 'f1', F2: 'f2', F3: 'f3', F4: 'f4', F5: 'f5', F6: 'f6',
  F7: 'f7', F8: 'f8', F9: 'f9', F10: 'f10', F11: 'f11', F12: 'f12',
  Comma: 'comma',
  Period: 'period',
  Slash: 'slash',
  Semicolon: 'semicolon',
  Quote: 'quote',
  BracketLeft: 'open_bracket',
  BracketRight: 'close_bracket',
  Backslash: 'backslash',
  Backquote: 'grave_accent',
  Minus: 'minus',
  Equal: 'equal',
  Space: 'space',
  Tab: 'tab',
  Escape: 'escape',
  Enter: 'return_or_enter',
  NumpadEnter: 'return_or_enter',
  Backspace: 'delete_or_backspace',
  Delete: 'delete_forward',
  ArrowUp: 'up_arrow',
  ArrowDown: 'down_arrow',
  ArrowLeft: 'left_arrow',
  ArrowRight: 'right_arrow',
  Home: 'home',
  End: 'end',
  PageUp: 'page_up',
  PageDown: 'page_down',
};

function modifiersFromEvent(e: KeyboardEvent): Modifier[] {
  const mods: Modifier[] = [];
  if (e.ctrlKey) mods.push('ctrl');
  if (e.shiftKey) mods.push('shift');
  if (e.altKey) mods.push('alt');
  if (e.metaKey) mods.push('meta');
  return mods.sort((a, b) => a.localeCompare(b));
}

export function KeyCaptureInput({
  value,
  onChange,
  onValidationError,
  placeholder,
  disabled = false,
  'aria-label': ariaLabel,
}: KeyCaptureInputProps): React.JSX.Element {
  const [isListening, setIsListening] = React.useState(false);
  const [draft, setDraft] = React.useState<string>('');
  const [liveModifiers, setLiveModifiers] = React.useState<Modifier[]>([]);
  const [liveKey, setLiveKey] = React.useState<TriggerKey | null>(null);
  const [hint, setHint] = React.useState<string>('');
  const hintId = React.useId();

  const finalize = React.useCallback(
    (capturedRaw: string): boolean => {
      const result = hotkeyRuleSchema.shape.trigger.safeParse(capturedRaw);
      if (!result.success) {
        const message = result.error.issues[0]?.message ?? 'Invalid key combo';
        onValidationError(message);
        setHint(message);
        return false;
      }
      onValidationError(null);
      onChange(capturedRaw);
      return true;
    },
    [onChange, onValidationError],
  );

  const closeOverlay = React.useCallback(() => {
    setIsListening(false);
    setDraft('');
    setLiveModifiers([]);
    setLiveKey(null);
    setHint('');
  }, []);

  React.useEffect(() => {
    if (!isListening) return;

    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === 'Escape') {
        closeOverlay();
        return;
      }

      const mods = modifiersFromEvent(e);
      setLiveModifiers(mods);

      const triggerKey = CODE_TO_TRIGGER_KEY[e.code];
      if (triggerKey === undefined) {
        setLiveKey(null);
        return;
      }
      setLiveKey(triggerKey);

      try {
        const candidate = serializeKeyCombo({ modifiers: mods, key: triggerKey });
        parseKeyCombo(candidate);
        setDraft(candidate);
        setHint('');
      } catch (err) {
        setHint(err instanceof Error ? err.message : 'Invalid key combo');
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();

      const released = CODE_TO_TRIGGER_KEY[e.code];
      if (released !== undefined && draft.length > 0) {
        const ok = finalize(draft);
        if (ok) closeOverlay();
        return;
      }
      const mods = modifiersFromEvent(e);
      setLiveModifiers(mods);
      if (mods.length === 0 && liveKey === null) {
        setHint('Add a key (not just modifiers).');
      }
    }

    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
    };
  }, [isListening, draft, liveKey, finalize, closeOverlay]);

  const handleIdleActivate = (e: React.KeyboardEvent | React.MouseEvent) => {
    if (disabled) return;
    if ('key' in e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
    }
    setIsListening(true);
  };

  const confirmDisabled = draft.length === 0;

  return (
    <>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-describedby={hintId}
        onClick={handleIdleActivate}
        onKeyDown={handleIdleActivate}
        aria-disabled={disabled}
        className={cn(
          'inline-flex min-h-9 min-w-32 items-center gap-2 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors',
          disabled
            ? 'cursor-not-allowed opacity-60'
            : 'cursor-pointer hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {value ? (
          <KeyBadge combo={value} size="sm" />
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        {disabled && <Lock className="ml-auto h-3 w-3 text-muted-foreground" />}
      </div>
      <span id={hintId} className="sr-only">
        Press Enter or Space to capture a key combination.
      </span>

      {isListening && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="Capture key combination"
        >
          <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg animate-fade-in-up">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold">Press your key combination</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Modifiers + a key. Release to confirm. Escape to cancel.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cancel"
                onClick={closeOverlay}
                className="rounded-sm text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex min-h-16 items-center justify-center rounded-md border bg-muted/40 p-4 mb-3">
              {draft ? (
                <KeyBadge combo={draft} />
              ) : liveModifiers.length > 0 ? (
                <div className="flex items-center gap-1 text-muted-foreground">
                  {liveModifiers.map((m, i) => (
                    <React.Fragment key={i}>
                      <kbd className="text-xs px-2 py-1 rounded-md bg-muted border border-border font-mono">
                        {m}
                      </kbd>
                      <span className="text-xs">+</span>
                    </React.Fragment>
                  ))}
                  <span className="text-xs italic">…</span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Waiting for keys…</span>
              )}
            </div>

            {hint && (
              <p className="text-xs text-destructive mb-3" role="alert">
                {hint}
              </p>
            )}

            <p className="text-[11px] text-muted-foreground mb-4 leading-snug">
              Note: some browser-reserved shortcuts (Ctrl+W, Ctrl+T, Ctrl+N) cannot
              be intercepted by web pages and will trigger the browser instead. Use
              an alternative trigger or capture this combo on the AHK / Karabiner
              side after install.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeOverlay}>
                Cancel
              </Button>
              <Button
                variant="default"
                disabled={confirmDisabled}
                onClick={() => {
                  if (finalize(draft)) closeOverlay();
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
