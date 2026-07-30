import React, { lazy, Suspense } from 'react';
const LondonCafePlayable = lazy(() => import('@/game/cafe/LondonCafePlayable'));
function Loading() { return <main className="fixed inset-0 grid place-items-center bg-slate-950 text-white"><div className="text-center"><div className="text-5xl">☕</div><h1 className="mt-4 text-2xl font-black">Opening the London café</h1><p className="mt-2 text-sm font-semibold text-slate-300">Preparing the menu, barista, and payment challenge.</p></div></main>; }
export default function CafeMission() { return <Suspense fallback={<Loading />}><LondonCafePlayable /></Suspense>; }
