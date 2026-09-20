import React, { useEffect, useState } from 'react';
import {
  getAdminProviderRehearsalReadiness,
  listAdminProviderRehearsalHistory,
  reconcileAdminProviderRehearsalCleanup,
} from '@/lib/lessonBookingRehearsalApi';

function label(value) {
  return String(value || '').replaceAll('_', ' ');
}

function formatTime(value) {
  if (!value) return 'not available';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'not available' : parsed.toLocaleString();
}

function Pill({ ok, children }) {
  return <span className={`rounded-full px-2 py-1 text-xs font-bold ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{children}</span>;
}

export default function BookingProviderRehearsalPanel({ client, refreshKey = 0, onChanged }) {
  const [history, setHistory] = useState([]);
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyRun, setBusyRun] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [localRefresh, setLocalRefresh] = useState(0);

  useEffect(() => {
    if (!client) {
      setHistory([]);
      setReadiness(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    Promise.allSettled([
      listAdminProviderRehearsalHistory(client, 20),
      getAdminProviderRehearsalReadiness(client),
    ]).then(([historyResult, readinessResult]) => {
      if (!active) return;
      if (historyResult.status === 'fulfilled') setHistory(historyResult.value);
      else setError(historyResult.reason?.message || 'Provider rehearsal history is unavailable.');
      if (readinessResult.status === 'fulfilled') setReadiness(readinessResult.value);
      else setError((current) => current || readinessResult.reason?.message || 'Provider rehearsal readiness is unavailable.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, refreshKey, localRefresh]);

  const reconcile = async (runId) => {
    const reasonCode = window.prompt('Machine-readable cleanup reason code (for example provider_cleanup_verified)');
    if (!reasonCode) return;
    const evidenceReference = window.prompt('Internal evidence reference (ticket, log reference, or review note; no secrets or provider object IDs)');
    if (!evidenceReference) return;
    setBusyRun(runId);
    setError('');
    setNotice('');
    try {
      await reconcileAdminProviderRehearsalCleanup(client, { runId, reasonCode, evidenceReference });
      setNotice('Cleanup reconciliation recorded. A later passing rehearsal is still required before readiness can become ready.');
      setLocalRefresh((value) => value + 1);
      onChanged?.();
    } catch (err) {
      setError(err?.message || 'Could not record cleanup reconciliation.');
    } finally {
      setBusyRun('');
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Provider rehearsal readiness</h2>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">Server-authoritative provider rehearsal readiness. Recency, latest-run status, and unresolved cleanup are computed by Supabase from append-only evidence; browser time never decides readiness.</p>
        </div>
        {readiness && <Pill ok={readiness.ready === true}>{label(readiness.status)}</Pill>}
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {loading && <p className="mt-4 text-sm text-slate-500">Loading minimized rehearsal evidence…</p>}

      {readiness && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Latest status</div><div className="mt-1 font-bold">{label(readiness.latest_status || 'missing')}</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Latest completed</div><div className="mt-1 text-sm font-bold">{formatTime(readiness.latest_completed_at)}</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Recent successful rehearsal</div><div className="mt-1 font-bold">{readiness.recent_successful_rehearsal ? 'yes' : 'no'}</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Unresolved cleanup</div><div className="mt-1 text-xl font-black">{Number(readiness.unresolved_cleanup_failures || 0)}</div></div>
        </div>
      )}

      {readiness?.blockers?.length > 0 && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-950">Blocked by: {readiness.blockers.map(label).join(', ')}</p>}

      <div className="mt-6 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-black">Minimized rehearsal history</h3>
          <p className="mt-1 text-xs text-slate-500">Only internal run/timing/status fields are shown. Provider object IDs, raw evidence, hashes, secrets, payment data, and customer data are intentionally excluded.</p>
        </div>
        <button className="rounded-lg border px-3 py-2 text-sm font-bold" onClick={() => setLocalRefresh((value) => value + 1)}>Refresh</button>
      </div>

      {!loading && history.length === 0 ? <p className="mt-4 text-sm text-slate-500">No provider rehearsal evidence has been recorded.</p> : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b text-slate-500"><tr><th className="p-2">Run</th><th className="p-2">Completed</th><th className="p-2">Status</th><th className="p-2">Identity</th><th className="p-2">Recent</th><th className="p-2">Cleanup</th><th className="p-2">Action</th></tr></thead>
            <tbody>
              {history.map((run) => (
                <tr key={run.run_id} className="border-b align-top last:border-0">
                  <td className="p-2 font-mono">{run.run_id}</td>
                  <td className="p-2">{formatTime(run.completed_at)}</td>
                  <td className="p-2"><Pill ok={run.status === 'passed'}>{label(run.status)}</Pill>{run.failure_code && <div className="mt-1 text-slate-500">{label(run.failure_code)}</div>}</td>
                  <td className="p-2">{run.identity_verified ? 'verified' : 'not verified'}</td>
                  <td className="p-2">{run.is_recent ? 'yes' : 'no'}</td>
                  <td className="p-2">{run.cleanup_complete ? 'complete' : run.reconciled ? `reconciled ${formatTime(run.reconciled_at)}` : 'requires reconciliation'}</td>
                  <td className="p-2">
                    {run.status === 'cleanup_incomplete' && !run.reconciled ? (
                      <button disabled={busyRun === run.run_id} className="rounded-lg border px-3 py-2 font-bold disabled:opacity-50" onClick={() => reconcile(run.run_id)}>Record reconciliation</button>
                    ) : <span className="text-slate-400">No action</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
