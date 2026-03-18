'use client';

import { useState, useTransition } from 'react';
import { runBudgetTextDiffForJobAction } from '../sources/actions';

const JOB_ID = '22PJXd2cjdhN';

// TEMP DEBUG TOOL — remove after budget membership reconciliation is complete.
export function BudgetTextDiffRunner() {
  const [text, setText] = useState('');
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        BUDGET TEXT DIFF (DataX formatted text)
      </h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Paste the DataX <code className="font-mono text-[11px]">jobtread_get_job_budget</code> text
        export for job 22PJXd2cjdhN. This will run a server-side diff against canonical rows and log
        results to the server console.
      </p>
      <textarea
        className="w-full min-h-[160px] rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
        placeholder="- id:22PJXgZrgrFk | name:[ADM] Building Permit - Material | code:01M Permits - Material | type:Materials | unit:Each | cost:1200 | price:1200 | ext:1200/1200"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setMessage(null);
          setError(null);
        }}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={isPending || !text.trim()}
          onClick={() => {
            setMessage(null);
            setError(null);
            startTransition(async () => {
              try {
                await runBudgetTextDiffForJobAction(JOB_ID, text);
                setMessage('Budget text diff executed. Check server logs.');
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : 'Failed to run budget text diff.',
                );
              }
            });
          }}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isPending ? 'Running…' : 'Run Budget Text Diff'}
        </button>
        {message && (
          <span className="text-xs text-green-600 dark:text-green-400">
            {message}
          </span>
        )}
        {error && (
          <span className="text-xs text-red-600 dark:text-red-400">
            {error}
          </span>
        )}
      </div>
    </section>
  );
}

