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
