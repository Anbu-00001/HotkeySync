/**
 * Hook: on first mount, look for a `#hk=…` share blob in the URL and apply
 * it to the store. After applying, clear the hash so subsequent navigations
 * don't re-apply on every render. Idempotent — safe if the hash is missing
 * or malformed.
 *
 * Implementation note (React 19): the lint rule `react-hooks/set-state-in-effect`
 * forbids calling React useState setters inside effects. The status here is
 * held in the zustand store instead — zustand `set` is not a React useState
 * setter, so the rule does not apply, and the side effect remains a single,
 * idempotent useEffect guarded by a ref.
 *
 * Returns the import status so the caller can show a banner / toast.
 */

'use client';

import * as React from 'react';
import {
  useConfigStore,
  type URLImportStatus,
} from '@/store/useConfigStore';
import { decodeConfig, extractShareBlobFromHash } from '@/lib/config-share';

export function useURLConfigImport(): URLImportStatus {
  const status = useConfigStore((s) => s.urlImportStatus);
  const replaceConfig = useConfigStore((s) => s.replaceConfig);
  const setURLImportStatus = useConfigStore((s) => s.setURLImportStatus);
  const appliedRef = React.useRef(false);

  React.useEffect(() => {
    if (appliedRef.current) return;
    if (typeof window === 'undefined') return;
    const blob = extractShareBlobFromHash(window.location.hash);
    if (!blob) return;
    appliedRef.current = true;

    const result = decodeConfig(blob);
    if (!result.ok) {
      setURLImportStatus({ kind: 'failed', reason: result.error.message });
      return;
    }
    replaceConfig(result.config);
    setURLImportStatus({
      kind: 'applied',
      ruleCount: result.config.rules.length,
    });

    const url = new URL(window.location.href);
    url.hash = '';
    window.history.replaceState(null, '', url.toString());
  }, [replaceConfig, setURLImportStatus]);

  return status;
}
