import { z } from 'zod';
import { parseKeyCombo } from '@/lib/keys';
import {
  TAP_HOLD_MIN_TIMEOUT_MS,
  TAP_HOLD_MAX_TIMEOUT_MS,
  GLOBAL_APP_ID,
} from '@/types';

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

export const basicRuleSchema = z
  .object({
    kind: z.literal('basic'),
    appId: z.string().min(1),
    trigger: keyComboSchema,
    action: keyComboSchema,
    description: z.string().min(1).max(120),
    exceptApps: exceptAppsSchema,
  })
  .superRefine(refineExceptApps);

export const tapHoldRuleSchema = z
  .object({
    kind: z.literal('tap_hold'),
    appId: z.string().min(1),
    trigger: keyComboSchema,
    tapAction: keyComboSchema,
    holdAction: keyComboSchema,
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

export const hotkeyRuleSchema = z.discriminatedUnion('kind', [
  basicRuleSchema,
  tapHoldRuleSchema,
  disableRuleSchema,
]);

export type ValidatedHotkeyRule = z.infer<typeof hotkeyRuleSchema>;

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
