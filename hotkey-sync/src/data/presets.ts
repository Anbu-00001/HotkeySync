import type { HotkeyRule } from '@/types';
import { TAP_HOLD_DEFAULT_TIMEOUT_MS, GLOBAL_APP_ID } from '@/types';

/**
 * Canonical exclusion list for global rules. Derived from the Karabiner gallery
 * + GitHub dotfile survey (see project_global_rules_research.md). When a user
 * opts into a global Caps Lock / Cmd+Space rule, we pre-fill these exceptions
 * so terminals, screen share, and modal editors don't unexpectedly break.
 *
 * Only ids that exist in apps.json are listed — the generator skips any unknown
 * ids defensively, so a future catalogue expansion can add more (Parallels,
 * MS Remote Desktop, Steam) without touching this constant.
 */
export const DEFAULT_GLOBAL_EXCEPTIONS: readonly string[] = [
  // Terminals — power users want default OS keystroke handling here.
  'iterm2',
  'apple-terminal',
  'windows-terminal',
  'alacritty',
  'warp',
  // Screen share — Zoom/Teams keystroke handling during screen-share is fragile.
  'zoom',
  'microsoft-teams',
  // Modal editors — Xcode in particular has its own remap layer.
  'xcode',
];

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
    id: 'caps-lock-universal',
    name: 'Caps Lock = Esc (tap) / Ctrl (hold)',
    description:
      'The full canonical rule (Wave 2.6, formerly the 80% Esc-only variant): tap Caps Lock to fire Escape, hold to act as Left Ctrl. Karabiner runs this natively (`lazy: true` suppresses raw modifier-down). AHK emulates via paired down/up handlers — fast typing rolls can mis-fire there; the lint surfaces the caveat. Pre-excluded in terminals, screen share, and Xcode.',
    rules: [
      {
        kind: 'tap_hold',
        appId: GLOBAL_APP_ID,
        trigger: 'caps_lock',
        tapAction: 'escape',
        holdAction: { kind: 'modifier', modifiers: ['ctrl'], lazy: true },
        tapTimeoutMs: TAP_HOLD_DEFAULT_TIMEOUT_MS,
        description: 'Caps Lock → tap Esc / hold Ctrl',
        exceptApps: DEFAULT_GLOBAL_EXCEPTIONS,
      },
    ],
  },
  {
    id: 'caps-lock-hyper-key',
    name: 'Caps Lock = Hyper (Cmd+Ctrl+Alt+Shift)',
    description:
      'Karabiner gallery\'s most-imported rule. Tap Caps Lock for Escape; hold to act as the "Hyper Key" — a chord of all four modifiers that no real shortcut uses. Bind Hyper+letter combos in Karabiner/Raycast for app launching (macOS System Settings drops the modifier bundle on recording). Pre-excluded in terminals, screen share, and Xcode.',
    rules: [
      {
        kind: 'tap_hold',
        appId: GLOBAL_APP_ID,
        trigger: 'caps_lock',
        tapAction: 'escape',
        holdAction: {
          kind: 'modifier',
          modifiers: ['ctrl', 'shift', 'alt', 'meta'],
          lazy: true,
        },
        tapTimeoutMs: TAP_HOLD_DEFAULT_TIMEOUT_MS,
        description: 'Caps Lock → tap Esc / hold Hyper (⌘⌃⌥⇧)',
        exceptApps: DEFAULT_GLOBAL_EXCEPTIONS,
      },
    ],
  },
  {
    id: 'mac-launcher-conflict',
    name: 'Free Cmd+Space for Alfred / Raycast (macOS)',
    description:
      'Disables the macOS Cmd+Space binding so Alfred or Raycast can claim it. Karabiner score 353 in our research (single biggest disable signal). Pre-excluded in terminals + screen share.',
    rules: [
      {
        kind: 'disable',
        appId: GLOBAL_APP_ID,
        trigger: 'meta+space',
        description: 'Stop Spotlight stealing Cmd+Space',
        exceptApps: DEFAULT_GLOBAL_EXCEPTIONS,
      },
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
  {
    id: 'caps-lock-vim-arrows-oneshot',
    name: 'Caps Lock Vim Arrows — One-Shot',
    description:
      'Wave 2.8 one-shot variant: TAP Caps Lock to arm the vim-arrows layer, then press H/J/K/L once to fire and auto-disarm. Tap Escape to cancel. Karabiner runs this natively via set_variable + per-child clear; AHK approximates with a global flag + #HotIf block (AHK012 lint surfaces the flag-leak caveat). Best for users who hate the "I have to hold Caps the whole time" friction of the hold variant.',
    rules: [
      {
        kind: 'layer',
        appId: GLOBAL_APP_ID,
        trigger: 'caps_lock',
        layerName: 'vim-arrows-os',
        mode: 'oneshot',
        cancelKeys: ['escape'],
        description: 'Tap Caps Lock to arm vim arrow layer (one-shot)',
        exceptApps: DEFAULT_GLOBAL_EXCEPTIONS,
      },
      {
        kind: 'basic',
        appId: GLOBAL_APP_ID,
        trigger: 'h',
        action: 'left_arrow',
        layerName: 'vim-arrows-os',
        description: 'Caps tap then H → Left',
        exceptApps: DEFAULT_GLOBAL_EXCEPTIONS,
      },
      {
        kind: 'basic',
        appId: GLOBAL_APP_ID,
        trigger: 'j',
        action: 'down_arrow',
        layerName: 'vim-arrows-os',
        description: 'Caps tap then J → Down',
        exceptApps: DEFAULT_GLOBAL_EXCEPTIONS,
      },
      {
        kind: 'basic',
        appId: GLOBAL_APP_ID,
        trigger: 'k',
        action: 'up_arrow',
        layerName: 'vim-arrows-os',
        description: 'Caps tap then K → Up',
        exceptApps: DEFAULT_GLOBAL_EXCEPTIONS,
      },
      {
        kind: 'basic',
        appId: GLOBAL_APP_ID,
        trigger: 'l',
        action: 'right_arrow',
        layerName: 'vim-arrows-os',
        description: 'Caps tap then L → Right',
        exceptApps: DEFAULT_GLOBAL_EXCEPTIONS,
      },
    ],
  },
  {
    id: 'caps-lock-vim-arrows',
    name: 'Caps Lock Vim Arrows Layer',
    description:
      'Wave 2.7 Hyper Layer: holding Caps Lock turns H / J / K / L into Left / Down / Up / Right globally. Karabiner runs this natively via set_variable + variable_if; AHK approximates with a global flag + #HotIf block and a 1s SetTimer watchdog (the lint surfaces the focus-loss caveat). Pre-excluded in terminals + screen share + Xcode.',
    rules: [
      {
        kind: 'layer',
        appId: GLOBAL_APP_ID,
        trigger: 'caps_lock',
        layerName: 'vim-arrows',
        mode: 'hold',
        description: 'Caps Lock activates Vim arrow layer',
        exceptApps: DEFAULT_GLOBAL_EXCEPTIONS,
      },
      {
        kind: 'basic',
        appId: GLOBAL_APP_ID,
        trigger: 'h',
        action: 'left_arrow',
        layerName: 'vim-arrows',
        description: 'Caps+H → Left',
        exceptApps: DEFAULT_GLOBAL_EXCEPTIONS,
      },
      {
        kind: 'basic',
        appId: GLOBAL_APP_ID,
        trigger: 'j',
        action: 'down_arrow',
        layerName: 'vim-arrows',
        description: 'Caps+J → Down',
        exceptApps: DEFAULT_GLOBAL_EXCEPTIONS,
      },
      {
        kind: 'basic',
        appId: GLOBAL_APP_ID,
        trigger: 'k',
        action: 'up_arrow',
        layerName: 'vim-arrows',
        description: 'Caps+K → Up',
        exceptApps: DEFAULT_GLOBAL_EXCEPTIONS,
      },
      {
        kind: 'basic',
        appId: GLOBAL_APP_ID,
        trigger: 'l',
        action: 'right_arrow',
        layerName: 'vim-arrows',
        description: 'Caps+L → Right',
        exceptApps: DEFAULT_GLOBAL_EXCEPTIONS,
      },
    ],
  },
];
