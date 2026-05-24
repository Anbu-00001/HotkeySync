'use client';

import * as React from 'react';
import { Search, SearchX } from 'lucide-react';
import appsData from '@/data/apps.json';
import type { App, AppCategory, Platform } from '@/types';
import { useConfigStore } from '@/store/useConfigStore';
import { AppCard } from '@/components/app-card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

/**
 * Apps without an explicit `platforms` field are treated as cross-platform.
 * Lets us add `platforms` incrementally without forcing a backfill on the
 * full catalogue in one commit (the Zod schema in `lib/schemas.ts` enforces
 * the exeName/bundleId invariant per actual platform listed).
 */
function appPlatforms(app: App): readonly Platform[] {
  return app.platforms ?? ['windows', 'mac'];
}

/** Lowercased substring match against name, id, category, AND aliases. */
function appMatchesQuery(app: App, q: string): boolean {
  if (!q) return true;
  if (app.name.toLowerCase().includes(q)) return true;
  if (app.id.toLowerCase().includes(q)) return true;
  if (app.category.toLowerCase().includes(q)) return true;
  if (app.aliases?.some((a) => a.toLowerCase().includes(q))) return true;
  return false;
}
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
  'Terminals',
  'Notes',
  'Mail',
  'Communication',
  'Design',
  'Office',
  'Media',
  'DevTools',
] as const;

type CategoryFilter = 'All' | AppCategory;

export function AppPicker(): React.JSX.Element {
  const os = useConfigStore((s) => s.os);
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

  // Apps available on the currently-selected OS. Computed independently of
  // category/query so the "X of Y apps selected" counter reflects this OS,
  // not the full multi-platform catalogue. The __global sentinel is always
  // pinned to the head of the list so users can find it without scrolling.
  const appsForOS = React.useMemo(() => {
    const all = APPS.filter((app) => appPlatforms(app).includes(os));
    return all.sort((a, b) => {
      if (a.id === '__global') return -1;
      if (b.id === '__global') return 1;
      return 0;
    });
  }, [os]);

  const filtered = React.useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return appsForOS.filter((app) => {
      // Show __global in every category tab — it's not really category-bound.
      if (app.id === '__global') return appMatchesQuery(app, q);
      if (category !== 'All' && app.category !== category) return false;
      return appMatchesQuery(app, q);
    });
  }, [appsForOS, debouncedQuery, category]);

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
          {selectedAppIds.length} of {appsForOS.length} apps selected
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
