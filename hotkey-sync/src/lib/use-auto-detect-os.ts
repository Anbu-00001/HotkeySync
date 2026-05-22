/**
 * Hook: on truly-first visit (no persisted store blob in localStorage), sniff
 * the browser's reported platform and switch the OS toggle to match. Returning
 * users keep whatever OS they chose last time.
 *
 * The hook runs after hydration so localStorage is reachable. The check is
 * idempotent — guarded by a ref so it can't fire twice in StrictMode.
 *
 * Why a ref + effect (not zustand persist's onRehydrateStorage):
 *   - We don't want to entangle hydration logic with detection (one is data
 *     loading, the other is UX preference).
 *   - The cost is a single re-render on first paint for Mac users on a
 *     non-persisted visit. Acceptable.
 */
'use client';

import * as React from 'react';
import {
  useConfigStore,
  STORE_PERSIST_KEY,
  INITIAL_STATE,
} from '@/store/useConfigStore';
import { detectOS } from '@/lib/detect-os';

export function useAutoDetectOS(): void {
  const setOS = useConfigStore((s) => s.setOS);
  const ranRef = React.useRef(false);

  React.useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    if (typeof window === 'undefined') return;
    // Only treat this as a fresh visit when localStorage has no persisted blob.
    if (window.localStorage.getItem(STORE_PERSIST_KEY) !== null) return;
    const detected = detectOS(window.navigator);
    if (detected !== null && detected !== INITIAL_STATE.os) {
      setOS(detected);
    }
  }, [setOS]);
}
