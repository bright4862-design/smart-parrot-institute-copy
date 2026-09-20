import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LessonBookingAuthProvider, useLessonBookingAuth } from '@/lib/LessonBookingAuthContext';
import { listAvailableLessonSlots } from '@/lib/lessonBookingApi';

function LessonBookingContent() {
  const [searchParams] = useSearchParams();
  const lessonTypeId = searchParams.get('lesson_type_id') ?? '';
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
  const [slots, setSlots] = useState([]);
  const [slotError, setSlotError] = useState(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  const range = useMemo(() => {
    const from = new Date();
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { from, to };
  }, []);

  useEffect(() => {
    let active = true;

    if (!client || !lessonTypeId) {
      setSlots([]);
      setSlotError(null);
      return undefined;
    }

    setIsLoadingSlots(true);
    listAvailableLessonSlots(client, {
      lessonTypeId,
      from: range.from,
      to: range.to,
    })
      .then((nextSlots) => {
        if (!active) return;
        setSlots(nextSlots);
        setSlotError(null);
      })
      .catch((error) => {
        if (!active) return;
        setSlots([]);
        setSlotError(error);
      })
      .finally(() => {
        if (active) setIsLoadingSlots(false);
      });

    return () => {
      active = false;
    };
  }, [client, lessonTypeId, range]);

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

  if (!configStatus.configured) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
        <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-300">Lesson booking preview</p>
          <h1 className="mt-3 text-3xl font-black">Supabase connection not configured</h1>
          <p className="mt-4 text-slate-300">
            This route is intentionally isolated from the existing Smart Parrot app. Add
            VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the preview environment to enable it.
          </p>
          <p className="mt-4 text-sm text-slate-400">Configuration status: {configStatus.reason}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-300">Lesson booking preview</p>
          <h1 className="mt-3 text-3xl font-black">English lesson availability</h1>
          <p className="mt-3 max-w-2xl text-slate-300">
            This preview only reads available slots. It cannot create bookings, charge cards, or modify payment data.
          </p>
        </header>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">Student session</h2>
              <p className="mt-1 text-sm text-slate-400">
                {isLoadingAuth
                  ? 'Checking your lesson-booking session…'
                  : isAuthenticated
                    ? `Signed in as ${user?.email ?? 'student'}`
                    : 'Sign in with a Supabase magic link when you are ready to book.'}
              </p>
            </div>
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => signOut().catch((error) => setNotice(error.message))}
                className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold hover:bg-white/10"
              >
                Sign out
              </button>
            )}
          </div>

          {!isAuthenticated && !isLoadingAuth && (
            <form onSubmit={handleMagicLink} className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                placeholder="you@example.com"
                className="min-h-12 flex-1 rounded-2xl border border-white/15 bg-slate-900 px-4 text-white outline-none ring-amber-300 focus:ring-2"
              />
              <button
                type="submit"
                className="min-h-12 rounded-2xl bg-amber-300 px-5 font-black text-slate-950 hover:bg-amber-200"
              >
                Email sign-in link
              </button>
            </form>
          )}

          {(notice || authError) && (
            <p className="mt-4 text-sm text-amber-200">{notice || authError?.message}</p>
          )}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-xl font-black">Next 7 days</h2>
          {!lessonTypeId ? (
            <p className="mt-3 text-slate-300">
              Add a lesson type UUID with <code>?lesson_type_id=&lt;uuid&gt;</code> to preview available slots.
            </p>
          ) : isLoadingSlots ? (
            <p className="mt-3 text-slate-300">Loading availability…</p>
          ) : slotError ? (
            <p className="mt-3 text-rose-300">{slotError.message || 'Availability could not be loaded.'}</p>
          ) : slots.length === 0 ? (
            <p className="mt-3 text-slate-300">No available slots were returned for this lesson type.</p>
          ) : (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {slots.map((slot) => (
                <li key={`${slot.start}-${slot.end}`} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                  <p className="font-bold">{new Date(slot.start).toLocaleString()}</p>
                  <p className="mt-1 text-sm text-slate-400">Ends {new Date(slot.end).toLocaleTimeString()}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

export default function LessonBooking() {
  return (
    <LessonBookingAuthProvider>
      <LessonBookingContent />
    </LessonBookingAuthProvider>
  );
}
