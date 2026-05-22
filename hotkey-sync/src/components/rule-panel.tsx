'use client';

import * as React from 'react';
import { useForm, FormProvider, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Plus, Zap } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';
import { KeyCaptureInput } from '@/components/key-capture-input';
import { RuleRow } from '@/components/rule-row';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { keyComboSchema } from '@/lib/schemas';
import { parseKeyCombo, serializeKeyCombo } from '@/lib/keys';
import type { App, HotkeyRule } from '@/types';
import {
  TAP_HOLD_DEFAULT_TIMEOUT_MS,
  TAP_HOLD_MIN_TIMEOUT_MS,
  TAP_HOLD_MAX_TIMEOUT_MS,
} from '@/types';
import type { HotkeyRuleUpdate } from '@/store/useConfigStore';
import { cn } from '@/lib/utils';

interface RulePanelProps {
  app: App;
  rules: HotkeyRule[];
  conflictingTriggers: Set<string>;
  onAddRule: (rule: HotkeyRule) => void;
  onUpdateRule: (trigger: string, updates: HotkeyRuleUpdate) => void;
  onRemoveRule: (trigger: string) => void;
}

function safeNormalize(input: string): string | null {
  try {
    return serializeKeyCombo(parseKeyCombo(input));
  } catch {
    return null;
  }
}

/**
 * Combined form schema covering both kinds. Branch-specific required fields
 * are enforced via `superRefine` so the form can flip between modes without
 * stranding stale validation messages.
 */
const addRuleFormSchema = z
  .object({
    kind: z.enum(['basic', 'tap_hold']),
    trigger: keyComboSchema,
    // Branch-specific fields are present always (defaultValues seeds them);
    // superRefine below enforces presence rules per kind.
    action: z.string(),
    tapAction: z.string(),
    holdAction: z.string(),
    tapTimeoutMs: z
      .number()
      .int()
      .min(TAP_HOLD_MIN_TIMEOUT_MS)
      .max(TAP_HOLD_MAX_TIMEOUT_MS),
    description: z.string().min(1).max(120),
  })
  .superRefine((val, ctx) => {
    if (val.kind === 'basic') {
      const r = keyComboSchema.safeParse(val.action);
      if (!r.success) {
        ctx.addIssue({
          code: 'custom',
          path: ['action'],
          message: r.error.issues[0]?.message ?? 'Invalid action combo',
        });
      }
    } else {
      const t = keyComboSchema.safeParse(val.tapAction);
      if (!t.success) {
        ctx.addIssue({
          code: 'custom',
          path: ['tapAction'],
          message: t.error.issues[0]?.message ?? 'Invalid tap combo',
        });
      }
      const h = keyComboSchema.safeParse(val.holdAction);
      if (!h.success) {
        ctx.addIssue({
          code: 'custom',
          path: ['holdAction'],
          message: h.error.issues[0]?.message ?? 'Invalid hold combo',
        });
      }
    }
  });

type AddRuleFormValues = z.infer<typeof addRuleFormSchema>;

export function RulePanel({
  app,
  rules,
  conflictingTriggers,
  onAddRule,
  onUpdateRule,
  onRemoveRule,
}: RulePanelProps): React.JSX.Element {
  const [confirmClearOpen, setConfirmClearOpen] = React.useState(false);

  const methods = useForm<AddRuleFormValues>({
    resolver: zodResolver(addRuleFormSchema),
    defaultValues: {
      kind: 'basic',
      trigger: '',
      action: '',
      tapAction: '',
      holdAction: '',
      tapTimeoutMs: TAP_HOLD_DEFAULT_TIMEOUT_MS,
      description: '',
    },
  });
  const { handleSubmit, reset, control, setValue } = methods;

  const newKind = useWatch({ control, name: 'kind' });
  const newTrigger = useWatch({ control, name: 'trigger' });
  const newTimeout = useWatch({ control, name: 'tapTimeoutMs' });
  const normalizedNewTrigger = newTrigger ? safeNormalize(newTrigger) : null;
  const triggerWillReplace =
    normalizedNewTrigger !== null &&
    rules.some((r) => r.trigger === normalizedNewTrigger);

  const onSubmit = (data: AddRuleFormValues) => {
    if (data.kind === 'basic') {
      onAddRule({
        kind: 'basic',
        appId: app.id,
        trigger: data.trigger,
        action: data.action,
        description: data.description,
      });
    } else {
      onAddRule({
        kind: 'tap_hold',
        appId: app.id,
        trigger: data.trigger,
        tapAction: data.tapAction,
        holdAction: data.holdAction,
        tapTimeoutMs: data.tapTimeoutMs,
        description: data.description,
      });
    }
    reset({
      kind: data.kind,
      trigger: '',
      action: '',
      tapAction: '',
      holdAction: '',
      tapTimeoutMs: TAP_HOLD_DEFAULT_TIMEOUT_MS,
      description: '',
    });
  };

  const clearAppRules = () => {
    for (const r of rules) onRemoveRule(r.trigger);
  };

  return (
    <section className="rounded-lg border bg-card p-4">
      <header className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">
            {app.icon}
          </span>
          <div>
            <h3 className="text-base font-semibold leading-tight">{app.name}</h3>
            <p className="text-xs text-muted-foreground">{app.category}</p>
          </div>
          <Badge variant="secondary">
            {rules.length} rule{rules.length === 1 ? '' : 's'}
          </Badge>
        </div>
        {rules.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmClearOpen(true)}
          >
            Clear app rules
          </Button>
        )}
      </header>

      <div className="space-y-2 mb-4">
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No rules yet.</p>
        ) : (
          rules.map((rule) => (
            <RuleRow
              key={`${rule.appId}:${rule.trigger}`}
              rule={rule}
              appId={app.id}
              hasConflict={conflictingTriggers.has(rule.trigger)}
              onUpdate={(updates) => onUpdateRule(rule.trigger, updates)}
              onRemove={() => onRemoveRule(rule.trigger)}
            />
          ))
        )}
      </div>

      <FormProvider {...methods}>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="rounded-md border border-dashed bg-muted/20 p-3 space-y-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <div
              role="radiogroup"
              aria-label="Rule kind"
              className="inline-flex items-center rounded-md border bg-background p-0.5 text-[11px]"
            >
              {(['basic', 'tap_hold'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={newKind === k}
                  onClick={() => setValue('kind', k, { shouldValidate: true })}
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-2 py-1 transition-colors',
                    newKind === k
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {k === 'tap_hold' && <Zap className="h-3 w-3" />}
                  {k === 'basic' ? 'Basic' : 'Tap & Hold'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <FormField
              name="trigger"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-[11px] uppercase tracking-wide">
                    Trigger
                  </FormLabel>
                  <FormControl>
                    <KeyCaptureInput
                      value={field.value}
                      onChange={(v) =>
                        setValue('trigger', v, { shouldValidate: true })
                      }
                      onValidationError={() => {
                        /* surfaced via FormMessage */
                      }}
                      placeholder="Click to capture trigger key"
                      aria-label={`New trigger for ${app.name}`}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <ArrowRight
              className="mb-2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />

            {newKind === 'basic' ? (
              <FormField
                name="action"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-[11px] uppercase tracking-wide">
                      Action
                    </FormLabel>
                    <FormControl>
                      <KeyCaptureInput
                        value={field.value}
                        onChange={(v) =>
                          setValue('action', v, { shouldValidate: true })
                        }
                        onValidationError={() => {
                          /* surfaced via FormMessage */
                        }}
                        placeholder="Click to capture action key"
                        aria-label={`New action for ${app.name}`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="flex flex-col gap-2">
                <FormField
                  name="tapAction"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-[11px] uppercase tracking-wide">
                        Tap (released &lt; {newTimeout}&thinsp;ms)
                      </FormLabel>
                      <FormControl>
                        <KeyCaptureInput
                          value={field.value}
                          onChange={(v) =>
                            setValue('tapAction', v, { shouldValidate: true })
                          }
                          onValidationError={() => {
                            /* surfaced via FormMessage */
                          }}
                          placeholder="Tap action key"
                          aria-label={`New tap action for ${app.name}`}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="holdAction"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-[11px] uppercase tracking-wide">
                        Hold (held ≥ {newTimeout}&thinsp;ms)
                      </FormLabel>
                      <FormControl>
                        <KeyCaptureInput
                          value={field.value}
                          onChange={(v) =>
                            setValue('holdAction', v, { shouldValidate: true })
                          }
                          onValidationError={() => {
                            /* surfaced via FormMessage */
                          }}
                          placeholder="Hold action key"
                          aria-label={`New hold action for ${app.name}`}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="tapTimeoutMs"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-[11px] uppercase tracking-wide">
                        Tap timeout: {field.value}&thinsp;ms
                      </FormLabel>
                      <FormControl>
                        <input
                          type="range"
                          min={TAP_HOLD_MIN_TIMEOUT_MS}
                          max={TAP_HOLD_MAX_TIMEOUT_MS}
                          step={10}
                          value={field.value}
                          onChange={(e) =>
                            setValue('tapTimeoutMs', Number(e.target.value), {
                              shouldValidate: true,
                            })
                          }
                          className="w-56"
                          aria-label={`Tap timeout for ${app.name}`}
                          title="Below 150 ms tends to mis-fire when typing. Above 400 ms feels sluggish. 200 ms is the QMK community sweet spot."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              name="description"
              render={({ field }) => (
                <FormItem className="flex-1 min-w-48 space-y-1">
                  <FormLabel className="text-[11px] uppercase tracking-wide">
                    Description
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      maxLength={120}
                      placeholder="What does this rule do?"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" variant="secondary" className="mb-0.5">
              <Plus className="h-4 w-4" />
              Add rule
            </Button>
          </div>

          {newKind === 'tap_hold' && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
              Karabiner runs Tap &amp; Hold natively. AHK emulates it via a polling
              helper — fast typing rolls may briefly trigger the wrong action.
              Prefer <strong>Basic</strong> for letters you type often.
            </p>
          )}
          {triggerWillReplace && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              This trigger already exists for this app. Adding it will replace
              the existing rule.
            </p>
          )}
        </form>
      </FormProvider>

      <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all rules for {app.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {rules.length} rule{rules.length === 1 ? '' : 's'} for this app.
              The app stays selected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearAppRules();
                setConfirmClearOpen(false);
              }}
            >
              Clear rules
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
