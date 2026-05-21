import appsData from '@/data/apps.json';
import type { App, HotkeyRule } from '@/types';

const APPS = appsData as App[];

export function getAppById(appId: string): App | undefined {
  return APPS.find((a) => a.id === appId);
}

export function groupRulesByAppId(
  rules: HotkeyRule[],
): Map<string, HotkeyRule[]> {
  const out = new Map<string, HotkeyRule[]>();
  for (const rule of rules) {
    const bucket = out.get(rule.appId);
    if (bucket) bucket.push(rule);
    else out.set(rule.appId, [rule]);
  }
  return out;
}
