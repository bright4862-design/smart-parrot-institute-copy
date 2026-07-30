import React, { lazy, Suspense } from 'react';

const PiccadillyPlayableSpine = lazy(() => import('@/game/piccadilly/PiccadillyPlayableSpine'));

function PiccadillyLoading() {
  return (
    <main className="fixed inset-0 grid min-h-[100svh] place-items-center overflow-hidden bg-slate-950 px-6 text-center text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(59,130,246,.2),transparent_38%)]" />
      <div className="relative w-full max-w-sm">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] border border-white/15 bg-white/10 text-3xl shadow-2xl backdrop-blur-xl">🚇</div>
        <div className="mt-5 text-[10px] font-black tracking-[.24em] text-blue-300">LONDON · PICCADILLY MAP</div>
        <h1 className="mt-2 text-2xl font-black tracking-tight">Preparing Piccadilly Line</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">Loading the separate map safely.</p>
      </div>
    </main>
  );
}

export default function PiccadillyMission() {
  return (
    <Suspense fallback={<PiccadillyLoading />}>
      <PiccadillyPlayableSpine />
    </Suspense>
  );
}
