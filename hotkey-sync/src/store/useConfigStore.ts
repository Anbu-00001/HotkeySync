import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { HotkeyRule, OS } from '@/types';
import { parseKeyCombo, serializeKeyCombo } from '@/lib/keys';
import type { Preset } from '@/data/presets';

export interface ConfigState {
  os: OS;
  selectedAppIds: string[];
  rules: HotkeyRule[];
}

/**
 * Ephemeral status describing whether the current page load applied a URL
 * share blob. Lives on the store so the URL-import hook can drive it from
 * inside an effect (zustand set is not a React useState setter, so React 19's
 * set-state-in-effect lint rule doesn't apply). Deliberately NOT persisted.
 */
export type URLImportStatus =
  | { kind: 'idle' }
  | { kind: 'applied'; ruleCount: number }
  | { kind: 'failed'; reason: string };

/**
 * Mutable subset of a HotkeyRule across both kinds. The store applies only
 * the fields that match the target rule's kind (e.g. `action` is ignored on
 * tap_hold rules; `tapAction`/`holdAction`/`tapTimeoutMs` are ignored on
 * basic rules). Discriminated `Partial` would be cleaner but produces an
 * unusable intersection in callers.
 */
export interface HotkeyRuleUpdate {
  description?: string;
  // basic-only
  action?: string;
  // tap_hold-only
  tapAction?: string;
  holdAction?: string;
  tapTimeoutMs?: number;
}

interface ConfigActions {
  setOS: (os: OS) => void;
  toggleAppSelection: (appId: string) => void;
  addRule: (rule: HotkeyRule) => void;
  updateRule: (
    appId: string,
    trigger: string,
    updates: HotkeyRuleUpdate,
  ) => void;
  removeRule: (appId: string, trigger: string) => void;
  clearRulesForApp: (appId: string) => void;
  applyPreset: (preset: Preset) => void;
  clearAll: () => void;
  /**
   * Replace the persistable slice in one shot. Used by URL-import,
   * file-import (AHK / Karabiner reverse), and preset diff-apply flows.
   * Inputs are trusted to have already been validated by their respective
   * loaders; the store does not re-validate here.
   */
  replaceConfig: (next: ConfigState) => void;
  /** Set the ephemeral URL-import banner state. */
  setURLImportStatus: (status: URLImportStatus) => void;
}

export type ConfigStore = ConfigState & ConfigActions & { urlImportStatus: URLImportStatus };

export const INITIAL_STATE: ConfigState = {
  os: 'windows',
  selectedAppIds: [],
  rules: [],
};

export const STORE_PERSIST_KEY = 'hotkeysync-config-v1';
// v1 → v2: HotkeyRule gained a `kind` discriminator. Migration injects
// `kind: 'basic'` into every persisted rule that lacks one. The storage KEY
// stays 'hotkeysync-config-v1' so returning users hydrate cleanly through the
// migration path (we use zustand's version field, not the key, to gate it).
export const STORE_PERSIST_VERSION = 2;

function normaliseTrigger(trigger: string): string {
  return serializeKeyCombo(parseKeyCombo(trigger));
}

/**
 * Pure migrate function from any prior persist version to the current one.
 * Exported so it can be unit-tested without going through localStorage.
 */
export function migratePersisted(
  persisted: unknown,
  version: number,
): ConfigState {
  if (version === STORE_PERSIST_VERSION && persisted && typeof persisted === 'object') {
    return persisted as ConfigState;
  }
  if (version === 1 && persisted && typeof persisted === 'object') {
    // Treat the v1 payload as an opaque record — we know nothing about it
    // statically. Field-by-field validation produces a v2 ConfigState.
    const p = persisted as Record<string, unknown>;
    const rawRules = Array.isArray(p.rules) ? (p.rules as unknown[]) : [];
    const migratedRules: HotkeyRule[] = [];
    for (const raw of rawRules) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      if (
        typeof r.appId === 'string' &&
        typeof r.trigger === 'string' &&
        typeof r.action === 'string' &&
        typeof r.description === 'string'
      ) {
        migratedRules.push({
          kind: 'basic',
          appId: r.appId,
          trigger: r.trigger,
          action: r.action,
          description: r.description,
        });
      }
    }
    return {
      os: p.os === 'mac' ? 'mac' : 'windows',
      selectedAppIds: Array.isArray(p.selectedAppIds)
        ? (p.selectedAppIds as unknown[]).filter(
            (id): id is string => typeof id === 'string',
          )
        : [],
      rules: migratedRules,
    };
  }
  return INITIAL_STATE;
}

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,
      urlImportStatus: { kind: 'idle' } as URLImportStatus,

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
          // Normalise every action-shaped field; all kinds use canonical combos.
          const next: HotkeyRule =
            rule.kind === 'basic'
              ? {
                  ...rule,
                  trigger: normalisedTrigger,
                  action: normaliseTrigger(rule.action),
                }
              : rule.kind === 'tap_hold'
                ? {
                    ...rule,
                    trigger: normalisedTrigger,
                    tapAction: normaliseTrigger(rule.tapAction),
                    holdAction: normaliseTrigger(rule.holdAction),
                  }
                : { ...rule, trigger: normalisedTrigger };
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
          // Apply only the updates that match the current rule's kind. The
          // discriminated union prevents merging kind-foreign fields onto a
          // rule even though HotkeyRuleUpdate is flat for caller ergonomics.
          let merged: HotkeyRule;
          if (current.kind === 'basic') {
            merged = {
              ...current,
              description: updates.description ?? current.description,
              action:
                updates.action !== undefined
                  ? normaliseTrigger(updates.action)
                  : current.action,
            };
          } else if (current.kind === 'tap_hold') {
            merged = {
              ...current,
              description: updates.description ?? current.description,
              tapAction:
                updates.tapAction !== undefined
                  ? normaliseTrigger(updates.tapAction)
                  : current.tapAction,
              holdAction:
                updates.holdAction !== undefined
                  ? normaliseTrigger(updates.holdAction)
                  : current.holdAction,
              tapTimeoutMs:
                updates.tapTimeoutMs !== undefined
                  ? updates.tapTimeoutMs
                  : current.tapTimeoutMs,
            };
          } else {
            // 'disable' — only description is editable; trigger is locked.
            merged = {
              ...current,
              description: updates.description ?? current.description,
            };
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
            const next: HotkeyRule =
              rule.kind === 'basic'
                ? {
                    ...rule,
                    trigger: normalisedTrigger,
                    action: normaliseTrigger(rule.action),
                  }
                : rule.kind === 'tap_hold'
                  ? {
                      ...rule,
                      trigger: normalisedTrigger,
                      tapAction: normaliseTrigger(rule.tapAction),
                      holdAction: normaliseTrigger(rule.holdAction),
                    }
                  : { ...rule, trigger: normalisedTrigger };
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

      replaceConfig: (next) =>
        set({
          os: next.os,
          selectedAppIds: next.selectedAppIds,
          rules: next.rules,
        }),

      setURLImportStatus: (status) => set({ urlImportStatus: status }),
    }),
    {
      name: STORE_PERSIST_KEY,
      storage: createJSONStorage(() => localStorage),
      version: STORE_PERSIST_VERSION,
      // Persist only the data slice — never persist action functions.
      partialize: (state) => ({
        os: state.os,
        selectedAppIds: state.selectedAppIds,
        rules: state.rules,
      }),
      migrate: (persisted, version) => migratePersisted(persisted, version),
    },
  ),
);
