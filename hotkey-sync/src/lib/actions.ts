/**
 * Wave 2.6 — helpers for the `Action` union (`string | ModifierAction`).
 *
 * Centralising these prevents `typeof a === 'string'` narrowing from sprawling
 * across every consumer. UI renderers, generators, importers, and the store
 * all reach for these.
 */

import type { Action, ModifierAction } from '@/types';
import type { Modifier } from '@/lib/keys';
import { parseKeyCombo, serializeKeyCombo } from '@/lib/keys';

const MODIFIER_ORDER: Record<Modifier, number> = {
  ctrl: 0,
  shift: 1,
  alt: 2,
  meta: 3,
};

/** Type guard for the modifier-bundle action shape. */
export function isModifierAction(a: Action): a is ModifierAction {
  return typeof a !== 'string' && a.kind === 'modifier';
}

/**
 * Sort + dedupe modifiers into a canonical order. The Karabiner generator
 * relies on this for deterministic output; the share-URL encoder relies on it
 * for stable hashes.
 */
export function canonicaliseModifiers(
  mods: readonly Modifier[],
): readonly Modifier[] {
  const unique = Array.from(new Set(mods));
  unique.sort((a, b) => MODIFIER_ORDER[a] - MODIFIER_ORDER[b]);
  return unique;
}

/**
 * Normalise an `Action` for persistence:
 *   - string form: round-trip through parseKeyCombo / serializeKeyCombo
 *   - modifier form: canonicalise the modifiers array; preserve `lazy` as-is
 *
 * Throws if a string-form Action fails to parse (matches the existing
 * `normaliseTrigger` contract in the store).
 */
export function normaliseAction(a: Action): Action {
  if (typeof a === 'string') {
    return serializeKeyCombo(parseKeyCombo(a));
  }
  return {
    kind: 'modifier',
    modifiers: canonicaliseModifiers(a.modifiers),
    ...(a.lazy ? { lazy: true } : {}),
  };
}

const MODIFIER_GLYPH: Record<Modifier, string> = {
  ctrl: '⌃',
  shift: '⇧',
  alt: '⌥',
  meta: '⌘',
};

/**
 * Human-readable label for an Action — used in rule rows, suggestions panel,
 * mini-preview, simulator, conflict matrix. Modifier bundles get glyphs +
 * the "Hyper" suffix when all four modifiers are present.
 */
export function renderActionLabel(a: Action): string {
  if (typeof a === 'string') return a;
  const glyphs = canonicaliseModifiers(a.modifiers)
    .map((m) => MODIFIER_GLYPH[m])
    .join('');
  const isHyper = a.modifiers.length === 4;
  return isHyper ? `${glyphs} (Hyper)` : glyphs;
}

/**
 * Stable behaviour key used by `cross-app-conflicts` to decide whether two
 * rules sharing a trigger are "the same behaviour" or a real conflict.
 */
export function actionBehaviourKey(a: Action): string {
  if (typeof a === 'string') return `key:${a}`;
  const mods = canonicaliseModifiers(a.modifiers).join('+');
  return `mod:${mods}${a.lazy ? '|lazy' : ''}`;
}
