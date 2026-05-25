import { z } from 'zod';
import { parseKeyCombo, MODIFIERS } from '@/lib/keys';
import {
  TAP_HOLD_MIN_TIMEOUT_MS,
  TAP_HOLD_MAX_TIMEOUT_MS,
  GLOBAL_APP_ID,
} from '@/types';

/**
 * Wave 2.6 ModifierAction schema. `lazy` is gated on `kind: 'modifier'` at the
 * type level (it's a literal field on the variant), so we don't need a custom
 * refinement for it.
 */
const modifierActionSchema = z.object({
  kind: z.literal('modifier'),
  modifiers: z.array(z.enum(MODIFIERS)).min(1).max(4),
  lazy: z.boolean().optional(),
});

/**
 * Action: either a canonical key combo string (legacy form, pre-Wave-2.6) or
 * a typed ModifierAction object. The string form covers ~all existing rules
 * — see `Action` type docs for the migration rationale.
 */
const actionSchema = z.union([keyComboSchemaPlaceholder(), modifierActionSchema]);
// Forward-declare to avoid the chicken-and-egg between keyComboSchema and
// actionSchema. `keyComboSchema` is exported below.
function keyComboSchemaPlaceholder(): z.ZodType<string> {
  return z.string().superRefine((val, ctx) => {
    try {
      parseKeyCombo(val);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid key combo';
      ctx.addIssue({ code: 'custom', message });
    }
  });
}

/**
 * Optional `exceptApps` list. Allowed shape on every rule kind, but only
 * meaningful when `appId === GLOBAL_APP_ID`. We catch the "non-global rule
 * with exceptApps set" mistake via discriminator + refinement (below).
 */
const exceptAppsSchema = z
  .array(z.string().min(1).max(64))
  .max(50)
  .optional();

export const keyComboSchema = z.string().superRefine((val, ctx) => {
  try {
    parseKeyCombo(val);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid key combo';
    ctx.addIssue({ code: 'custom', message });
  }
});

/**
 * Layer name shape. Lowercase-dash-case, 1–32 chars. Tight on purpose: the
 * name surfaces in generator output (`g_LayerVimArrows`, Karabiner variable
 * names) so we want a strict id-like shape, not free text.
 */
const layerNameSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
    'layerName must be lowercase-dash-case',
  );

export const basicRuleSchema = z
  .object({
    kind: z.literal('basic'),
    appId: z.string().min(1),
    trigger: keyComboSchema,
    action: actionSchema,
    description: z.string().min(1).max(120),
    layerName: layerNameSchema.optional(),
    exceptApps: exceptAppsSchema,
  })
  .superRefine(refineExceptApps);

export const tapHoldRuleSchema = z
  .object({
    kind: z.literal('tap_hold'),
    appId: z.string().min(1),
    trigger: keyComboSchema,
    tapAction: keyComboSchema,
    holdAction: actionSchema,
    tapTimeoutMs: z
      .number()
      .int()
      .min(TAP_HOLD_MIN_TIMEOUT_MS)
      .max(TAP_HOLD_MAX_TIMEOUT_MS),
    description: z.string().min(1).max(120),
    exceptApps: exceptAppsSchema,
  })
  .superRefine(refineExceptApps);

export const disableRuleSchema = z
  .object({
    kind: z.literal('disable'),
    appId: z.string().min(1),
    trigger: keyComboSchema,
    description: z.string().min(1).max(120),
    exceptApps: exceptAppsSchema,
  })
  .superRefine(refineExceptApps);

/**
 * `exceptApps` is only meaningful when the rule targets the global sentinel.
 * Setting it on a per-app rule is almost certainly a mistake; reject it
 * loudly so the typo surfaces at validation time, not at generator time.
 */
function refineExceptApps(
  data: { appId: string; exceptApps?: readonly string[] },
  ctx: z.RefinementCtx,
): void {
  if (data.exceptApps && data.exceptApps.length > 0 && data.appId !== GLOBAL_APP_ID) {
    ctx.addIssue({
      code: 'custom',
      path: ['exceptApps'],
      message: `exceptApps can only be set on global rules (appId === "${GLOBAL_APP_ID}")`,
    });
  }
}

/**
 * Wave 2.7 — layer rule. Defines a trigger that activates a named layer for
 * the duration of the hold. Children (basic rules with `layerName` matching)
 * fire only while the layer is active.
 *
 * `mode` is on the schema for forward-compat with Wave 2.8 one-shot, but
 * currently only 'hold' is accepted — anything else is rejected at parse time.
 */
export const layerRuleSchema = z
  .object({
    kind: z.literal('layer'),
    appId: z.string().min(1),
    trigger: keyComboSchema,
    layerName: layerNameSchema,
    mode: z.enum(['hold', 'oneshot']),
    tapAction: actionSchema.optional(),
    passthroughModifiers: z.boolean().optional(),
    unmappedBehavior: z.enum(['swallow', 'passthrough']).optional(),
    // Wave 2.8 — one-shot tuning knobs. All ignored when mode === 'hold'.
    oneshotTimeoutMs: z.number().int().min(100).max(10_000).optional(),
    cancelKeys: z.array(keyComboSchema).max(8).optional(),
    // Wave 2.9 — armed-state visible indicator. Empty string = auto-label.
    // Karabiner: emits set_notification_message in a separate `to[]` entry
    // (or in to_after_key_up) per KE #4104 workaround. AHK: emits ToolTip
    // (slot-based; NOT TrayTip — Win10+ toast queue is unfit for sub-second
    // indicators).
    notification: z.string().max(80).optional(),
    // Wave 2.9 — lock-on-N-taps. Only literal `2` accepted at this wave;
    // N=3..5 is reserved for future expansion (Karabiner emission requires
    // N-1 counter-bump manipulators per layer).
    oneshotLockOnTaps: z.literal(2).optional(),
    description: z.string().min(1).max(120),
    exceptApps: exceptAppsSchema,
  })
  .superRefine(refineExceptApps)
  .superRefine((data, ctx) => {
    // Wave 2.8 cross-field invariants. One-shot can't carry a tapAction (the
    // tap IS the activation), and hold rules ignore one-shot tuning fields —
    // reject them at the schema layer so the generator never has to defend
    // against impossible states.
    if (data.mode === 'oneshot' && data.tapAction !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['tapAction'],
        message: 'oneshot mode does not support tapAction (the tap IS the activation).',
      });
    }
    if (data.mode === 'hold') {
      for (const k of ['oneshotTimeoutMs', 'cancelKeys', 'oneshotLockOnTaps'] as const) {
        if (data[k] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [k],
            message: `${k} is only meaningful when mode === 'oneshot'.`,
          });
        }
      }
      // Wave 2.9 — notification on hold layers needs set_notification_message
      // co-located with set_variable in `to[]`, which triggers KE #4104
      // (closed not_planned). Restrict to one-shot; document as honest gap.
      if (data.notification !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['notification'],
          message:
            'notification is currently only supported on one-shot layers (Karabiner #4104 workaround).',
        });
      }
    }
  });

export const hotkeyRuleSchema = z.discriminatedUnion('kind', [
  basicRuleSchema,
  tapHoldRuleSchema,
  disableRuleSchema,
  layerRuleSchema,
]);

export type ValidatedHotkeyRule = z.infer<typeof hotkeyRuleSchema>;

/**
 * Config-level validation: every basic-rule `layerName` reference must
 * resolve to a `LayerHotkeyRule` whose `layerName` matches. Orphan references
 * are almost always a typo or an out-of-order import, so we reject them at
 * parse time rather than letting the generator silently emit a dead rule.
 *
 * Also enforces layerName uniqueness — defining two layers with the same
 * name would make children ambiguous.
 */
export const rulesArraySchema = z
  .array(hotkeyRuleSchema)
  .superRefine((rules, ctx) => {
    const layerNames = new Set<string>();
    const duplicates = new Set<string>();
    for (const r of rules) {
      if (r.kind === 'layer') {
        if (layerNames.has(r.layerName)) duplicates.add(r.layerName);
        layerNames.add(r.layerName);
      }
    }
    for (const name of duplicates) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate layer definition: "${name}". Each layerName must be unique.`,
      });
    }
    rules.forEach((r, i) => {
      if (r.kind === 'basic' && r.layerName && !layerNames.has(r.layerName)) {
        ctx.addIssue({
          code: 'custom',
          path: [i, 'layerName'],
          message: `Rule references layer "${r.layerName}" but no LayerHotkeyRule with that name exists.`,
        });
      }
    });
  });

/**
 * Schema for an App entry in `src/data/apps.json`. Enforces the backbone
 * invariant that drives both generators:
 *   - If the app is listed on Windows (platforms includes 'windows'), it
 *     MUST have an `exeName` (AHK can't target it without one).
 *   - If listed on macOS, it MUST have a `bundleId` (Karabiner can't either).
 *   - `platforms` defaults to ['windows', 'mac'] when omitted — preserves
 *     compat with legacy entries that predate the platforms field.
 *
 * Validated at unit-test time against the actual catalogue so any malformed
 * entry breaks CI before it ships.
 */
const platformSchema = z.enum(['windows', 'mac']);

export const appSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(
        // Standard apps: lowercase-dash-case. Special case: the global
        // sentinel `__global` uses leading underscores deliberately so it
        // can't collide with a real app id (no real bundle id or exe begins
        // with double-underscore).
        /^(?:__global|[a-z0-9][a-z0-9-]*[a-z0-9])$/,
        'id must be lowercase-dash-case (or the reserved sentinel "__global")',
      ),
    name: z.string().min(1).max(60),
    exeName: z.string().min(1).optional(),
    bundleId: z.string().min(1).optional(),
    category: z.enum([
      'Browsers',
      'Editors',
      'Terminals',
      'Notes',
      'Mail',
      'Communication',
      'Design',
      'Office',
      'Media',
      'DevTools',
    ]),
    icon: z.string().min(1).max(8),
    platforms: z.array(platformSchema).nonempty().optional(),
    aliases: z.array(z.string().min(1)).optional(),
    lockedShortcuts: z.boolean().optional(),
  })
  .superRefine((app, ctx) => {
    // The global sentinel intentionally has no exeName / bundleId — generators
    // detect appId === GLOBAL_APP_ID and skip the per-app condition entirely.
    if (app.id === GLOBAL_APP_ID) return;
    const platforms = app.platforms ?? ['windows', 'mac'];
    if (platforms.includes('windows') && !app.exeName) {
      ctx.addIssue({
        code: 'custom',
        path: ['exeName'],
        message: `App "${app.id}" lists windows in platforms but has no exeName — AHK cannot target it.`,
      });
    }
    if (platforms.includes('mac') && !app.bundleId) {
      ctx.addIssue({
        code: 'custom',
        path: ['bundleId'],
        message: `App "${app.id}" lists mac in platforms but has no bundleId — Karabiner cannot target it.`,
      });
    }
  });

export const appsCatalogueSchema = z.array(appSchema);
export type ValidatedApp = z.infer<typeof appSchema>;
