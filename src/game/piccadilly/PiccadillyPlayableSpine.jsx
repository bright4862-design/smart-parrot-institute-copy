import React, { useEffect, useMemo, useReducer } from 'react';
import {
  INITIAL_PICCADILLY_STATE,
  loadPiccadillyCheckpoint,
  piccadillyObjectiveCopy,
  reducePiccadillyMission,
  savePiccadillyCheckpoint,
} from './missionState';
import {
  PICCADILLY_CROWD_BUDGETS,
  PICCADILLY_FEATURED_NPCS,
} from './npcPopulation';
import {
  getPiccadillyDependencySummary,
  PICCADILLY_EXPERIENCE_FOCUS,
  PICCADILLY_MOBILE_ACCEPTANCE,
} from './mapContract';

/**
 * Piccadilly map integration boundary.
 *
 * This component intentionally contains no local camera, renderer, input, NPC,
 * interaction or audio runtime. Piccadilly owns map data and experience rules;
 * shared-engine systems remain the implementation dependency.
 */
export default function PiccadillyPlayableSpine() {
  const [mission, dispatch] = useReducer(
    reducePiccadillyMission,
    INITIAL_PICCADILLY_STATE,
    loadPiccadillyCheckpoint,
  );
  const dependencies = useMemo(getPiccadillyDependencySummary, []);

  useEffect(() => {
    savePiccadillyCheckpoint(mission);
  }, [mission]);

  return (
    <main
      data-map="piccadilly-line"
      data-render-profile="foundation"
      data-shared-runtime-status="awaiting-integration"
      data-ios-status={PICCADILLY_MOBILE_ACCEPTANCE.ios.status}
      data-android-status={PICCADILLY_MOBILE_ACCEPTANCE.android.status}
      tabIndex={-1}
      className="fixed inset-0 min-h-[100svh] overflow-hidden bg-slate-950 text-white outline-none"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(30,64,175,.35),transparent_36%),linear-gradient(to_bottom,#020617,#0f172a)]" />

      <section className="relative z-10 flex min-h-[100svh] items-center justify-center px-5 py-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="w-full max-w-2xl rounded-[30px] border border-white/15 bg-slate-950/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="text-[10px] font-black tracking-[.24em] text-blue-300">PICCADILLY MAP · LONDON UNDERGROUND</div>
          <h1 className="mt-3 text-3xl font-black tracking-tight">Shared-engine integration boundary</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
            Piccadilly owns its map, mission and station behaviour. Camera, rendering, NPCs, interactions, audio and mobile performance remain shared-engine dependencies.
          </p>

          <div className="mt-6 rounded-2xl border border-blue-300/20 bg-blue-300/10 p-4">
            <div className="text-[10px] font-black tracking-[.18em] text-blue-200">CURRENT OBJECTIVE</div>
            <p className="mt-2 text-base font-bold leading-6">{piccadillyObjectiveCopy(mission.step)}</p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-center">
              <div className="text-xl font-black">{PICCADILLY_FEATURED_NPCS.length}</div>
              <div className="mt-1 text-[9px] font-black tracking-[.12em] text-slate-400">FEATURED NPC DATA</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-center">
              <div className="text-xl font-black">{PICCADILLY_CROWD_BUDGETS.performance}</div>
              <div className="mt-1 text-[9px] font-black tracking-[.12em] text-slate-400">PERFORMANCE CROWD</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-center">
              <div className="text-xl font-black">{dependencies.sharedOwned}</div>
              <div className="mt-1 text-[9px] font-black tracking-[.12em] text-slate-400">SHARED SYSTEMS</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-center">
              <div className="text-xl font-black">{dependencies.localRuntimeDuplicatesAllowed}</div>
              <div className="mt-1 text-[9px] font-black tracking-[.12em] text-slate-400">LOCAL DUPLICATES</div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[10px] font-black tracking-[.18em] text-slate-400">PICCADILLY EXPERIENCE FOCUS</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {PICCADILLY_EXPERIENCE_FOCUS.map((focus) => (
                <span key={focus} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-[9px] font-black tracking-[.08em] text-slate-300">
                  {focus.replaceAll('-', ' ').toUpperCase()}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-black tracking-[.12em] text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2">SEPARATE MAP</span>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2">DATA-DRIVEN NPC ACTIVITY</span>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2">IOS TEST PENDING INTEGRATION</span>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2">ANDROID TEST PENDING INTEGRATION</span>
          </div>

          <button
            type="button"
            onClick={() => dispatch({ type: 'RESET' })}
            className="mt-6 min-h-12 rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-black transition active:scale-[0.98]"
          >
            Reset Piccadilly checkpoint
          </button>
        </div>
      </section>
    </main>
  );
}
