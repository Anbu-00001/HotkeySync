import { z } from 'zod';
import { parseKeyCombo } from '@/lib/keys';

export const keyComboSchema = z.string().superRefine((val, ctx) => {
  try {
    parseKeyCombo(val);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid key combo';
    ctx.addIssue({ code: 'custom', message });
  }
});

export const hotkeyRuleSchema = z.object({
  appId: z.string().min(1),
  trigger: keyComboSchema,
  action: keyComboSchema,
  description: z.string().min(1).max(120),
});

export type ValidatedHotkeyRule = z.infer<typeof hotkeyRuleSchema>;
