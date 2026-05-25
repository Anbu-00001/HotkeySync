/**
 * Structural lint for AutoHotkey v2 scripts that HotkeySync emits.
 *
 * Mirrors what `validateKarabinerOutput` does for the Mac side: gives us a
 * regression net + a user-facing "this download will work" badge for Windows.
 *
 * Scope of checks:
 *   - File-level invariants (#Requires directive, helper present iff used).
 *   - #HotIf nesting (balanced, no orphan hotkeys outside a block).
 *   - Hotkey line shape (LHS recognisable, RHS is Send(...) or TapHoldAction(...)).
 *   - Balanced parens/quotes inside the RHS call.
 *   - Duplicate trigger within the same #HotIf block.
 *
 * This is a lightweight structural check, not a full AHK parser. Anything
 * here that fails on output the generator produces is a generator bug; we
 * never silently emit a script that this lint rejects.
 */

export type AHKLintSeverity = 'error' | 'warning';

export interface AHKLintIssue {
  /** 1-based line number in the source. */
  line: number;
  code: string;
  severity: AHKLintSeverity;
  message: string;
}

export interface AHKLintResult {
  /** True iff there are zero error-severity issues. */
  ok: boolean;
  issues: AHKLintIssue[];
}

/** LHS pattern for an AHK v2 hotkey definition: optional modifier chars + a token + `::`. */
const HOTKEY_LINE_RX = /^([\^!+#<>*~$]*)([A-Za-z0-9_]+)::\s*(.*)$/;
/** RHS shape: `Send("…")` with the quoted argument captured. */
const SEND_RHS_RX = /^Send\("((?:[^"\\]|\\.)*)"\)\s*(?:;.*)?$/;
/** RHS shape: `TapHoldAction(<ms>, "<tap>", "<hold>")`. */
const TAP_HOLD_RHS_RX =
  /^TapHoldAction\(\s*(\d+)\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)\s*(?:;.*)?$/;
/** RHS shape: `return` — HotkeySync's canonical key-swallow / disable form. */
const DISABLE_RHS_RX = /^return\s*(?:;.*)?$/;
/**
 * Wave 2.7 — layer activator RHS: `{ global g_LayerXxx := true }` (down) or
 * `{ global g_LayerXxx := false }` (up partner; up partners' triggers contain
 * a space and don't match HOTKEY_LINE_RX, but we still recognise the RHS to
 * keep AHK005 quiet if someone hand-renames the trigger).
 *
 * Wave 2.8 — extended to accept the one-shot variants:
 *   - `{ global g_LayerXxx := true ; SetTimer(...) }` (activator + timeout)
 *   - `{ Send("...") ; global g_LayerXxx := false }` (child clears flag)
 */
const LAYER_ACTIVATOR_RHS_RX =
  /^\{\s*global\s+g_Layer\w+\s*:=\s*(?:true|false)(?:\s*;\s*SetTimer\([^)]*\))?\s*\}\s*(?:;.*)?$/;

/**
 * Wave 2.8 — one-shot child handler: `{ Send("...") ; global g_Layer := false }`.
 * Matches once per file to fire AHK012 (one-shot caveat).
 */
const ONESHOT_CHILD_RHS_RX =
  /^\{\s*Send\("(?:[^"\\]|\\.)*"\)\s*;\s*global\s+g_Layer\w+\s*:=\s*false\s*\}\s*(?:;.*)?$/;
/**
 * Wave 2.6 — detects a modifier-only Send RHS: `Send("{Blind}{LControl down}...")`.
 * Used to fire AHK010 once per file: AHK's emulation of "hold a modifier
 * down" via paired `*Trigger::Send` + `*Trigger up::` handlers is approximate;
 * fast typing rolls can misfire. Karabiner is native and doesn't have this caveat.
 */
const MODIFIER_DOWN_RHS_RX = /^Send\("\{Blind\}(?:\{[A-Za-z]+ down\})+"\)\s*(?:;.*)?$/;
/** Helper definition's first line (anchor for AHK006). */
const HELPER_DEF_RX = /^TapHoldAction\(timeoutMs,\s*tapAction,\s*holdAction\)\s*\{/;

export function lintAHK(source: string): AHKLintResult {
  const issues: AHKLintIssue[] = [];
  const push = (
    code: string,
    severity: AHKLintSeverity,
    line: number,
    message: string,
  ) => issues.push({ code, severity, line, message });

  const lines = source.split(/\r?\n/);

  // ── Pass 1: file-level scans (cheap, do them all in one walk). ─────────
  let requiresSeen = false;
  let helperDefCount = 0;
  let tapHoldUsed = false;
  // Wave 2.6 — fire AHK010 at most once per file at the first modifier-down line.
  let modifierActionWarned = false;
  // Wave 2.7 — fire AHK011 at most once per file at the first layer activator.
  let layerWarned = false;
  // Wave 2.8 — fire AHK012 at most once per file at the first one-shot child.
  let oneShotWarned = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = raw.trim();
    if (stripped.startsWith('#Requires AutoHotkey v2')) requiresSeen = true;
    if (HELPER_DEF_RX.test(stripped)) helperDefCount += 1;
    // `TapHoldAction(…` references that are NOT the definition.
    if (
      stripped.includes('TapHoldAction(') &&
      !HELPER_DEF_RX.test(stripped)
    ) {
      tapHoldUsed = true;
    }
  }

  if (!requiresSeen) {
    push(
      'AHK001',
      'error',
      1,
      'Missing `#Requires AutoHotkey v2.0+` directive — required for v2 syntax.',
    );
  }
  if (helperDefCount > 1) {
    push(
      'AHK006',
      'error',
      1,
      `TapHoldAction helper is defined ${helperDefCount} times — must appear at most once.`,
    );
  }
  if (tapHoldUsed && helperDefCount === 0) {
    push(
      'AHK006',
      'error',
      1,
      'TapHoldAction(…) is called but its helper definition is missing.',
    );
  }

  // ── Pass 2: per-line walk for hotkey + #HotIf structure. ───────────────
  let hotIfDepth = 0;
  let lastHotIfOpenLine = -1;
  let currentBlockTriggers = new Set<string>();
  let hotkeysInCurrentBlock = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i];
    const stripped = stripTrailingComment(raw).trim();
    if (stripped.length === 0) continue;
    if (stripped.startsWith(';')) continue;

    if (stripped.startsWith('#HotIf')) {
      const arg = stripped.slice('#HotIf'.length).trim();
      if (arg.length === 0) {
        // Closing directive.
        if (hotIfDepth === 0) {
          push(
            'AHK002',
            'error',
            lineNo,
            'Closing `#HotIf` with no matching opener.',
          );
        } else {
          if (hotkeysInCurrentBlock === 0) {
            push(
              'AHK009',
              'warning',
              lastHotIfOpenLine,
              'Empty `#HotIf` block — opens then closes with no hotkeys inside.',
            );
          }
          hotIfDepth = 0;
          currentBlockTriggers = new Set();
          hotkeysInCurrentBlock = 0;
        }
      } else {
        if (hotIfDepth > 0) {
          push(
            'AHK002',
            'error',
            lineNo,
            'Nested `#HotIf` opener without an intervening close — AHK v2 #HotIf is not stack-based.',
          );
        }
        hotIfDepth = 1;
        lastHotIfOpenLine = lineNo;
        currentBlockTriggers = new Set();
        hotkeysInCurrentBlock = 0;
      }
      continue;
    }

    const m = HOTKEY_LINE_RX.exec(stripped);
    if (!m) continue; // not a hotkey line — skip (helpers, directives, etc.)

    const trigger = m[1] + m[2];
    const rhs = m[3].trim();

    if (hotIfDepth === 0) {
      // A hotkey line outside #HotIf becomes global. Our generator never does
      // this — the only "loose" lines in our output are the helper function
      // body, which won't match HOTKEY_LINE_RX.
      push(
        'AHK004',
        'warning',
        lineNo,
        `Hotkey "${trigger}" defined outside any \`#HotIf\` block — becomes global.`,
      );
    } else {
      hotkeysInCurrentBlock += 1;
      if (currentBlockTriggers.has(trigger)) {
        push(
          'AHK007',
          'warning',
          lineNo,
          `Duplicate trigger "${trigger}" within the same \`#HotIf\` block — second binding overrides the first.`,
        );
      } else {
        currentBlockTriggers.add(trigger);
      }
    }

    // RHS must be Send(...), TapHoldAction(...), bare `return` (disable),
    // a Wave 2.7 layer activator, or a Wave 2.8 one-shot child handler.
    if (
      !SEND_RHS_RX.test(rhs) &&
      !TAP_HOLD_RHS_RX.test(rhs) &&
      !DISABLE_RHS_RX.test(rhs) &&
      !LAYER_ACTIVATOR_RHS_RX.test(rhs) &&
      !ONESHOT_CHILD_RHS_RX.test(rhs)
    ) {
      push(
        'AHK005',
        'error',
        lineNo,
        `Hotkey "${trigger}" has unrecognised RHS — expected Send("..."), TapHoldAction(<ms>, "<tap>", "<hold>"), "return" (disable), or a layer activator block. Got: ${truncate(rhs, 60)}`,
      );
      continue;
    }

    // disable form has no quoted arguments — skip the quote-balance check.
    if (DISABLE_RHS_RX.test(rhs)) {
      continue;
    }

    // Wave 2.7 — layer activator. Fire AHK011 once per file. AHK has no
    // native "layer" primitive; we approximate via a global flag plus a
    // SetTimer watchdog that clears the flag if the trigger isn't physically
    // down anymore. The watchdog window (1s) means a stuck layer can persist
    // briefly after OS-stole-focus / sleep / RDP-disconnect.
    if (LAYER_ACTIVATOR_RHS_RX.test(rhs)) {
      if (!layerWarned) {
        layerWarned = true;
        push(
          'AHK011',
          'warning',
          lineNo,
          `Hotkey "${trigger}" defines an emulated layer — AHK has no native equivalent of Karabiner's set_variable layer. For hold layers, a 1s SetTimer watchdog clears stuck flags; for one-shot layers, each child handler clears the flag itself. Both can briefly leak across focus-loss / sleep / RDP-disconnect.`,
        );
      }
      continue;
    }

    // Wave 2.8 — one-shot child handler. Fire AHK012 once per file.
    if (ONESHOT_CHILD_RHS_RX.test(rhs)) {
      if (!oneShotWarned) {
        oneShotWarned = true;
        push(
          'AHK012',
          'warning',
          lineNo,
          `Hotkey "${trigger}" is a one-shot layer child — AHK clears the layer flag at the end of the handler rather than via a native primitive. If focus changes between trigger-press and child-press (Alt-Tab, OS notification interrupt) the flag may persist; the lock-on-double-tap pattern (QMK ONESHOT_TAP_TOGGLE) is not yet supported on Windows.`,
        );
      }
      continue;
    }

    // Wave 2.6 — modifier-only Send (Caps Lock → Ctrl / Hyper). Fire AHK010
    // once per file. AHK has no native "hold this modifier down" primitive;
    // we approximate via paired *Trigger::/*Trigger up:: handlers, which can
    // misfire on rolling-press / fast typing. Karabiner is native.
    if (!modifierActionWarned && MODIFIER_DOWN_RHS_RX.test(rhs)) {
      modifierActionWarned = true;
      push(
        'AHK010',
        'warning',
        lineNo,
        `Hotkey "${trigger}" uses an emulated modifier-only action — AHK has no native equivalent of Karabiner's modifier-hold. Fast typing rolls can mis-fire; for high-frequency keys consider a per-app rule or the Karabiner-only variant.`,
      );
    }

    // Quick balanced-quote sanity (counts unescaped " marks). The regexes
    // above demand exactly two for Send and exactly four for TapHoldAction;
    // anything else means a stray ".
    const quoteCount = countUnescaped(rhs, '"');
    const expected = TAP_HOLD_RHS_RX.test(rhs) ? 4 : 2;
    if (quoteCount !== expected) {
      push(
        'AHK008',
        'error',
        lineNo,
        `Unbalanced double-quotes in RHS — expected ${expected}, got ${quoteCount}.`,
      );
    }
  }

  if (hotIfDepth > 0) {
    push(
      'AHK003',
      'error',
      lastHotIfOpenLine,
      '`#HotIf` block opened but never closed — every opener needs a matching empty `#HotIf`.',
    );
  }

  const hasError = issues.some((i) => i.severity === 'error');
  return { ok: !hasError, issues };
}

/**
 * Wave 2.8 — brace-depth-aware comment stripping. AHK uses `;` for line
 * comments, but `;` is ALSO a statement separator inside `{ ... ; ... }`
 * blocks (which we use to emit one-shot child handlers). The naive
 * `/\s+;.*$/` regex eats the separator and corrupts the RHS; this walker
 * only treats `;` as a comment when it appears at brace-depth 0 and outside
 * a string literal.
 */
function stripTrailingComment(raw: string): string {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inString) {
      if (c === '\\') {
        i += 1;
        continue;
      }
      if (c === stringChar) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      stringChar = c;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') depth = Math.max(0, depth - 1);
    else if (c === ';' && depth === 0) {
      // Only strip when preceded by whitespace (preserves identifiers/strings
      // that happen to contain `;` in edge cases). Matches the prior regex.
      if (i === 0 || /\s/.test(raw[i - 1])) {
        return raw.slice(0, i).replace(/\s+$/, '');
      }
    }
  }
  return raw;
}

function countUnescaped(str: string, char: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\\') {
      i += 1; // skip escaped next char
      continue;
    }
    if (str[i] === char) count += 1;
  }
  return count;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
