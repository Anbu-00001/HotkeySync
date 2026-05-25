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

/**
 * `to` event. Single shape with two valid configurations: key form
 * (`key_code` + optional modifiers/lazy) for normal output, or variable form
 * (`set_variable`) for Wave 2.7 layer toggles. The refine enforces
 * "exactly one of key_code / set_variable" so structural drift is caught.
 */
const karabinerToSchema = z
  .object({
    key_code: keyCodeSchema.optional(),
    modifiers: z.array(z.string().min(1)).optional(),
    // Wave 2.6 — `lazy: true` suppresses raw modifier-down firing (only fires
    // when chained with another key). Used on ModifierAction outputs and on
    // Wave 2.7 layer triggers when passthroughModifiers is enabled.
    lazy: z.boolean().optional(),
    // Wave 2.7 — variable-toggle form used by layer activators.
    set_variable: z
      .object({
        name: z.string().min(1),
        value: z.number().int(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (to) => (to.key_code !== undefined) !== (to.set_variable !== undefined),
    {
      message:
        'to event must have exactly one of `key_code` or `set_variable`',
    },
  );

/**
 * Manipulator condition. Two valid configurations:
 *   - application form: `frontmost_application_if` / `_unless` with
 *     `bundle_identifiers`.
 *   - variable form (Wave 2.7): `variable_if` with `name` + `value`.
 * The refine enforces field set matches the discriminator.
 */
const karabinerConditionSchema = z
  .object({
    type: z.union([
      z.literal('frontmost_application_if'),
      z.literal('frontmost_application_unless'),
      z.literal('variable_if'),
    ]),
    bundle_identifiers: z.array(z.string().min(1)).min(1).optional(),
    name: z.string().min(1).optional(),
    value: z.number().int().optional(),
  })
  .strict()
  .refine(
    (c) => {
      if (c.type === 'variable_if') {
        return c.name !== undefined && c.value !== undefined && c.bundle_identifiers === undefined;
      }
      return (
        c.bundle_identifiers !== undefined &&
        c.name === undefined &&
        c.value === undefined
      );
    },
    {
      message:
        'condition fields must match `type`: application_* needs bundle_identifiers; variable_if needs name + value',
    },
  );

const karabinerManipulatorParametersSchema = z
  .object({
    'basic.to_if_alone_timeout_milliseconds': z.number().int().positive().optional(),
    'basic.to_if_held_down_threshold_milliseconds': z.number().int().positive().optional(),
    // Wave 2.8 — one-shot layer auto-disarm delay.
    'basic.to_delayed_action_delay_milliseconds': z.number().int().positive().optional(),
  })
  .strict();

/**
 * Wave 2.8 — `to_delayed_action` block. One-shot layers fire `to_if_invoked`
 * after the timeout to clear the layer variable when no child key fired.
 */
const karabinerToDelayedActionSchema = z
  .object({
    to_if_invoked: z.array(karabinerToSchema).min(1).optional(),
    to_if_canceled: z.array(karabinerToSchema).min(1).optional(),
  })
  .strict()
  .refine((d) => d.to_if_invoked !== undefined || d.to_if_canceled !== undefined, {
    message: 'to_delayed_action must include at least one of to_if_invoked or to_if_canceled',
  });

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
    // Wave 2.7 — layer rules clear their variable here on trigger release.
    to_after_key_up: z.array(karabinerToSchema).min(1).optional(),
    // Wave 2.8 — one-shot layer auto-disarm via to_if_invoked.
    to_delayed_action: karabinerToDelayedActionSchema.optional(),
    parameters: karabinerManipulatorParametersSchema.optional(),
    // Wave 2.5: global rules with no exception list emit an empty conditions
    // array (Karabiner treats that as "apply in every app"). Per-app rules
    // still produce exactly one condition. Both are valid.
    conditions: z.array(karabinerConditionSchema),
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
