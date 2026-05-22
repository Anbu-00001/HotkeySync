/**
 * Zod schema for the Karabiner-Elements complex_modifications JSON that
 * HotkeySync emits. Used by:
 *   1. Generator unit tests — guarantees we never silently produce malformed JSON.
 *   2. Pre-download validation — surfaces a user-visible error if something
 *      changes in the generator that would break Karabiner-Elements.
 *
 * This is the STRICT schema (only fields we currently emit). Imports of
 * arbitrary Karabiner JSON use a lenient schema (see karabiner-import.ts).
 *
 * Sources: https://karabiner-elements.pqrs.org/docs/json/complex-modifications-manipulator-definition/
 */

import { z } from 'zod';

// Canonical Karabiner key_code names + the explicit `left_*` modifier names
// we emit. Keep these as `z.string().min(1)` rather than enumerating — the
// generator is the authority on which key_codes appear, and a runtime smoke
// test (validateKarabinerOutput) catches the rare drift.
const keyCodeSchema = z.string().min(1);

const karabinerFromModifiersSchema = z
  .object({
    mandatory: z.array(z.string().min(1)).optional(),
    optional: z.array(z.string().min(1)).optional(),
  })
  .strict();

const karabinerFromSchema = z
  .object({
    key_code: keyCodeSchema,
    modifiers: karabinerFromModifiersSchema.optional(),
  })
  .strict();

const karabinerToSchema = z
  .object({
    key_code: keyCodeSchema,
    modifiers: z.array(z.string().min(1)).optional(),
  })
  .strict();

const karabinerConditionSchema = z
  .object({
    type: z.literal('frontmost_application_if'),
    bundle_identifiers: z.array(z.string().min(1)).min(1),
  })
  .strict();

const karabinerManipulatorParametersSchema = z
  .object({
    'basic.to_if_alone_timeout_milliseconds': z.number().int().positive().optional(),
    'basic.to_if_held_down_threshold_milliseconds': z.number().int().positive().optional(),
  })
  .strict();

/**
 * Manipulator schema — accepts both basic (with `to`) and tap_hold (with
 * `to_if_alone` + `to_if_held_down` + `parameters`) shapes. Cross-field rule
 * (refine) enforces that at least ONE of `to`, `to_if_alone`, `to_if_held_down`
 * is present so we never emit an empty manipulator.
 */
const karabinerManipulatorSchema = z
  .object({
    type: z.literal('basic'),
    from: karabinerFromSchema,
    to: z.array(karabinerToSchema).min(1).optional(),
    to_if_alone: z.array(karabinerToSchema).min(1).optional(),
    to_if_held_down: z.array(karabinerToSchema).min(1).optional(),
    parameters: karabinerManipulatorParametersSchema.optional(),
    conditions: z.array(karabinerConditionSchema).min(1),
  })
  .strict()
  .refine(
    (m) =>
      m.to !== undefined ||
      m.to_if_alone !== undefined ||
      m.to_if_held_down !== undefined,
    {
      message:
        'manipulator must include at least one of `to`, `to_if_alone`, or `to_if_held_down`',
    },
  );

const karabinerRuleSchema = z
  .object({
    description: z.string().min(1),
    manipulators: z.array(karabinerManipulatorSchema).min(1),
  })
  .strict();

export const karabinerOutputSchema = z
  .object({
    title: z.string().min(1),
    rules: z.array(karabinerRuleSchema),
  })
  .strict();

export type KarabinerOutputValidated = z.infer<typeof karabinerOutputSchema>;

export interface ValidationOk {
  ok: true;
}
export interface ValidationFail {
  ok: false;
  errors: { path: string; message: string }[];
}
export type ValidationResult = ValidationOk | ValidationFail;

export function validateKarabinerOutput(payload: unknown): ValidationResult {
  const result = karabinerOutputSchema.safeParse(payload);
  if (result.success) return { ok: true };
  return {
    ok: false,
    errors: result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    })),
  };
}
