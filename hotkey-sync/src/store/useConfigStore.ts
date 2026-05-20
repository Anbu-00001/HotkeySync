import { create } from 'zustand';
import type { HotkeyRule, OS } from '@/types';
import { parseKeyCombo, serializeKeyCombo } from '@/lib/keys';
import type { Preset } from '@/data/presets';

interface ConfigState {
  os: OS;
  selectedAppIds: string[];
  rules: HotkeyRule[];
}

interface ConfigActions {
  setOS: (os: OS) => void;
  toggleAppSelection: (appId: string) => void;
  addRule: (rule: HotkeyRule) => void;
  updateRule: (
    appId: string,
    trigger: string,
    updates: Partial<Omit<HotkeyRule, 'appId' | 'trigger'>>,
  ) => void;
  removeRule: (appId: string, trigger: string) => void;
  clearRulesForApp: (appId: string) => void;
  applyPreset: (preset: Preset) => void;
  clearAll: () => void;
}

export type ConfigStore = ConfigState & ConfigActions;

const INITIAL_STATE: ConfigState = {
  os: 'windows',
  selectedAppIds: [],
  rules: [],
};

function normaliseTrigger(trigger: string): string {
  return serializeKeyCombo(parseKeyCombo(trigger));
}

export const useConfigStore = create<ConfigStore>((set) => ({
  ...INITIAL_STATE,

  setOS: (os) => set({ os }),

  toggleAppSelection: (appId) =>
    set((state) => {
      if (state.selectedAppIds.includes(appId)) {
        return {
          selectedAppIds: state.selectedAppIds.filter((id) => id !== appId),
          rules: state.rules.filter((rule) => rule.appId !== appId),
        };
      }
      return { selectedAppIds: [...state.selectedAppIds, appId] };
    }),

  addRule: (rule) =>
    set((state) => {
      const normalisedTrigger = normaliseTrigger(rule.trigger);
      const normalisedAction = normaliseTrigger(rule.action);
      const next: HotkeyRule = {
        ...rule,
        trigger: normalisedTrigger,
        action: normalisedAction,
      };
      const existingIndex = state.rules.findIndex(
        (r) => r.appId === next.appId && r.trigger === normalisedTrigger,
      );
      if (existingIndex === -1) {
        return { rules: [...state.rules, next] };
      }
      const updated = state.rules.slice();
      updated[existingIndex] = next;
      return { rules: updated };
    }),

  updateRule: (appId, trigger, updates) =>
    set((state) => {
      const normalised = normaliseTrigger(trigger);
      const index = state.rules.findIndex(
        (r) => r.appId === appId && r.trigger === normalised,
      );
      if (index === -1) return {};
      const current = state.rules[index];
      const merged: HotkeyRule = {
        ...current,
        ...updates,
        appId: current.appId,
        trigger: current.trigger,
      };
      if (updates.action !== undefined) {
        merged.action = normaliseTrigger(updates.action);
      }
      const next = state.rules.slice();
      next[index] = merged;
      return { rules: next };
    }),

  removeRule: (appId, trigger) =>
    set((state) => {
      const normalised = normaliseTrigger(trigger);
      const next = state.rules.filter(
        (r) => !(r.appId === appId && r.trigger === normalised),
      );
      if (next.length === state.rules.length) return {};
      return { rules: next };
    }),

  clearRulesForApp: (appId) =>
    set((state) => ({
      rules: state.rules.filter((r) => r.appId !== appId),
    })),

  applyPreset: (preset) =>
    set((state) => {
      const selected = new Set(state.selectedAppIds);
      let rules = state.rules;
      for (const rule of preset.rules) {
        if (!selected.has(rule.appId)) continue;
        const normalisedTrigger = normaliseTrigger(rule.trigger);
        const normalisedAction = normaliseTrigger(rule.action);
        const next: HotkeyRule = {
          ...rule,
          trigger: normalisedTrigger,
          action: normalisedAction,
        };
        const index = rules.findIndex(
          (r) => r.appId === next.appId && r.trigger === normalisedTrigger,
        );
        if (index === -1) {
          rules = [...rules, next];
        } else {
          rules = rules.slice();
          rules[index] = next;
        }
      }
      return { rules };
    }),

  clearAll: () => set({ selectedAppIds: [], rules: [] }),
}));
