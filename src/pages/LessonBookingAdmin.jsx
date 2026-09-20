import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LessonBookingAuthProvider, useLessonBookingAuth } from '@/lib/LessonBookingAuthContext';
import {
  acknowledgeAdminAlert,
  addAdminReviewNote,
  claimAdminReviewCase,
  exportAdminBookingEvidence,
  listAdminReviewQueue,
  openAdminReviewCase,
  resolveAdminReviewCase,
} from '@/lib/lessonBookingApi';

const severityClass = {
  urgent: 'border-red-300 bg-red-50 text-red-900',
  high: 'border-amber-300 bg-amber-50 text-amber-950',
  normal: 'border-slate-200 bg-white text-slate-900',
};

function AdminContent() {
  const { client, configStatus, isAuthenticated, isLoading: authLoading, user, sendMagicLink, signOut } = useLessonBookingAuth();
  const [email, setEmail] = useState('');
  const [items, setItems] = useState([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState('');
  const [evidence, setEvidence] = useState(null);

  useEffect(() => {
    if (!client || !isAuthenticated) {
      setItems([]);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    listAdminReviewQueue(client)
      .then((rows) => { if (active) setItems(rows); })
      .catch((err) => {
        if (!active) return;
        const message = err?.message || 'Could not load the operations queue.';
        setError(message.includes('admin_required') ? 'Admin access is required for this page.' : message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, isAuthenticated, refreshKey]);

  const run = async (key, action, success) => {
    setBusy(key);
    setNotice('');
    setError('');
    try {
      await action();
      setNotice(success);
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err?.message || 'Admin action failed.');
    } finally {
      setBusy('');
    }
  };

  const signIn = async (event) => {
    event.preventDefault();
    setNotice('');
    setError('');
    try {
      await sendMagicLink(email);
      setNotice('Check your email for the secure admin sign-in link.');
    } catch (err) {
      setError(err?.message || 'Could not send the sign-in link.');
    }
  };

  if (!client) {
    return <main className="mx-auto max-w-3xl p-8"><h1 className="text-2xl font-black">Lesson operations</h1><p className="mt-3 text-slate-600">Supabase booking configuration is not available in this build.</p><pre className="mt-4 rounded bg-slate-100 p-3 text-xs">{JSON.stringify(configStatus, null, 2)}</pre></main>;
  }

  if (authLoading) return <main className="p-8 text-center">Loading secure lesson operations…</main>;

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-black">Lesson operations</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in with the Smart Parrot Supabase account that has the admin role.</p>
        <form onSubmit={signIn} className="mt-6 space-y-3">
          <input className="w-full rounded-xl border p-3" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" />
          <button className="w-full rounded-xl bg-slate-950 px-4 py-3 font-bold text-white">Send secure sign-in link</button>
        </form>
        {notice && <p className="mt-4 text-sm text-emerald-700">{notice}</p>}
        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-5 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Smart Parrot Institute</p>
          <h1 className="text-3xl font-black text-slate-950">Lesson operations</h1>
          <p className="mt-1 text-sm text-slate-600">Review-only tooling. This UI cannot submit, accept, or close a Stripe dispute.</p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-lg border px-3 py-2 text-sm font-bold" to="/my-lessons">My lessons</Link>
          <button className="rounded-lg border px-3 py-2 text-sm font-bold" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        Signed in as <strong>{user?.email || user?.id}</strong>. Authority is re-checked by every Supabase admin RPC; this browser never receives a secret/service-role key.
      </div>
      {notice && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-xl font-black">Review queue</h2>
        <button className="rounded-lg border px-3 py-2 text-sm font-bold" onClick={() => setRefreshKey((v) => v + 1)}>Refresh</button>
      </div>

      {loading ? <p className="mt-6">Loading queue…</p> : items.length === 0 ? <p className="mt-6 text-slate-600">No current review items.</p> : (
        <div className="mt-4 space-y-4">
          {items.map((item, index) => {
            const key = item.review_case_id || `${item.source}-${item.booking_id || index}`;
            const manual = Boolean(item.review_case_id);
            const canAcknowledge = !manual && Boolean(item.booking_id) && ['payment_hold','settlement_error','cancellation_error','compliance_delivery'].includes(item.source);
            return (
              <article key={key} className={`rounded-2xl border p-5 ${severityClass[item.severity] || severityClass.normal}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2 text-xs font-black uppercase tracking-wide"><span>{item.severity}</span><span>•</span><span>{item.category}</span><span>•</span><span>{item.source}</span></div>
                    <h3 className="mt-2 font-bold">{item.summary}</h3>
                    <p className="mt-1 text-xs opacity-75">Booking: {item.booking_id || 'unmatched provider event'} · {item.occurred_at ? new Date(item.occurred_at).toLocaleString() : 'time unavailable'}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {!manual && item.booking_id && (
                    <button disabled={busy===key} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white disabled:opacity-50" onClick={() => run(key, () => openAdminReviewCase(client, { bookingId:item.booking_id, kind:item.category==='dispute'?'dispute':'other', reason:item.summary, priority:item.severity }), 'Review case opened.')}>Open case</button>
                  )}
                  {manual && (
                    <>
                      <button disabled={busy===key} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white disabled:opacity-50" onClick={() => run(key, () => claimAdminReviewCase(client, item.review_case_id), 'Case claimed with a short lease.')}>Claim</button>
                      <button disabled={busy===key} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold" onClick={() => { const note=window.prompt('Add an internal note'); if (note) run(key, () => addAdminReviewNote(client, item.review_case_id, note), 'Note added.'); }}>Add note</button>
                      <button disabled={busy===key} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold" onClick={() => { const resolution=window.prompt('Resolution summary'); if (resolution) run(key, () => resolveAdminReviewCase(client, item.review_case_id, resolution), 'Case resolved internally.'); }}>Resolve internally</button>
                    </>
                  )}
                  {canAcknowledge && <button disabled={busy===key} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold" onClick={() => run(key, () => acknowledgeAdminAlert(client, { source:item.source, bookingId:item.booking_id, snoozeMinutes:30 }), 'Alert acknowledged for 30 minutes; it will reappear if the condition persists.')}>Acknowledge 30m</button>}
                  {item.booking_id && <button disabled={busy===key} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold" onClick={() => run(key, async () => { const packet=await exportAdminBookingEvidence(client, item.booking_id, item.category==='dispute'?'payment_dispute':'customer_support'); setEvidence(packet); }, 'Minimized evidence packet generated and access logged.')}>View evidence</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {evidence && (
        <section className="mt-8 rounded-2xl border bg-slate-950 p-5 text-slate-100">
          <div className="flex items-center justify-between gap-3"><h2 className="font-black">Minimized evidence packet</h2><button className="text-sm underline" onClick={() => setEvidence(null)}>Close</button></div>
          <p className="mt-2 text-xs text-slate-400">Generated by a purpose-limited audited RPC. Do not paste this into Stripe automatically.</p>
          <pre className="mt-4 max-h-[32rem] overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(evidence, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}

export default function LessonBookingAdmin() {
  return <LessonBookingAuthProvider><AdminContent /></LessonBookingAuthProvider>;
}
