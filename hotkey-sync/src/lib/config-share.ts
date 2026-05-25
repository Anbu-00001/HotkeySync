/**
 * URL-encoded config sharing.
 *
 * Encodes the persistable ConfigState into a URL-safe string so a config can
 * be shared via a link with no backend, no auth, no localStorage prerequisite.
 *
 * v1 format (frozen — old share URLs keep working forever):
 *   { v: 1, o, s, r: [{ a, t, x, d }] }     — basic rules only, no `k` field
 * v2 format (adds tap_hold via `k: 'h'`):
 *   { v: 2, o, s, r: [ basic | tap_hold ] }
 * v3 format (current — adds disable via `k: 'd'`):
 *   { v: 3, o, s, r: [
 *     { a, t, x, d }                        // basic; no `k` field
 *     | { k: 'h', a, t, xa, xh, ms, d }     // tap_hold
 *     | { k: 'd', a, t, d }                 // disable (key swallowed)
 *   ] }
 *
 * Decoder accepts all three versions; rules without a `k` field are basic on
 * any version. Encoder emits v3.
 *
 * URL convention: `#hk=<base64url>`. All decode paths are defensive — malformed
 * input returns a structured error, never throws.
 */

import { z } from 'zod';
import type { ConfigState } from '@/store/useConfigStore';
import type { Action, HotkeyRule, OS, ModifierAction, LayerHotkeyRule } from '@/types';
import {
  TAP_HOLD_MIN_TIMEOUT_MS,
  TAP_HOLD_MAX_TIMEOUT_MS,
} from '@/types';
import { keyComboSchema } from '@/lib/schemas';
import { MODIFIERS } from '@/lib/keys';

/**
 * Compact share-URL form of a ModifierAction. We emit modifiers as a
 * pre-canonicalised string (e.g. "ctrl+shift+alt+meta") and the optional
 * `lazy` flag as a 0/1 number to save bytes. Decoder rebuilds the typed shape.
 */
const shortModifierActionSchema = z.object({
  k: z.literal('m'),
  m: z.string().min(1),
  l: z.union([z.literal(0), z.literal(1)]).optional(),
});

/** Either a key-combo string (legacy) or the short modifier-action object. */
const shortActionSchema = z.union([keyComboSchema, shortModifierActionSchema]);
type ShortAction = z.infer<typeof shortActionSchema>;

function encodeAction(a: Action): ShortAction {
  if (typeof a === 'string') return a;
  return {
    k: 'm',
    m: a.modifiers.join('+'),
    ...(a.lazy ? { l: 1 as const } : {}),
  };
}

function decodeAction(a: ShortAction): Action {
  if (typeof a === 'string') return a;
  const mods = a.m.split('+').filter((s): s is (typeof MODIFIERS)[number] =>
    (MODIFIERS as readonly string[]).includes(s),
  );
  const out: ModifierAction = { kind: 'modifier', modifiers: mods };
  if (a.l === 1) (out as { lazy?: boolean }).lazy = true;
  return out;
}

export const SHARE_HASH_PREFIX = '#hk=';
export const SHARE_VERSION = 6 as const;
/** Older versions still accepted on decode. We emit only the current version. */
export const SHARE_VERSION_LEGACY_V1 = 1 as const;
export const SHARE_VERSION_LEGACY_V2 = 2 as const;
export const SHARE_VERSION_LEGACY_V3 = 3 as const;
export const SHARE_VERSION_LEGACY_V4 = 4 as const;
export const SHARE_VERSION_LEGACY_V5 = 5 as const;

// Each rule in the encoded payload is a discriminated union on `k`.
// Basic rules omit `k` entirely (so v1 payloads decode unchanged).
const basicShortRuleSchema = z.object({
  k: z.undefined().optional(),
  a: z.string().min(1).max(64),
  t: keyComboSchema,
  x: shortActionSchema, // string OR { k:'m', m, l? } (Wave 2.6)
  d: z.string().min(0).max(120),
  // Wave 2.7 — optional `ln` (layerName) means the child fires only while the
  // referenced layer is active. v4 payloads omit this field and decode unchanged.
  ln: z.string().min(1).max(32).optional(),
});

const tapHoldShortRuleSchema = z.object({
  k: z.literal('h'),
  a: z.string().min(1).max(64),
  t: keyComboSchema,
  xa: keyComboSchema, // tap action — always a key combo string
  xh: shortActionSchema, // hold action — string OR ModifierAction (Wave 2.6)
  ms: z.number().int().min(TAP_HOLD_MIN_TIMEOUT_MS).max(TAP_HOLD_MAX_TIMEOUT_MS),
  d: z.string().min(0).max(120),
});

const disableShortRuleSchema = z.object({
  k: z.literal('d'),
  a: z.string().min(1).max(64),
  t: keyComboSchema,
  d: z.string().min(0).max(120),
});

/**
 * Wave 2.7 — compact LayerHotkeyRule. `ln` carries layerName; `ta` carries
 * optional tap action (string or modifier short-action). `pm: 0` overrides
 * the passthroughModifiers default; `ub: 'p'` overrides unmappedBehavior to
 * passthrough (default 'swallow' omitted to save bytes).
 *
 * Wave 2.8 — `md: 'o'` marks one-shot mode (default omitted = hold). `ot`
 * carries optional `oneshotTimeoutMs`; `ck` carries `cancelKeys`. Both are
 * decoded only when md === 'o'.
 */
const layerShortRuleSchema = z.object({
  k: z.literal('L'),
  a: z.string().min(1).max(64),
  t: keyComboSchema,
  ln: z.string().min(1).max(32),
  ta: shortActionSchema.optional(),
  pm: z.union([z.literal(0), z.literal(1)]).optional(),
  ub: z.union([z.literal('s'), z.literal('p')]).optional(),
  md: z.literal('o').optional(),
  ot: z.number().int().min(100).max(10_000).optional(),
  ck: z.array(keyComboSchema).max(8).optional(),
  d: z.string().min(0).max(120),
});

const shortRuleSchema = z.union([
  basicShortRuleSchema,
  tapHoldShortRuleSchema,
  disableShortRuleSchema,
  layerShortRuleSchema,
]);

const sharedConfigSchema = z.object({
  v: z.union([
    z.literal(SHARE_VERSION),
    z.literal(SHARE_VERSION_LEGACY_V1),
    z.literal(SHARE_VERSION_LEGACY_V2),
    z.literal(SHARE_VERSION_LEGACY_V3),
    z.literal(SHARE_VERSION_LEGACY_V4),
    z.literal(SHARE_VERSION_LEGACY_V5),
  ]),
  o: z.enum(['windows', 'mac']),
  s: z.array(z.string().min(1).max(64)).max(200),
  r: z.array(shortRuleSchema).max(500),
});

export type SharedConfigBlob = z.infer<typeof sharedConfigSchema>;
export type SharedShortRule = z.infer<typeof shortRuleSchema>;

function toBase64Url(input: string): string {
  // btoa expects a binary string; encodeURIComponent handles non-ASCII so the
  // resulting bytes are safe for btoa to consume.
  const utf8 = unescape(encodeURIComponent(input));
  return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): string | null {
  try {
    const padded =
      input.replace(/-/g, '+').replace(/_/g, '/') +
      '='.repeat((4 - (input.length % 4)) % 4);
    const utf8 = atob(padded);
    return decodeURIComponent(escape(utf8));
  } catch {
    return null;
  }
}

export function encodeConfig(state: ConfigState): string {
  const blob: SharedConfigBlob = {
    v: SHARE_VERSION,
    o: state.os,
    s: state.selectedAppIds,
    r: state.rules.map((r) =>
      r.kind === 'basic'
        ? {
            a: r.appId,
            t: r.trigger,
            x: encodeAction(r.action),
            d: r.description,
            ...(r.layerName ? { ln: r.layerName } : {}),
          }
        : r.kind === 'tap_hold'
          ? {
              k: 'h' as const,
              a: r.appId,
              t: r.trigger,
              xa: r.tapAction,
              xh: encodeAction(r.holdAction),
              ms: r.tapTimeoutMs,
              d: r.description,
            }
          : r.kind === 'disable'
            ? {
                k: 'd' as const,
                a: r.appId,
                t: r.trigger,
                d: r.description,
              }
            : {
                k: 'L' as const,
                a: r.appId,
                t: r.trigger,
                ln: r.layerName,
                d: r.description,
                ...(r.tapAction !== undefined
                  ? { ta: encodeAction(r.tapAction) }
                  : {}),
                ...(r.passthroughModifiers === false
                  ? { pm: 0 as const }
                  : {}),
                ...(r.unmappedBehavior === 'passthrough'
                  ? { ub: 'p' as const }
                  : {}),
                ...(r.mode === 'oneshot' ? { md: 'o' as const } : {}),
                ...(r.oneshotTimeoutMs !== undefined
                  ? { ot: r.oneshotTimeoutMs }
                  : {}),
                ...(r.cancelKeys !== undefined ? { ck: r.cancelKeys.slice() } : {}),
              },
    ),
  };
  return toBase64Url(JSON.stringify(blob));
}

export interface DecodeError {
  kind: 'malformed-base64' | 'malformed-json' | 'schema-violation';
  message: string;
}

export type DecodeResult =
  | { ok: true; config: ConfigState }
  | { ok: false; error: DecodeError };

export function decodeConfig(encoded: string): DecodeResult {
  const raw = fromBase64Url(encoded);
  if (raw === null) {
    return {
      ok: false,
      error: { kind: 'malformed-base64', message: 'Not a valid base64url string' },
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      error: { kind: 'malformed-json', message: 'Could not parse JSON payload' },
    };
  }
  const result = sharedConfigSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: {
        kind: 'schema-violation',
        message: result.error.issues[0]?.message ?? 'Schema validation failed',
      },
    };
  }
  const blob = result.data;
  const rules: HotkeyRule[] = blob.r.map((r) => {
    if ('k' in r && r.k === 'h') {
      return {
        kind: 'tap_hold' as const,
        appId: r.a,
        trigger: r.t,
        tapAction: r.xa,
        holdAction: decodeAction(r.xh),
        tapTimeoutMs: r.ms,
        description: r.d,
      };
    }
    if ('k' in r && r.k === 'd') {
      return {
        kind: 'disable' as const,
        appId: r.a,
        trigger: r.t,
        description: r.d,
      };
    }
    if ('k' in r && r.k === 'L') {
      const layer: LayerHotkeyRule = {
        kind: 'layer',
        appId: r.a,
        trigger: r.t,
        layerName: r.ln,
        mode: r.md === 'o' ? 'oneshot' : 'hold',
        description: r.d,
      };
      if (r.ta !== undefined && layer.mode === 'hold') {
        layer.tapAction = decodeAction(r.ta);
      }
      if (r.pm === 0) layer.passthroughModifiers = false;
      if (r.ub === 'p') layer.unmappedBehavior = 'passthrough';
      if (layer.mode === 'oneshot') {
        if (r.ot !== undefined) layer.oneshotTimeoutMs = r.ot;
        if (r.ck !== undefined) layer.cancelKeys = r.ck.slice();
      }
      return layer;
    }
    // basic — falls through (no `k` field or `k` undefined)
    const basic = r as { x: ShortAction; ln?: string };
    return {
      kind: 'basic' as const,
      appId: r.a,
      trigger: r.t,
      action: decodeAction(basic.x),
      description: r.d,
      ...(basic.ln ? { layerName: basic.ln } : {}),
    };
  });
  return {
    ok: true,
    config: { os: blob.o satisfies OS, selectedAppIds: blob.s, rules },
  };
}

/**
 * Extract a share-blob from a hash like `#hk=…` or `#hk=…&other=stuff`.
 * Returns null if no share blob present.
 */
export function extractShareBlobFromHash(hash: string): string | null {
  if (!hash) return null;
  const trimmed = hash.startsWith('#') ? hash.slice(1) : hash;
  // Accept either `hk=blob` or `hk=blob&other=…`
  for (const segment of trimmed.split('&')) {
    if (segment.startsWith('hk=')) {
      return segment.slice('hk='.length);
    }
  }
  return null;
}

export function buildShareURL(state: ConfigState, baseURL: string): string {
  const encoded = encodeConfig(state);
  // Strip any existing hash so callers don't accidentally concatenate.
  const cleanBase = baseURL.split('#')[0];
  return `${cleanBase}${SHARE_HASH_PREFIX}${encoded}`;
}
