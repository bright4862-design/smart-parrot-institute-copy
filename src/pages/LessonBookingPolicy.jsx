import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPolicyVersion } from '@/lib/lessonBookingApi';
import { getLessonBookingSupabaseClient, getLessonBookingSupabaseStatus } from '@/lib/lessonBookingSupabase';

export default function LessonBookingPolicy() {
  const { policyVersionId = '' } = useParams();
  const client = useMemo(() => getLessonBookingSupabaseClient(), []);
  const configStatus = useMemo(() => getLessonBookingSupabaseStatus(), []);
  const [policy, setPolicy] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(client));

  useEffect(() => {
    if (!client || !policyVersionId) {
      setIsLoading(false);
      return undefined;
    }
    let active = true;
    setIsLoading(true);
    setError(null);
    getPolicyVersion(client, policyVersionId)
      .then((row) => { if (active) setPolicy(row); })
      .catch((nextError) => { if (active) setError(nextError); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [client, policyVersionId]);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-300">Lesson policy</p>
              <h1 className="mt-3 text-3xl font-black">Versioned booking terms</h1>
              <p className="mt-3 max-w-2xl text-slate-300">This page reads the immutable policy version stored by the booking system. It does not substitute newer terms for an older booking.</p>
            </div>
            <Link to="/my-lessons" className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold hover:bg-white/10">My lessons</Link>
          </div>
        </header>

        {!configStatus.configured ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-slate-300">Supabase preview configuration is not available.</section>
        ) : isLoading ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-slate-300">Loading policy version…</section>
        ) : error ? (
          <section className="rounded-3xl border border-rose-300/20 bg-rose-300/10 p-8 text-rose-100">{error.message || 'Policy version could not be loaded.'}</section>
        ) : policy ? (
          <>
            <section className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 text-sm sm:grid-cols-3 sm:p-8">
              <div><p className="text-slate-400">Policy version</p><p className="mt-1 break-words font-bold">{policy.id}</p></div>
              <div><p className="text-slate-400">Published</p><p className="mt-1 font-bold">{new Date(policy.published_at).toLocaleString()}</p></div>
              <div><p className="text-slate-400">Terms hash</p><p className="mt-1 break-all font-mono text-xs">{policy.terms_sha256}</p></div>
            </section>
            <article className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
              <div className="whitespace-pre-wrap text-sm leading-7 text-slate-200">{policy.terms_markdown}</div>
            </article>
          </>
        ) : null}
      </div>
    </main>
  );
}
