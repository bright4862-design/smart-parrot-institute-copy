import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LessonBookingAuthProvider, useLessonBookingAuth } from '@/lib/LessonBookingAuthContext';
import { listMyLessons, requestBookingCancellation } from '@/lib/lessonBookingApi';

function formatMoney(cents, currency = 'eur') {
  if (!Number.isInteger(cents)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: String(currency).toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${String(currency).toUpperCase()}`;
  }
}

function noticeText(compliance) {
  switch (compliance?.state) {
    case 'delivered': return 'Your confirmation has been delivered.';
    case 'retrying': return 'Your confirmation is queued and delivery is being retried.';
    case 'needs_attention': return 'Your confirmation needs delivery support. The cancellation itself remains recorded.';
    case 'queued': return 'Your confirmation is queued for delivery.';
    default: return null;
  }
}

function MyLessonsContent() {
  const {
    client,
    configStatus,
    user,
    isAuthenticated,
    isLoading: isLoadingAuth,
    error: authError,
    sendMagicLink,
    signOut,
  } = useLessonBookingAuth();
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [lessons, setLessons] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmation, setConfirmation] = useState(null);
  const [declarationName, setDeclarationName] = useState('');
  const [receiptEmail, setReceiptEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!client || !isAuthenticated) {
      setLessons([]);
      return undefined;
    }
    let active = true;
    setIsLoading(true);
    setLoadError(null);
    listMyLessons(client)
      .then((rows) => { if (active) setLessons(rows); })
      .catch((error) => { if (active) setLoadError(error); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [client, isAuthenticated, refreshKey]);

  const withdrawalCount = useMemo(
    () => lessons.filter((lesson) => lesson.actions?.withdrawal?.eligible).length,
    [lessons],
  );

  const handleMagicLink = async (event) => {
    event.preventDefault();
    setNotice('');
    try {
      await sendMagicLink(email);
      setNotice('Check your email for the secure sign-in link.');
    } catch (error) {
      setNotice(error.message || 'Could not send the sign-in link.');
    }
  };

  const openConfirmation = (lesson, kind) => {
    setConfirmation({ lesson, kind });
    setNotice('');
    if (kind === 'withdrawal') {
      setDeclarationName(String(user?.user_metadata?.full_name ?? '').trim());
      setReceiptEmail(String(user?.email ?? '').trim());
    }
  };

  const closeConfirmation = () => {
    if (isSubmitting) return;
    setConfirmation(null);
  };

  const handleConfirm = async () => {
    if (!confirmation || !client) return;
    setIsSubmitting(true);
    setNotice('');
    try {
      await requestBookingCancellation(client, {
        bookingId: confirmation.lesson.id,
        kind: confirmation.kind,
        declarationName,
        receiptEmail,
      });
      setConfirmation(null);
      setNotice(confirmation.kind === 'withdrawal'
        ? 'Your withdrawal declaration was recorded. Confirmation delivery status will appear below.'
        : 'Your lesson cancellation was recorded.');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setNotice(error.message || 'The request could not be completed. Please retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!configStatus.configured) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
        <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-8">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-300">My lessons</p>
          <h1 className="mt-3 text-3xl font-black">Supabase connection not configured</h1>
          <p className="mt-4 text-slate-300">Add the preview Supabase URL and publishable key to use this isolated booking area.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-300">Lesson booking</p>
              <h1 className="mt-3 text-3xl font-black">My lessons</h1>
              <p className="mt-3 max-w-2xl text-slate-300">
                Cancellation charges and withdrawal eligibility shown here come from the server using the policy version accepted for each booking.
              </p>
            </div>
            <div className="flex gap-3">
              <Link className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold hover:bg-white/10" to="/book-lessons">Book a lesson</Link>
              {isAuthenticated && (
                <button type="button" onClick={() => signOut().catch((error) => setNotice(error.message))} className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold hover:bg-white/10">Sign out</button>
              )}
            </div>
          </div>
          {withdrawalCount > 0 && (
            <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
              Online withdrawal is currently available for {withdrawalCount} {withdrawalCount === 1 ? 'booking' : 'bookings'}. Use the clearly labelled “Exercise withdrawal right” action on that booking.
            </div>
          )}
        </header>

        {!isAuthenticated && !isLoadingAuth && (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <h2 className="text-xl font-black">Sign in to manage your lessons</h2>
            <form onSubmit={handleMagicLink} className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@example.com" className="min-h-12 flex-1 rounded-2xl border border-white/15 bg-slate-900 px-4 text-white outline-none ring-amber-300 focus:ring-2" />
              <button type="submit" className="min-h-12 rounded-2xl bg-amber-300 px-5 font-black text-slate-950 hover:bg-amber-200">Email sign-in link</button>
            </form>
          </section>
        )}

        {(notice || authError || loadError) && (
          <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
            {notice || authError?.message || loadError?.message}
          </div>
        )}

        {isAuthenticated && (
          <section className="space-y-4">
            {isLoading ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-slate-300">Loading your lessons…</div>
            ) : lessons.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-slate-300">You do not have any lesson bookings yet.</div>
            ) : lessons.map((lesson) => {
              const cancel = lesson.actions?.cancellation;
              const withdrawal = lesson.actions?.withdrawal;
              const complianceMessage = noticeText(lesson.compliance);
              return (
                <article key={lesson.id} className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{lesson.status.replaceAll('_', ' ')}</p>
                      <h2 className="mt-2 text-xl font-black">{lesson.lessonType?.name ?? 'English lesson'}</h2>
                      <p className="mt-2 text-slate-300">{new Date(lesson.starts_at).toLocaleString()} – {new Date(lesson.ends_at).toLocaleTimeString()}</p>
                    </div>
                    <Link to={`/lesson-booking-policy/${encodeURIComponent(lesson.policy_version_id)}`} className="text-sm font-bold text-amber-300 underline decoration-amber-300/50 underline-offset-4">Policy {lesson.policy_version_id}</Link>
                  </div>

                  {lesson.status === 'cancelled' ? (
                    <div className="mt-5 rounded-2xl bg-slate-900/70 p-4 text-sm text-slate-300">
                      <p>Outcome: {lesson.outcome?.replaceAll('_', ' ') ?? 'cancelled'}{Number.isInteger(lesson.final_amount_cents) ? ` · Final charge ${formatMoney(lesson.final_amount_cents, lesson.currency)}` : ''}</p>
                      {complianceMessage && <p className="mt-2 text-amber-200">{complianceMessage}</p>}
                    </div>
                  ) : (
                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                        <h3 className="font-black">Cancel lesson</h3>
                        {cancel?.eligible ? (
                          <>
                            <p className="mt-2 text-sm text-slate-300">Server-calculated cancellation charge: <strong>{formatMoney(cancel.amount_cents, lesson.currency)}</strong>.</p>
                            <button type="button" onClick={() => openConfirmation(lesson, 'cancel')} className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-950 hover:bg-slate-200">Cancel lesson</button>
                          </>
                        ) : (
                          <p className="mt-2 text-sm text-slate-400">Cancellation is not currently available{cancel?.reason ? ` (${cancel.reason.replaceAll('_', ' ')})` : ''}.</p>
                        )}
                      </div>

                      {withdrawal?.eligible && (
                        <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4">
                          <h3 className="font-black text-amber-100">Online withdrawal</h3>
                          <p className="mt-2 text-sm text-amber-50/90">This booking’s accepted policy currently enables the online withdrawal flow. The server confirms the applicable window.</p>
                          <button type="button" onClick={() => openConfirmation(lesson, 'withdrawal')} className="mt-4 rounded-xl bg-amber-300 px-4 py-2 text-sm font-black text-slate-950 hover:bg-amber-200">Exercise withdrawal right</button>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}
      </div>

      {confirmation && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/85 p-4" role="dialog" aria-modal="true" aria-labelledby="booking-action-title">
          <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <h2 id="booking-action-title" className="text-2xl font-black">
              {confirmation.kind === 'withdrawal' ? 'Confirm withdrawal' : 'Confirm cancellation'}
            </h2>
            <p className="mt-3 text-sm text-slate-300">
              {confirmation.kind === 'withdrawal'
                ? 'You are submitting an online withdrawal declaration for this booking. A durable-medium acknowledgement must be delivered separately.'
                : `The server-calculated charge for this cancellation is ${formatMoney(confirmation.lesson.actions?.cancellation?.amount_cents, confirmation.lesson.currency)}.`}
            </p>

            {confirmation.kind === 'withdrawal' && (
              <div className="mt-5 space-y-4">
                <label className="block text-sm font-bold">
                  Name on declaration
                  <input value={declarationName} onChange={(event) => setDeclarationName(event.target.value)} maxLength={200} required className="mt-2 min-h-12 w-full rounded-2xl border border-white/15 bg-slate-950 px-4 font-normal text-white outline-none ring-amber-300 focus:ring-2" />
                </label>
                <label className="block text-sm font-bold">
                  Email for acknowledgement
                  <input type="email" value={receiptEmail} onChange={(event) => setReceiptEmail(event.target.value)} maxLength={320} required className="mt-2 min-h-12 w-full rounded-2xl border border-white/15 bg-slate-950 px-4 font-normal text-white outline-none ring-amber-300 focus:ring-2" />
                </label>
                <p className="text-xs text-slate-400">The booking ID and accepted policy version are already linked server-side to your authenticated account.</p>
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" disabled={isSubmitting} onClick={closeConfirmation} className="rounded-xl border border-white/20 px-4 py-2 text-sm font-bold disabled:opacity-50">Go back</button>
              <button type="button" disabled={isSubmitting} onClick={handleConfirm} className="rounded-xl bg-amber-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-50">
                {isSubmitting ? 'Submitting…' : confirmation.kind === 'withdrawal' ? 'Confirm withdrawal' : 'Confirm cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function MyLessons() {
  return (
    <LessonBookingAuthProvider>
      <MyLessonsContent />
    </LessonBookingAuthProvider>
  );
}
