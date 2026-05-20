export type OS = 'windows' | 'mac';

export type AppCategory =
  | 'Browsers'
  | 'Editors'
  | 'Productivity'
  | 'Communication'
  | 'Media';

export interface App {
  id: string;
  name: string;
  exeName: string;
  bundleId: string;
  category: AppCategory;
  icon: string;
}

export interface HotkeyRule {
  appId: string;
  trigger: string;
  action: string;
  description: string;
}

export interface Config {
  os: OS;
  rules: HotkeyRule[];
}
