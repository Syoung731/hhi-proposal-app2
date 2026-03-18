'use client';

import { useState } from 'react';
import type { JobTreadDebugData } from '@/app/integrations/jobtread-pricing';

type Props = {
  debugData: JobTreadDebugData;
};

export function JobTreadDebugExport({ debugData }: Props) {
  const [status, setStatus] = useState<'idle' | 'downloading'>('idle');

  function handleDownload() {
    try {
      setStatus('downloading');
      const json = JSON.stringify(debugData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'jobtread-pricing-debug.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setStatus('idle');
    }
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
      <div>
        <div className="font-medium">Debug Data</div>
        <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          Download the full JobTread pricing debug payload as JSON for offline inspection.
        </div>
      </div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={status === 'downloading'}
        className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {status === 'downloading' ? 'Preparing…' : 'Download JSON'}
      </button>
    </div>
  );
}

