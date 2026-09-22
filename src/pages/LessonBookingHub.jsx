import React from 'react';
import { Link } from 'react-router-dom';
import { getLessonBookingSupabaseStatus } from '@/lib/lessonBookingSupabase';

const BOOKING_LINKS = [
  {
    to: '/book-lessons',
    title: 'Browse lesson times',
    description: 'See the next available English lesson slots. Availability is read from Supabase when the preview connection is configured.',
  },
  {
    to: '/my-lessons',
    title: 'My lessons',
    description: 'Sign in securely to review existing bookings, cancellation options, and server-calculated policy outcomes.',
  },
];

export default function LessonBookingHub() {
  const connection = getLessonBookingSupabaseStatus();

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Lesson booking navigation">
          <Link
            to="/"
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            ← Smart Parrot home
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link to="/book-lessons" className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold hover:bg-white/10">
              Book lessons
            </Link>
            <Link to="/my-lessons" className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold hover:bg-white/10">
              My lessons
            </Link>
          </div>
        </nav>

        <header className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl sm:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-300">Lesson booking preview</p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">English lessons at Smart Parrot</h1>
          <p className="mt-4 max-w-3xl text-slate-300">
            The booking area is being connected to Smart Parrot’s server-authoritative lesson system. You can explore availability and your lesson area without changing the existing Smart Parrot homepage or learning routes.
          </p>
        </header>

        <section className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-5 sm:p-6" aria-label="Payment availability">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-black text-amber-100">Payments are not connected yet</p>
              <p className="mt-1 text-sm text-amber-50/85">
                No card details are collected on this page. Stripe payment actions remain unavailable until trusted server provider readiness is enabled.
              </p>
            </div>
            <span className="w-fit rounded-full border border-amber-200/30 bg-slate-950/40 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-amber-100">
              TEST / preview
            </span>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2" aria-label="Lesson booking options">
          {BOOKING_LINKS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group rounded-3xl border border-white/10 bg-white/5 p-6 transition hover:-translate-y-0.5 hover:border-amber-300/40 hover:bg-white/[0.07] sm:p-8"
            >
              <h2 className="text-xl font-black group-hover:text-amber-200">{item.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">{item.description}</p>
              <p className="mt-5 text-sm font-black text-amber-300">Continue →</p>
            </Link>
          ))}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300 sm:p-6" aria-label="Preview connection status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold text-white">Preview data connection</p>
              <p className="mt-1">
                {connection.configured
                  ? 'The browser has the expected Supabase publishable-key configuration. RLS and the signed-in user session remain authoritative for browser data access.'
                  : 'The preview Supabase browser connection is not configured, so booking data routes fail closed.'}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${connection.configured ? 'bg-emerald-400/15 text-emerald-200' : 'bg-slate-800 text-slate-300'}`}>
              {connection.configured ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
