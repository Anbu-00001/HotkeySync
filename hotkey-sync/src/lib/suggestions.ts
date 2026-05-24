/**
 * Individual rule suggestions surfaced based on the user's currently-selected
 * apps. Unlike presets (rule *packs* that get applied together), suggestions
 * are atomic recommendations — one trigger → one action with a short rationale.
 *
 * The engine filters to suggestions whose app is selected AND whose trigger
 * is not already bound on that app. Anything left over ranks first by tag
 * priority, then by app order.
 *
 * Adding a suggestion is a matter of dropping a new entry into the SUGGESTIONS
 * array below. They are hand-curated; this is the most opinionated layer of
 * the product. Each entry should reflect either:
 *   - a cross-app norm worth standardising (tag: 'standardise'),
 *   - a destructive-default that needs a safety net (tag: 'safety'),
 *   - a power-user combo the app already supports but doesn't advertise (tag: 'productivity'),
 *   - or vim-style navigation in editors that lack it natively (tag: 'vim').
 */
import type { HotkeyRule } from '@/types';

export type SuggestionTag =
  | 'standardise'
  | 'safety'
  | 'productivity'
  | 'vim';

export interface Suggestion {
  /** Stable id so React lists can key cleanly and the user can dismiss durably. */
  id: string;
  tag: SuggestionTag;
  /** One-sentence "why" — surfaced verbatim in the UI. */
  rationale: string;
  /** The rule that gets added when the user clicks Add. */
  rule: HotkeyRule;
}

const SUGGESTIONS: Suggestion[] = [
  // Browsers — standardise prefs.
  {
    id: 'chrome-prefs',
    tag: 'standardise',
    rationale:
      'Chrome opens Print on Ctrl+P; most desktop apps open Preferences. Aligning the two prevents muscle-memory mistakes.',
    rule: {
      kind: 'basic',
      appId: 'google-chrome',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
      description: 'Open Settings instead of Print',
    },
  },
  {
    id: 'firefox-prefs',
    tag: 'standardise',
    rationale:
      'Firefox uses Ctrl+P for Print, but Ctrl+, for Preferences matches Chrome, Slack, and most macOS apps.',
    rule: {
      kind: 'basic',
      appId: 'mozilla-firefox',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
      description: 'Open Preferences instead of Print',
    },
  },
  {
    id: 'edge-prefs',
    tag: 'standardise',
    rationale:
      'Edge inherits Ctrl+P=Print from Chromium. Make it open Settings instead, like every other app.',
    rule: {
      kind: 'basic',
      appId: 'microsoft-edge',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
      description: 'Open Settings instead of Print',
    },
  },
  // Safety — Ctrl+W disasters.
  {
    id: 'discord-close-tab',
    tag: 'safety',
    rationale:
      'Ctrl+W quits Discord entirely (no tabs to close). Remap to Ctrl+Shift+W so a typo costs at most a window.',
    rule: {
      kind: 'basic',
      appId: 'discord',
      trigger: 'ctrl+w',
      action: 'ctrl+shift+w',
      description: 'Close window, not quit Discord',
    },
  },
  {
    id: 'slack-close-tab',
    tag: 'safety',
    rationale:
      'Ctrl+W in Slack closes the whole workspace. Redirect to Ctrl+Shift+W to match browsers and avoid losing draft messages.',
    rule: {
      kind: 'basic',
      appId: 'slack',
      trigger: 'ctrl+w',
      action: 'ctrl+shift+w',
      description: 'Avoid accidentally closing Slack',
    },
  },
  // Productivity — surface command palettes.
  {
    id: 'vscode-palette-f1',
    tag: 'productivity',
    rationale:
      'VS Code exposes its command palette on F1 as well as Ctrl+Shift+P. Putting it on F1 frees Ctrl+Shift+P for app-specific overrides.',
    rule: {
      kind: 'basic',
      appId: 'vs-code',
      trigger: 'f1',
      action: 'ctrl+shift+p',
      description: 'Open command palette (F1 shortcut)',
    },
  },
  {
    id: 'cursor-palette-f1',
    tag: 'productivity',
    rationale:
      'Cursor inherits VS Code keybindings. Putting the command palette on F1 keeps your hands on the home row.',
    rule: {
      kind: 'basic',
      appId: 'cursor',
      trigger: 'f1',
      action: 'ctrl+shift+p',
      description: 'Open command palette (F1 shortcut)',
    },
  },
  // Vim navigation for editors that lack native vim mode.
  {
    id: 'sublime-vim-h',
    tag: 'vim',
    rationale:
      'Sublime Text has no native Vim mode. Alt+H/J/K/L gives you home-row arrow keys without leaving touch-typing position.',
    rule: {
      kind: 'basic',
      appId: 'sublime-text',
      trigger: 'alt+h',
      action: 'left_arrow',
      description: 'Vim-style left arrow',
    },
  },
  {
    id: 'sublime-vim-j',
    tag: 'vim',
    rationale:
      'Pair with Alt+H above — gives Sublime full HJKL arrow movement, the same convention vim and tmux already use.',
    rule: {
      kind: 'basic',
      appId: 'sublime-text',
      trigger: 'alt+j',
      action: 'down_arrow',
      description: 'Vim-style down arrow',
    },
  },
  {
    id: 'obsidian-vim-h',
    tag: 'vim',
    rationale:
      'Obsidian ships a Vim mode but only inside the editor; Alt+H/J/K/L works everywhere (sidebar, command palette).',
    rule: {
      kind: 'basic',
      appId: 'obsidian',
      trigger: 'alt+h',
      action: 'left_arrow',
      description: 'Vim-style left arrow (global, not just editor)',
    },
  },
  // Safety — F1 mis-key disasters.
  // Excel: F1 sits next to F2 (rename/edit cell) — countless mis-keys
  // open Help instead. Decade-old AHK forum thread documents the pain.
  // https://www.autohotkey.com/board/topic/91383-remap-f1-to-avoid-accidentally-starting-help-in-excel-globally/
  {
    id: 'excel-f1-esc',
    tag: 'safety',
    rationale:
      'F1 sits right next to F2 (rename / edit cell) — pressing it opens the Help pane mid-flow. Remap to Escape so a mis-key is a no-op.',
    rule: {
      kind: 'basic',
      appId: 'microsoft-excel',
      trigger: 'f1',
      action: 'escape',
      description: 'Stop F1 opening Help',
    },
  },
  // Photoshop F1 → New Layer is the most-imported rule in the Karabiner
  // community gallery (Photoshop_Windows_keymaps.json).
  {
    id: 'photoshop-f1-new-layer',
    tag: 'productivity',
    rationale:
      'F1 opens Help — interrupts flow. The Karabiner community remaps it to New Layer (Shift+Ctrl+Alt+N) since the shortcut chord is unergonomic.',
    rule: {
      kind: 'basic',
      appId: 'photoshop',
      trigger: 'f1',
      action: 'shift+ctrl+alt+n',
      description: 'Create New Layer instead of Help',
    },
  },
  // Safety — disable rules. Each one cites Reddit + HN/forum dual signal.
  // Firefox Ctrl+Q quit-trap: Reddit r/firefox/comments/7fehbb/ score 101
  // ("Please give us an option to disable ctrl-q!") + multi-year HN dogpile.
  // The single highest-signal disable candidate in the entire corpus.
  {
    id: 'firefox-disable-ctrl-q',
    tag: 'safety',
    rationale:
      'Ctrl+Q quits Firefox without confirmation — one slip and every tab is gone. Reddit dogpile (score 101+) wants this gone by default; we make it a no-op.',
    rule: {
      kind: 'disable',
      appId: 'mozilla-firefox',
      trigger: 'ctrl+q',
      description: 'Stop Firefox quitting',
    },
  },
  // Chrome Ctrl+Shift+Q (not plain Ctrl+Q) is the real complaint per Reddit
  // r/chrome/comments/39jdxt/ "I hate Ctrl-Shift-Q!". Plain Ctrl+Q on Chrome
  // PC is conditional; Ctrl+Shift+Q is hard-coded quit.
  {
    id: 'chrome-disable-ctrl-shift-q',
    tag: 'safety',
    rationale:
      'Ctrl+Shift+Q force-quits Chrome with no confirmation — the actual sharp edge users complain about, not plain Ctrl+Q. Disable it entirely.',
    rule: {
      kind: 'disable',
      appId: 'google-chrome',
      trigger: 'ctrl+shift+q',
      description: 'Stop Chrome force-quitting',
    },
  },
  // Cursor Cmd+Shift+L hijack: Cursor forum has multiple threads using
  // "hijacked" — it was VS Code's Select All Occurrences; Cursor reuses it
  // for AI chat. Disabling restores muscle memory.
  {
    id: 'cursor-disable-cmd-shift-l',
    tag: 'safety',
    rationale:
      'Cursor hijacks Cmd+Shift+L (was Select All Occurrences in VS Code) for the AI chat panel. Disable it so the chord stays available for a manual rebind.',
    rule: {
      kind: 'disable',
      appId: 'cursor',
      trigger: 'meta+shift+l',
      description: 'Free up Cmd+Shift+L from Cursor AI panel',
    },
  },
  // Cursor Ctrl+Shift+S sibling (surfaced by Twitter/X triangulation —
  // https://forum.cursor.com/t/keyboard-shortcut-ctrl-shift-s-hijacked-by-cursor/115798).
  {
    id: 'cursor-disable-ctrl-shift-s',
    tag: 'safety',
    rationale:
      'Cursor also rebinds Ctrl+Shift+S (Save As in VS Code) to its own action — disable to restore the universal Save As muscle memory.',
    rule: {
      kind: 'disable',
      appId: 'cursor',
      trigger: 'ctrl+shift+s',
      description: 'Free up Ctrl+Shift+S from Cursor',
    },
  },
  // Outlook Ctrl+Enter accidental-send: MS TechCommunity dogpile
  // (https://techcommunity.microsoft.com/discussions/outlookgeneral/disable-ctrlenter-to-send-mail/4040831)
  // — especially since New Outlook removed the native toggle.
  {
    id: 'outlook-disable-ctrl-enter',
    tag: 'safety',
    rationale:
      'Ctrl+Enter sends a draft instantly with no confirmation — New Outlook removed the toggle to disable it. We restore the safety net via a per-app no-op.',
    rule: {
      kind: 'disable',
      appId: 'outlook',
      trigger: 'ctrl+return_or_enter',
      description: 'Stop Outlook auto-sending on Ctrl+Enter',
    },
  },
  // Tap & Hold — single suggestion to lure users into trying it.
  {
    id: 'vscode-tap-hold-grave',
    tag: 'productivity',
    rationale:
      'Toggle the integrated terminal is a hold action you do dozens of times an hour. Tap → Escape gives you a one-key way to exit insert mode or close popups.',
    rule: {
      kind: 'tap_hold',
      appId: 'vs-code',
      trigger: 'meta+grave_accent',
      tapAction: 'escape',
      holdAction: 'ctrl+grave_accent',
      tapTimeoutMs: 200,
      description: 'Tap → Esc, Hold → Toggle Terminal',
    },
  },
];

const TAG_PRIORITY: Record<SuggestionTag, number> = {
  safety: 0,
  standardise: 1,
  productivity: 2,
  vim: 3,
};

/**
 * Return suggestions that:
 *   - target an app the user has selected,
 *   - bind a trigger NOT already in the user's rules for that app,
 *   - have NOT been dismissed.
 *
 * Sorted by tag priority then by stable id, so ordering is deterministic.
 */
export function suggestRules(args: {
  selectedAppIds: readonly string[];
  existingRules: readonly HotkeyRule[];
  dismissedIds?: ReadonlySet<string>;
}): Suggestion[] {
  const { selectedAppIds, existingRules, dismissedIds } = args;
  const selectedSet = new Set(selectedAppIds);
  // Existing rules indexed by `${appId}::${trigger}` for O(1) lookup.
  const existingKeys = new Set(
    existingRules.map((r) => `${r.appId}::${r.trigger}`),
  );

  const matches: Suggestion[] = [];
  for (const s of SUGGESTIONS) {
    if (!selectedSet.has(s.rule.appId)) continue;
    if (existingKeys.has(`${s.rule.appId}::${s.rule.trigger}`)) continue;
    if (dismissedIds && dismissedIds.has(s.id)) continue;
    matches.push(s);
  }

  matches.sort((a, b) => {
    const tagDiff = TAG_PRIORITY[a.tag] - TAG_PRIORITY[b.tag];
    if (tagDiff !== 0) return tagDiff;
    return a.id.localeCompare(b.id);
  });
  return matches;
}

/** Total catalogue size — exposed for tests that want to assert coverage. */
export const SUGGESTIONS_COUNT = SUGGESTIONS.length;

/** Read-only access for tests. */
export function allSuggestions(): readonly Suggestion[] {
  return SUGGESTIONS;
}
