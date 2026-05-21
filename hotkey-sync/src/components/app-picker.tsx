'use client';

import * as React from 'react';
import { Search, SearchX } from 'lucide-react';
import appsData from '@/data/apps.json';
import type { App, AppCategory } from '@/types';
import { useConfigStore } from '@/store/useConfigStore';
import { AppCard } from '@/components/app-card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
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

const APPS = appsData as App[];
const CATEGORIES: readonly AppCategory[] = [
  'Browsers',
  'Editors',
  'Productivity',
  'Communication',
  'Media',
] as const;

type CategoryFilter = 'All' | AppCategory;

export function AppPicker(): React.JSX.Element {
  const selectedAppIds = useConfigStore((s) => s.selectedAppIds);
  const rules = useConfigStore((s) => s.rules);
  const toggleAppSelection = useConfigStore((s) => s.toggleAppSelection);
  const clearAll = useConfigStore((s) => s.clearAll);

  const [rawQuery, setRawQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const [category, setCategory] = React.useState<CategoryFilter>('All');
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(rawQuery), 150);
    return () => window.clearTimeout(id);
  }, [rawQuery]);

  const filtered = React.useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return APPS.filter((app) => {
      if (category !== 'All' && app.category !== category) return false;
      if (!q) return true;
      return (
        app.name.toLowerCase().includes(q) ||
        app.id.toLowerCase().includes(q) ||
        app.category.toLowerCase().includes(q)
      );
    });
  }, [debouncedQuery, category]);

  const handleClearAll = () => {
    if (rules.length > 0) {
      setConfirmOpen(true);
    } else {
      clearAll();
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search apps…"
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          className="pl-9"
          aria-label="Search apps"
        />
      </div>

      <Tabs value={category} onValueChange={(v) => setCategory(v as CategoryFilter)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="All">All</TabsTrigger>
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c} value={c}>
              {c}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 py-12">
          <SearchX className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No apps match &ldquo;{debouncedQuery}&rdquo;.
          </p>
        </div>
      ) : (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))' }}
        >
          {filtered.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              isSelected={selectedAppIds.includes(app.id)}
              onToggle={toggleAppSelection}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-3">
        <p
          className={
            selectedAppIds.length === 0
              ? 'text-sm text-muted-foreground'
              : 'text-sm font-medium'
          }
        >
          {selectedAppIds.length} of {APPS.length} apps selected
        </p>
        {selectedAppIds.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClearAll}>
            Clear all
          </Button>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all selections and rules?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all your rules. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearAll();
                setConfirmOpen(false);
              }}
            >
              Clear everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
