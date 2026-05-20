import { describe, it, expect, beforeEach } from 'vitest';
import { useConfigStore } from '@/store/useConfigStore';
import type { Preset } from '@/data/presets';

function reset() {
  useConfigStore.setState({
    os: 'windows',
    selectedAppIds: [],
    rules: [],
  });
}

beforeEach(reset);

describe('useConfigStore initial state', () => {
  it('starts on windows with no apps and no rules', () => {
    const state = useConfigStore.getState();
    expect(state.os).toBe('windows');
    expect(state.selectedAppIds).toEqual([]);
    expect(state.rules).toEqual([]);
  });
});

describe('setOS', () => {
  it('updates os without touching selectedAppIds or rules', () => {
    useConfigStore.getState().toggleAppSelection('vs-code');
    useConfigStore.getState().addRule({
      appId: 'vs-code',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
      description: 'd',
    });
    useConfigStore.getState().setOS('mac');
    const state = useConfigStore.getState();
    expect(state.os).toBe('mac');
    expect(state.selectedAppIds).toEqual(['vs-code']);
    expect(state.rules).toHaveLength(1);
  });
});

describe('toggleAppSelection', () => {
  it('adds an appId when not present', () => {
    useConfigStore.getState().toggleAppSelection('vs-code');
    expect(useConfigStore.getState().selectedAppIds).toEqual(['vs-code']);
  });

  it('removes an appId and cascades to delete its rules', () => {
    useConfigStore.getState().toggleAppSelection('vs-code');
    useConfigStore.getState().toggleAppSelection('google-chrome');
    useConfigStore.getState().addRule({
      appId: 'vs-code',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
      description: 'd',
    });
    useConfigStore.getState().addRule({
      appId: 'google-chrome',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
      description: 'd',
    });
    useConfigStore.getState().toggleAppSelection('vs-code');
    const state = useConfigStore.getState();
    expect(state.selectedAppIds).toEqual(['google-chrome']);
    expect(state.rules.map((r) => r.appId)).toEqual(['google-chrome']);
  });
});

describe('addRule', () => {
  it('stores a rule', () => {
    useConfigStore.getState().addRule({
      appId: 'vs-code',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
      description: 'open settings',
    });
    expect(useConfigStore.getState().rules).toHaveLength(1);
  });

  it('normalises a non-canonical trigger before storing', () => {
    useConfigStore.getState().addRule({
      appId: 'vs-code',
      trigger: 'CTRL+P',
      action: 'CTRL+COMMA',
      description: 'open settings',
    });
    const stored = useConfigStore.getState().rules[0];
    expect(stored.trigger).toBe('ctrl+p');
    expect(stored.action).toBe('ctrl+comma');
  });

  it('normalises an out-of-order trigger', () => {
    useConfigStore.getState().addRule({
      appId: 'vs-code',
      trigger: 'p+ctrl',
      action: 'ctrl+comma',
      description: 'open settings',
    });
    expect(useConfigStore.getState().rules[0].trigger).toBe('ctrl+p');
  });

  it('replaces a duplicate rather than creating a duplicate', () => {
    useConfigStore.getState().addRule({
      appId: 'vs-code',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
      description: 'first',
    });
    useConfigStore.getState().addRule({
      appId: 'vs-code',
      trigger: 'ctrl+p',
      action: 'ctrl+period',
      description: 'second',
    });
    const rules = useConfigStore.getState().rules;
    expect(rules).toHaveLength(1);
    expect(rules[0].description).toBe('second');
    expect(rules[0].action).toBe('ctrl+period');
  });
});

describe('updateRule', () => {
  it('updates the description without changing appId or trigger', () => {
    useConfigStore.getState().addRule({
      appId: 'vs-code',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
      description: 'first',
    });
    useConfigStore.getState().updateRule('vs-code', 'ctrl+p', {
      description: 'updated',
    });
    const rule = useConfigStore.getState().rules[0];
    expect(rule.appId).toBe('vs-code');
    expect(rule.trigger).toBe('ctrl+p');
    expect(rule.description).toBe('updated');
  });
});

describe('removeRule', () => {
  it('removes only the matching rule and keeps the rest', () => {
    useConfigStore.getState().addRule({
      appId: 'vs-code',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
      description: 'd',
    });
    useConfigStore.getState().addRule({
      appId: 'vs-code',
      trigger: 'ctrl+w',
      action: 'ctrl+shift+w',
      description: 'd',
    });
    useConfigStore.getState().removeRule('vs-code', 'ctrl+p');
    const rules = useConfigStore.getState().rules;
    expect(rules).toHaveLength(1);
    expect(rules[0].trigger).toBe('ctrl+w');
  });
});

describe('clearRulesForApp', () => {
  it('removes rules for the app but keeps the app selected', () => {
    useConfigStore.getState().toggleAppSelection('vs-code');
    useConfigStore.getState().addRule({
      appId: 'vs-code',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
      description: 'd',
    });
    useConfigStore.getState().clearRulesForApp('vs-code');
    const state = useConfigStore.getState();
    expect(state.rules).toEqual([]);
    expect(state.selectedAppIds).toEqual(['vs-code']);
  });
});

describe('applyPreset', () => {
  it('only adds rules for apps that are currently selected', () => {
    useConfigStore.getState().toggleAppSelection('vs-code');
    const preset: Preset = {
      id: 'test',
      name: 'test',
      description: 'test',
      rules: [
        {
          appId: 'vs-code',
          trigger: 'ctrl+p',
          action: 'ctrl+comma',
          description: 'd',
        },
        {
          appId: 'google-chrome',
          trigger: 'ctrl+p',
          action: 'ctrl+comma',
          description: 'd',
        },
      ],
    };
    useConfigStore.getState().applyPreset(preset);
    const rules = useConfigStore.getState().rules;
    expect(rules).toHaveLength(1);
    expect(rules[0].appId).toBe('vs-code');
  });
});

describe('clearAll', () => {
  it('resets selectedAppIds and rules but keeps os', () => {
    useConfigStore.getState().setOS('mac');
    useConfigStore.getState().toggleAppSelection('vs-code');
    useConfigStore.getState().addRule({
      appId: 'vs-code',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
      description: 'd',
    });
    useConfigStore.getState().clearAll();
    const state = useConfigStore.getState();
    expect(state.selectedAppIds).toEqual([]);
    expect(state.rules).toEqual([]);
    expect(state.os).toBe('mac');
  });
});
