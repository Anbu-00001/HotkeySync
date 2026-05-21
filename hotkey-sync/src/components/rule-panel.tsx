'use client';

import * as React from 'react';
import { useForm, FormProvider, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Plus } from 'lucide-react';
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
import { hotkeyRuleSchema, type ValidatedHotkeyRule } from '@/lib/schemas';
import { parseKeyCombo, serializeKeyCombo } from '@/lib/keys';
import type { App, HotkeyRule } from '@/types';

interface RulePanelProps {
  app: App;
  rules: HotkeyRule[];
  conflictingTriggers: Set<string>;
  onAddRule: (rule: HotkeyRule) => void;
  onUpdateRule: (
    trigger: string,
    updates: Partial<Omit<HotkeyRule, 'appId' | 'trigger'>>,
  ) => void;
  onRemoveRule: (trigger: string) => void;
}

function safeNormalize(input: string): string | null {
  try {
    return serializeKeyCombo(parseKeyCombo(input));
  } catch {
    return null;
  }
}

export function RulePanel({
  app,
  rules,
  conflictingTriggers,
  onAddRule,
  onUpdateRule,
  onRemoveRule,
}: RulePanelProps): React.JSX.Element {
  const [confirmClearOpen, setConfirmClearOpen] = React.useState(false);

  const methods = useForm<ValidatedHotkeyRule>({
    resolver: zodResolver(hotkeyRuleSchema),
    defaultValues: {
      appId: app.id,
      trigger: '',
      action: '',
      description: '',
    },
  });
  const { handleSubmit, reset, control, setValue } = methods;

  const newTrigger = useWatch({ control, name: 'trigger' });
  const normalizedNewTrigger = newTrigger ? safeNormalize(newTrigger) : null;
  const triggerWillReplace =
    normalizedNewTrigger !== null &&
    rules.some((r) => r.trigger === normalizedNewTrigger);

  const onSubmit = (data: ValidatedHotkeyRule) => {
    onAddRule({ ...data, appId: app.id });
    reset({ appId: app.id, trigger: '', action: '', description: '' });
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
                      onChange={(v) => setValue('trigger', v, { shouldValidate: true })}
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
            <ArrowRight className="mb-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
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
                      onChange={(v) => setValue('action', v, { shouldValidate: true })}
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
          {triggerWillReplace && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              This trigger already exists for this app. Adding it will replace the existing rule.
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
