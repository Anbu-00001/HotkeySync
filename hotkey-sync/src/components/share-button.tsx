'use client';

import * as React from 'react';
import { Share2, Check, AlertCircle } from 'lucide-react';
import { useConfigStore } from '@/store/useConfigStore';
import { buildShareURL } from '@/lib/config-share';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type Status = 'idle' | 'copied' | 'unavailable';

export function ShareButton(): React.JSX.Element {
  const os = useConfigStore((s) => s.os);
  const selectedAppIds = useConfigStore((s) => s.selectedAppIds);
  const rules = useConfigStore((s) => s.rules);
  const [status, setStatus] = React.useState<Status>('idle');

  const empty = rules.length === 0 && selectedAppIds.length === 0;

  const handleShare = async () => {
    if (typeof window === 'undefined') {
      setStatus('unavailable');
      return;
    }
    const url = buildShareURL(
      { os, selectedAppIds, rules },
      window.location.origin + window.location.pathname,
    );
    if (!navigator.clipboard) {
      setStatus('unavailable');
      // Still navigate / show the URL elsewhere so the user can copy manually:
      window.prompt('Copy this share URL:', url);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus('copied');
      window.setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('unavailable');
      window.prompt('Copy this share URL:', url);
    }
  };

  if (empty) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button variant="outline" disabled aria-disabled="true">
              <Share2 className="h-4 w-4" />
              Copy share link
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Add at least one rule or app to share.</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button variant="outline" onClick={handleShare}>
      {status === 'copied' ? (
        <>
          <Check className="h-4 w-4 text-green-600" />
          Link copied
        </>
      ) : status === 'unavailable' ? (
        <>
          <AlertCircle className="h-4 w-4 text-amber-600" />
          Copy unavailable
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4" />
          Copy share link
        </>
      )}
    </Button>
  );
}
