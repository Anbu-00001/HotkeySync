import { z } from 'zod';
import { parseKeyCombo } from '@/lib/keys';
import {
  TAP_HOLD_MIN_TIMEOUT_MS,
  TAP_HOLD_MAX_TIMEOUT_MS,
} from '@/types';

export const keyComboSchema = z.string().superRefine((val, ctx) => {
  try {
    parseKeyCombo(val);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid key combo';
    ctx.addIssue({ code: 'custom', message });
  }
});

export const basicRuleSchema = z.object({
  kind: z.literal('basic'),
  appId: z.string().min(1),
  trigger: keyComboSchema,
  action: keyComboSchema,
  description: z.string().min(1).max(120),
});

export const tapHoldRuleSchema = z.object({
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
});

export const hotkeyRuleSchema = z.discriminatedUnion('kind', [
  basicRuleSchema,
  tapHoldRuleSchema,
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
        /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
        'id must be lowercase-dash-case (no spaces, underscores, or trailing dashes)',
      ),
    name: z.string().min(1).max(60),
    exeName: z.string().min(1).optional(),
    bundleId: z.string().min(1).optional(),
    category: z.enum([
      'Browsers',
      'Editors',
      'Productivity',
      'Communication',
      'Media',
    ]),
    icon: z.string().min(1).max(8),
    platforms: z.array(platformSchema).nonempty().optional(),
    aliases: z.array(z.string().min(1)).optional(),
  })
  .superRefine((app, ctx) => {
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
