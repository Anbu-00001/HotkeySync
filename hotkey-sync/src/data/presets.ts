import type { HotkeyRule } from '@/types';

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
      { appId: 'google-chrome',   trigger: 'ctrl+p', action: 'ctrl+comma', description: 'Open Settings instead of Print' },
      { appId: 'mozilla-firefox', trigger: 'ctrl+p', action: 'ctrl+comma', description: 'Open Settings instead of Print' },
      { appId: 'microsoft-edge',  trigger: 'ctrl+p', action: 'ctrl+comma', description: 'Open Settings instead of Print' },
      { appId: 'slack',           trigger: 'ctrl+p', action: 'ctrl+comma', description: 'Open Preferences instead of Print' },
      { appId: 'notion',          trigger: 'ctrl+p', action: 'ctrl+comma', description: 'Open Settings instead of Print' },
    ],
  },
  {
    id: 'vim-arrows',
    name: 'Vim-style Arrow Keys',
    description: 'Adds Alt+H/J/K/L as arrow keys in editors',
    rules: [
      { appId: 'vs-code',  trigger: 'alt+h', action: 'left_arrow',  description: 'Move cursor left (Vim style)' },
      { appId: 'vs-code',  trigger: 'alt+j', action: 'down_arrow',  description: 'Move cursor down (Vim style)' },
      { appId: 'vs-code',  trigger: 'alt+k', action: 'up_arrow',    description: 'Move cursor up (Vim style)' },
      { appId: 'vs-code',  trigger: 'alt+l', action: 'right_arrow', description: 'Move cursor right (Vim style)' },
      { appId: 'obsidian', trigger: 'alt+h', action: 'left_arrow',  description: 'Move cursor left (Vim style)' },
      { appId: 'obsidian', trigger: 'alt+j', action: 'down_arrow',  description: 'Move cursor down (Vim style)' },
      { appId: 'obsidian', trigger: 'alt+k', action: 'up_arrow',    description: 'Move cursor up (Vim style)' },
      { appId: 'obsidian', trigger: 'alt+l', action: 'right_arrow', description: 'Move cursor right (Vim style)' },
    ],
  },
  {
    id: 'close-tab-not-window',
    name: 'Ctrl+W Closes Tab, Not Window',
    description: 'Prevents Ctrl+W from closing the entire app window',
    rules: [
      { appId: 'vs-code', trigger: 'ctrl+w', action: 'ctrl+shift+w', description: 'Redirect to Close Workspace instead of closing file' },
      { appId: 'slack',   trigger: 'ctrl+w', action: 'ctrl+shift+w', description: 'Redirect to Close Window, not quit app' },
      { appId: 'discord', trigger: 'ctrl+w', action: 'ctrl+shift+w', description: 'Redirect to avoid closing Discord window' },
    ],
  },
];
