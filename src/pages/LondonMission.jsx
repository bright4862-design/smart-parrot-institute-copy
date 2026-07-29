import React, { lazy, Suspense } from 'react';

const HeathrowPlayableSpine = lazy(() => import('@/game/heathrow/HeathrowPlayableSpine'));

function MissionLoading() {
  return (
    <main className="grid h-screen h-[100dvh] min-h-[560px] place-items-center bg-slate-950 px-6 text-center text-white">
      <div>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-white/15 bg-white/10 text-3xl shadow-2xl">🦜</div>
        <h1 className="mt-5 text-xl font-black">Preparing Heathrow Terminal 5</h1>
        <p className="mt-2 text-sm font-semibold text-slate-300">Loading the mobile-friendly 3D mission…</p>
        <div className="mx-auto mt-5 h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-amber-300" />
        </div>
      </div>
    </main>
  );
}

export default function LondonMission() {
  return (
    <Suspense fallback={<MissionLoading />}>
      <HeathrowPlayableSpine />
    </Suspense>
  );
}
