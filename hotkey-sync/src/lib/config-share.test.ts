import { describe, it, expect } from 'vitest';
import {
  encodeConfig,
  decodeConfig,
  buildShareURL,
  extractShareBlobFromHash,
  SHARE_HASH_PREFIX,
} from '@/lib/config-share';
import type { ConfigState } from '@/store/useConfigStore';

function sampleConfig(): ConfigState {
  return {
    os: 'mac',
    selectedAppIds: ['google-chrome', 'vs-code'],
    rules: [
      { kind: 'basic',
        appId: 'google-chrome',
        trigger: 'ctrl+p',
        action: 'ctrl+comma',
        description: 'Open Preferences',
      },
      { kind: 'basic',
        appId: 'vs-code',
        trigger: 'ctrl+shift+p',
        action: 'ctrl+shift+p',
        description: 'Quick Open',
      },
    ],
  };
}

describe('encode/decode round-trip', () => {
  it('preserves os, selectedAppIds, and rules exactly', () => {
    const input = sampleConfig();
    const encoded = encodeConfig(input);
    const result = decodeConfig(encoded);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config).toEqual(input);
  });

  it('produces a URL-safe blob (no +/= padding, no slashes)', () => {
    const encoded = encodeConfig(sampleConfig());
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('handles empty config', () => {
    const empty: ConfigState = {
      os: 'windows',
      selectedAppIds: [],
      rules: [],
    };
    const result = decodeConfig(encodeConfig(empty));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config).toEqual(empty);
  });

  it('preserves rule descriptions verbatim including punctuation', () => {
    const c: ConfigState = {
      os: 'mac',
      selectedAppIds: ['google-chrome'],
      rules: [
        { kind: 'basic',
          appId: 'google-chrome',
          trigger: 'ctrl+p',
          action: 'ctrl+comma',
          description: 'Print → Preferences (¥ ñ ✓)',
        },
      ],
    };
    const result = decodeConfig(encodeConfig(c));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.rules[0].description).toBe('Print → Preferences (¥ ñ ✓)');
  });
});

describe('decode defensiveness', () => {
  it('returns malformed-base64 on garbage input', () => {
    const result = decodeConfig('!!!not base64!!!');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(['malformed-base64', 'malformed-json']).toContain(result.error.kind);
  });

  it('returns malformed-json when payload is base64 but not JSON', () => {
    const notJson = btoa('hello world').replace(/=+$/, '');
    const result = decodeConfig(notJson);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(['malformed-json', 'malformed-base64']).toContain(result.error.kind);
  });

  it('returns schema-violation when JSON is valid but shape is wrong', () => {
    const bad = btoa(JSON.stringify({ hello: 'world' })).replace(/=+$/, '');
    const result = decodeConfig(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('schema-violation');
  });

  it('returns schema-violation when trigger is not a valid key combo', () => {
    const bad = btoa(
      JSON.stringify({
        v: 1,
        o: 'mac',
        s: ['google-chrome'],
        r: [{ a: 'google-chrome', t: 'ctrl+xyz', x: 'ctrl+p', d: '' }],
      }),
    ).replace(/=+$/, '');
    const result = decodeConfig(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('schema-violation');
  });

  it('rejects unknown OS', () => {
    const bad = btoa(
      JSON.stringify({ v: 1, o: 'linux', s: [], r: [] }),
    ).replace(/=+$/, '');
    const result = decodeConfig(bad);
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported version', () => {
    const bad = btoa(
      JSON.stringify({ v: 99, o: 'mac', s: [], r: [] }),
    ).replace(/=+$/, '');
    const result = decodeConfig(bad);
    expect(result.ok).toBe(false);
  });
});

describe('hash extraction', () => {
  it('extracts an encoded blob from a #hk= hash', () => {
    const cfg = sampleConfig();
    const encoded = encodeConfig(cfg);
    const hash = `${SHARE_HASH_PREFIX}${encoded}`;
    expect(extractShareBlobFromHash(hash)).toBe(encoded);
  });

  it('extracts from a multi-segment hash like #hk=abc&other=x', () => {
    const encoded = encodeConfig(sampleConfig());
    const hash = `#hk=${encoded}&other=foo`;
    expect(extractShareBlobFromHash(hash)).toBe(encoded);
  });

  it('returns null for empty or unrelated hash', () => {
    expect(extractShareBlobFromHash('')).toBeNull();
    expect(extractShareBlobFromHash('#foo=bar')).toBeNull();
  });
});

describe('tap_hold round-trip + v1 backward compatibility', () => {
  it('round-trips a tap_hold rule', () => {
    const cfg: ConfigState = {
      os: 'mac',
      selectedAppIds: ['vs-code'],
      rules: [
        {
          kind: 'tap_hold',
          appId: 'vs-code',
          trigger: 'meta+grave_accent',
          tapAction: 'escape',
          holdAction: 'ctrl+grave_accent',
          tapTimeoutMs: 200,
          description: 'dual',
        },
      ],
    };
    const out = decodeConfig(encodeConfig(cfg));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.config).toEqual(cfg);
  });

  it('decodes a hand-built v1 payload (no `k` field) as basic rules', () => {
    const v1Blob = {
      v: 1,
      o: 'mac',
      s: ['google-chrome'],
      r: [
        {
          a: 'google-chrome',
          t: 'ctrl+p',
          x: 'ctrl+comma',
          d: 'prefs',
        },
      ],
    };
    const encoded = btoa(JSON.stringify(v1Blob))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const out = decodeConfig(encoded);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.config.rules).toHaveLength(1);
    expect(out.config.rules[0]).toMatchObject({
      kind: 'basic',
      action: 'ctrl+comma',
    });
  });

  it('rejects tap_hold with ms below the minimum', () => {
    const bad = {
      v: 2,
      o: 'mac',
      s: ['vs-code'],
      r: [{ k: 'h', a: 'vs-code', t: 'ctrl+p', xa: 'escape', xh: 'ctrl+p', ms: 10, d: 'too short' }],
    };
    const encoded = btoa(JSON.stringify(bad))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const out = decodeConfig(encoded);
    expect(out.ok).toBe(false);
  });

  it('rejects tap_hold with ms above the maximum', () => {
    const bad = {
      v: 2,
      o: 'mac',
      s: ['vs-code'],
      r: [{ k: 'h', a: 'vs-code', t: 'ctrl+p', xa: 'escape', xh: 'ctrl+p', ms: 9999, d: 'too long' }],
    };
    const encoded = btoa(JSON.stringify(bad))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(decodeConfig(encoded).ok).toBe(false);
  });

  it('mixed basic + tap_hold rules survive a round-trip with kinds preserved', () => {
    const cfg: ConfigState = {
      os: 'mac',
      selectedAppIds: ['google-chrome', 'vs-code'],
      rules: [
        {
          kind: 'basic',
          appId: 'google-chrome',
          trigger: 'ctrl+p',
          action: 'ctrl+comma',
          description: 'prefs',
        },
        {
          kind: 'tap_hold',
          appId: 'vs-code',
          trigger: 'meta+grave_accent',
          tapAction: 'escape',
          holdAction: 'ctrl+grave_accent',
          tapTimeoutMs: 200,
          description: 'dual',
        },
      ],
    };
    const out = decodeConfig(encodeConfig(cfg));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.config.rules[0].kind).toBe('basic');
    expect(out.config.rules[1].kind).toBe('tap_hold');
  });
});

describe('buildShareURL', () => {
  it('appends #hk= to a clean URL', () => {
    const url = buildShareURL(sampleConfig(), 'https://hotkeysync.app/');
    expect(url.startsWith('https://hotkeysync.app/#hk=')).toBe(true);
  });

  it('replaces an existing hash rather than concatenating', () => {
    const url = buildShareURL(sampleConfig(), 'https://x/#old=stuff');
    expect(url.startsWith('https://x/#hk=')).toBe(true);
    expect(url).not.toContain('#old=');
  });
});
