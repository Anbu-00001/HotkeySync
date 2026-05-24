import type { HotkeyRule } from '@/types';
import { TAP_HOLD_DEFAULT_TIMEOUT_MS } from '@/types';

export interface Preset {
  id: string;
  name: string;
  description: string;
  rules: HotkeyRule[];
}

export const PRESETS: Preset[] = [
  {
    id: 'standardise-print',
    name: 'Standardise Ctrl+P',
    description: 'Makes Ctrl+P open app preferences everywhere instead of Print',
    rules: [
      { kind: 'basic', appId: 'google-chrome',   trigger: 'ctrl+p', action: 'ctrl+comma', description: 'Open Settings instead of Print' },
      { kind: 'basic', appId: 'mozilla-firefox', trigger: 'ctrl+p', action: 'ctrl+comma', description: 'Open Settings instead of Print' },
      { kind: 'basic', appId: 'microsoft-edge',  trigger: 'ctrl+p', action: 'ctrl+comma', description: 'Open Settings instead of Print' },
      { kind: 'basic', appId: 'slack',           trigger: 'ctrl+p', action: 'ctrl+comma', description: 'Open Preferences instead of Print' },
      { kind: 'basic', appId: 'notion',          trigger: 'ctrl+p', action: 'ctrl+comma', description: 'Open Settings instead of Print' },
    ],
  },
  {
    id: 'vim-arrows',
    name: 'Vim-style Arrow Keys',
    description: 'Adds Alt+H/J/K/L as arrow keys in editors',
    rules: [
      { kind: 'basic', appId: 'vs-code',  trigger: 'alt+h', action: 'left_arrow',  description: 'Move cursor left (Vim style)' },
      { kind: 'basic', appId: 'vs-code',  trigger: 'alt+j', action: 'down_arrow',  description: 'Move cursor down (Vim style)' },
      { kind: 'basic', appId: 'vs-code',  trigger: 'alt+k', action: 'up_arrow',    description: 'Move cursor up (Vim style)' },
      { kind: 'basic', appId: 'vs-code',  trigger: 'alt+l', action: 'right_arrow', description: 'Move cursor right (Vim style)' },
      { kind: 'basic', appId: 'obsidian', trigger: 'alt+h', action: 'left_arrow',  description: 'Move cursor left (Vim style)' },
      { kind: 'basic', appId: 'obsidian', trigger: 'alt+j', action: 'down_arrow',  description: 'Move cursor down (Vim style)' },
      { kind: 'basic', appId: 'obsidian', trigger: 'alt+k', action: 'up_arrow',    description: 'Move cursor up (Vim style)' },
      { kind: 'basic', appId: 'obsidian', trigger: 'alt+l', action: 'right_arrow', description: 'Move cursor right (Vim style)' },
    ],
  },
  {
    id: 'close-tab-not-window',
    name: 'Ctrl+W Closes Tab, Not Window',
    description: 'Prevents Ctrl+W from closing the entire app window',
    rules: [
      { kind: 'basic', appId: 'vs-code', trigger: 'ctrl+w', action: 'ctrl+shift+w', description: 'Redirect to Close Workspace instead of closing file' },
      { kind: 'basic', appId: 'slack',   trigger: 'ctrl+w', action: 'ctrl+shift+w', description: 'Redirect to Close Window, not quit app' },
      { kind: 'basic', appId: 'discord', trigger: 'ctrl+w', action: 'ctrl+shift+w', description: 'Redirect to avoid closing Discord window' },
    ],
  },
  {
    id: 'browser-quit-safety',
    name: 'Browser Quit Safety',
    description:
      'Stops accidental quits in Firefox (Ctrl+Q) and Chrome (Ctrl+Shift+Q). Reddit + HN top-cited safety net.',
    rules: [
      { kind: 'disable', appId: 'mozilla-firefox', trigger: 'ctrl+q', description: 'Stop Firefox quitting' },
      { kind: 'disable', appId: 'google-chrome', trigger: 'ctrl+shift+q', description: 'Stop Chrome force-quitting' },
    ],
  },
  {
    id: 'office-safety',
    name: 'Office Safety',
    description:
      'Excel F1 → Esc (stop F1 opening Help on F2 mis-keys) + Outlook Ctrl+Enter disable (the New-Outlook-removed accidental-send safety net).',
    rules: [
      { kind: 'basic', appId: 'microsoft-excel', trigger: 'f1', action: 'escape', description: 'Stop F1 opening Help' },
      { kind: 'disable', appId: 'outlook', trigger: 'ctrl+return_or_enter', description: 'Stop Outlook auto-sending on Ctrl+Enter' },
    ],
  },
  {
    id: 'tap-hold-vscode-grave',
    name: 'Tap & Hold: Esc on tap, Toggle Terminal on hold',
    description:
      'Dual-role meta+` in VS Code — tap for Escape, hold to toggle the integrated terminal. Karabiner runs this natively; AHK emulates with a polling helper.',
    rules: [
      {
        kind: 'tap_hold',
        appId: 'vs-code',
        trigger: 'meta+grave_accent',
        tapAction: 'escape',
        holdAction: 'ctrl+grave_accent',
        tapTimeoutMs: TAP_HOLD_DEFAULT_TIMEOUT_MS,
        description: 'Tap → Esc, Hold → Ctrl+` (terminal)',
      },
    ],
  },
];
