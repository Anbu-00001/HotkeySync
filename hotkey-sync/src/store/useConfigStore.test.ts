import { describe, it, expect, beforeEach } from 'vitest';
import { useConfigStore, migratePersisted } from '@/store/useConfigStore';
import type { Preset } from '@/data/presets';

function reset() {
  useConfigStore.setState({
    os: 'windows',
    selectedAppIds: [],
    rules: [],
  });
  // Clear persisted state so test order is irrelevant.
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('hotkeysync-config-v1');
  }
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
    useConfigStore.getState().addRule({ kind: 'basic',
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
    useConfigStore.getState().addRule({ kind: 'basic',
      appId: 'vs-code',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
      description: 'd',
    });
    useConfigStore.getState().addRule({ kind: 'basic',
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
    useConfigStore.getState().addRule({ kind: 'basic',
      appId: 'vs-code',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
      description: 'open settings',
    });
    expect(useConfigStore.getState().rules).toHaveLength(1);
  });

  it('normalises a non-canonical trigger before storing', () => {
    useConfigStore.getState().addRule({ kind: 'basic',
      appId: 'vs-code',
      trigger: 'CTRL+P',
      action: 'CTRL+COMMA',
      description: 'open settings',
    });
    const stored = useConfigStore.getState().rules[0];
    expect(stored).toMatchObject({ trigger: 'ctrl+p', action: 'ctrl+comma' });
  });

  it('normalises an out-of-order trigger', () => {
    useConfigStore.getState().addRule({ kind: 'basic',
      appId: 'vs-code',
      trigger: 'p+ctrl',
      action: 'ctrl+comma',
      description: 'open settings',
    });
    expect(useConfigStore.getState().rules[0].trigger).toBe('ctrl+p');
  });

  it('replaces a duplicate rather than creating a duplicate', () => {
    useConfigStore.getState().addRule({ kind: 'basic',
      appId: 'vs-code',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
      description: 'first',
    });
    useConfigStore.getState().addRule({ kind: 'basic',
      appId: 'vs-code',
      trigger: 'ctrl+p',
      action: 'ctrl+period',
      description: 'second',
    });
    const rules = useConfigStore.getState().rules;
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ description: 'second', action: 'ctrl+period' });
  });
});

describe('updateRule', () => {
  it('updates the description without changing appId or trigger', () => {
    useConfigStore.getState().addRule({ kind: 'basic',
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
    useConfigStore.getState().addRule({ kind: 'basic',
      appId: 'vs-code',
      trigger: 'ctrl+p',
      action: 'ctrl+comma',
      description: 'd',
    });
    useConfigStore.getState().addRule({ kind: 'basic',
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
    useConfigStore.getState().addRule({ kind: 'basic',
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
        { kind: 'basic',
          appId: 'vs-code',
          trigger: 'ctrl+p',
          action: 'ctrl+comma',
          description: 'd',
        },
        { kind: 'basic',
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

describe('replaceConfig', () => {
  it('overwrites os, selectedAppIds, and rules in one call', () => {
    useConfigStore.getState().replaceConfig({
      os: 'mac',
      selectedAppIds: ['google-chrome', 'vs-code'],
      rules: [
        { kind: 'basic',
          appId: 'google-chrome',
          trigger: 'ctrl+p',
          action: 'ctrl+comma',
          description: 'preferences',
        },
      ],
    });
    const state = useConfigStore.getState();
    expect(state.os).toBe('mac');
    expect(state.selectedAppIds).toEqual(['google-chrome', 'vs-code']);
    expect(state.rules).toHaveLength(1);
    expect(state.rules[0].appId).toBe('google-chrome');
  });

  it('replaces rather than merges (previous selectedAppIds wiped)', () => {
    useConfigStore.getState().toggleAppSelection('notion');
    useConfigStore.getState().replaceConfig({
      os: 'mac',
      selectedAppIds: ['google-chrome'],
      rules: [],
    });
    expect(useConfigStore.getState().selectedAppIds).toEqual(['google-chrome']);
  });
});

describe('migratePersisted (v1 → v2)', () => {
  it('returns initial state for unknown version', () => {
    const out = migratePersisted({ foo: 'bar' }, 99);
    expect(out).toMatchObject({ os: 'windows', selectedAppIds: [], rules: [] });
  });

  it('returns initial state for missing persisted payload', () => {
    expect(migratePersisted(null, 1)).toMatchObject({ rules: [] });
    expect(migratePersisted(undefined, 1)).toMatchObject({ rules: [] });
  });

  it('passes v2 payload through unchanged', () => {
    const v2 = {
      os: 'mac' as const,
      selectedAppIds: ['google-chrome'],
      rules: [
        {
          kind: 'basic' as const,
          appId: 'google-chrome',
          trigger: 'ctrl+p',
          action: 'ctrl+comma',
          description: 'p',
        },
      ],
    };
    expect(migratePersisted(v2, 2)).toEqual(v2);
  });

  it('injects kind:"basic" into every v1 rule on v1 → v2 upgrade', () => {
    const v1 = {
      os: 'mac',
      selectedAppIds: ['google-chrome', 'vs-code'],
      rules: [
        {
          appId: 'google-chrome',
          trigger: 'ctrl+p',
          action: 'ctrl+comma',
          description: 'Open Settings',
        },
        {
          appId: 'vs-code',
          trigger: 'ctrl+w',
          action: 'ctrl+shift+w',
          description: 'Close workspace',
        },
      ],
    };
    const out = migratePersisted(v1, 1);
    expect(out.os).toBe('mac');
    expect(out.selectedAppIds).toEqual(['google-chrome', 'vs-code']);
    expect(out.rules).toHaveLength(2);
    expect(out.rules[0]).toMatchObject({ kind: 'basic', appId: 'google-chrome' });
    expect(out.rules[1]).toMatchObject({ kind: 'basic', appId: 'vs-code' });
  });

  it('drops malformed rule entries during v1 → v2 migration', () => {
    const v1 = {
      os: 'windows',
      selectedAppIds: [],
      rules: [
        { appId: 'vs-code', trigger: 'ctrl+p', action: 'ctrl+comma', description: 'ok' },
        { appId: 42 }, // garbage
        null,
        { trigger: 'lone-trigger' }, // missing fields
      ],
    };
    const out = migratePersisted(v1, 1);
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0]).toMatchObject({ kind: 'basic', appId: 'vs-code' });
  });

  it('clamps unknown os to windows', () => {
    const v1 = { os: 'beos', selectedAppIds: [], rules: [] };
    expect(migratePersisted(v1, 1).os).toBe('windows');
  });
});

describe('persistence', () => {
  it('writes the data slice to localStorage on mutation', () => {
    useConfigStore.getState().setOS('mac');
    useConfigStore.getState().toggleAppSelection('google-chrome');
    const stored = JSON.parse(
      localStorage.getItem('hotkeysync-config-v1') ?? '{}',
    ) as { state: { os: string; selectedAppIds: string[] } };
    expect(stored.state.os).toBe('mac');
    expect(stored.state.selectedAppIds).toContain('google-chrome');
  });
});

describe('clearAll', () => {
  it('resets selectedAppIds and rules but keeps os', () => {
    useConfigStore.getState().setOS('mac');
    useConfigStore.getState().toggleAppSelection('vs-code');
    useConfigStore.getState().addRule({ kind: 'basic',
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
