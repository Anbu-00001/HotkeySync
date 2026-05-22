/**
 * URL-encoded config sharing.
 *
 * Encodes the persistable ConfigState into a URL-safe string so a config can
 * be shared via a link with no backend, no auth, no localStorage prerequisite.
 *
 * v1 format (frozen — old share URLs keep working forever):
 *   { v: 1, o, s, r: [{ a, t, x, d }] }     — basic rules only, no `k` field
 * v2 format (current — adds tap_hold via `k: 'h'`):
 *   { v: 2, o, s, r: [
 *     { a, t, x, d }                        // basic; no `k` field
 *     | { k: 'h', a, t, xa, xh, ms, d }     // tap_hold
 *   ] }
 *
 * Decoder accepts BOTH; rules without a `k` field are treated as basic on
 * both v1 and v2. Encoder emits v2; basic-only configs produce a payload
 * that's structurally identical to v1 except for the version literal, so
 * v1-only consumers (if any) could still parse it.
 *
 * URL convention: `#hk=<base64url>`. All decode paths are defensive — malformed
 * input returns a structured error, never throws.
 */

import { z } from 'zod';
import type { ConfigState } from '@/store/useConfigStore';
import type { HotkeyRule, OS } from '@/types';
import {
  TAP_HOLD_MIN_TIMEOUT_MS,
  TAP_HOLD_MAX_TIMEOUT_MS,
} from '@/types';
import { keyComboSchema } from '@/lib/schemas';

export const SHARE_HASH_PREFIX = '#hk=';
export const SHARE_VERSION = 2 as const;
/** v1 is still accepted on decode. We emit only v2. */
export const SHARE_VERSION_LEGACY_V1 = 1 as const;

// Each rule in the encoded payload is a discriminated union on `k`.
// Basic rules omit `k` entirely (so v1 payloads decode unchanged).
const basicShortRuleSchema = z.object({
  k: z.undefined().optional(),
  a: z.string().min(1).max(64),
  t: keyComboSchema,
  x: keyComboSchema,
  d: z.string().min(0).max(120),
});

const tapHoldShortRuleSchema = z.object({
  k: z.literal('h'),
  a: z.string().min(1).max(64),
  t: keyComboSchema,
  xa: keyComboSchema, // tap action
  xh: keyComboSchema, // hold action
  ms: z.number().int().min(TAP_HOLD_MIN_TIMEOUT_MS).max(TAP_HOLD_MAX_TIMEOUT_MS),
  d: z.string().min(0).max(120),
});

const shortRuleSchema = z.union([basicShortRuleSchema, tapHoldShortRuleSchema]);

const sharedConfigSchema = z.object({
  v: z.union([
    z.literal(SHARE_VERSION),
    z.literal(SHARE_VERSION_LEGACY_V1),
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
        ? { a: r.appId, t: r.trigger, x: r.action, d: r.description }
        : {
            k: 'h' as const,
            a: r.appId,
            t: r.trigger,
            xa: r.tapAction,
            xh: r.holdAction,
            ms: r.tapTimeoutMs,
            d: r.description,
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
  const rules: HotkeyRule[] = blob.r.map((r) =>
    'k' in r && r.k === 'h'
      ? {
          kind: 'tap_hold' as const,
          appId: r.a,
          trigger: r.t,
          tapAction: r.xa,
          holdAction: r.xh,
          tapTimeoutMs: r.ms,
          description: r.d,
        }
      : {
          kind: 'basic' as const,
          appId: r.a,
          trigger: r.t,
          action: r.x,
          description: r.d,
        },
  );
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
