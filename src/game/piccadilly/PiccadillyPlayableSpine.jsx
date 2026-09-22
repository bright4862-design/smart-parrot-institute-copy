import React, { useEffect, useMemo, useReducer } from 'react';
import {
  INITIAL_PICCADILLY_STATE,
  loadPiccadillyRecoveryCache,
  piccadillyObjectiveCopy,
  reducePiccadillyMission,
  savePiccadillyRecoveryCache,
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
import {
  getPiccadillyReleaseReadiness,
  PICCADILLY_CANONICAL_ROUTE,
  PICCADILLY_LEVEL_ID,
  PICCADILLY_LEVEL_VERSION,
  PICCADILLY_REGISTRY_POLICY,
} from './levelDefinition';
import {
  getPiccadillyPersistenceReadiness,
  PICCADILLY_PERSISTENCE_POLICY,
} from './persistenceContract';

/**
 * Piccadilly map integration boundary.
 *
 * This component intentionally contains no local camera, renderer, input, NPC,
 * interaction, audio, authentication or cloud-persistence runtime. Piccadilly
 * owns map data and experience rules; shared-platform systems remain the
 * implementation dependency.
 */
export default function PiccadillyPlayableSpine() {
  const [mission, dispatch] = useReducer(
    reducePiccadillyMission,
    INITIAL_PICCADILLY_STATE,
    loadPiccadillyRecoveryCache,
  );
  const dependencies = useMemo(getPiccadillyDependencySummary, []);
  const persistence = useMemo(getPiccadillyPersistenceReadiness, []);
  const release = useMemo(getPiccadillyReleaseReadiness, []);

  useEffect(() => {
    savePiccadillyRecoveryCache(mission);
  }, [mission]);

  return (
    <main
      data-map="piccadilly-line"
      data-level-id={PICCADILLY_LEVEL_ID}
      data-level-version={PICCADILLY_LEVEL_VERSION}
      data-canonical-route={PICCADILLY_CANONICAL_ROUTE}
      data-registry-status={PICCADILLY_REGISTRY_POLICY.status}
      data-render-profile="foundation"
      data-shared-runtime-status="awaiting-integration"
      data-persistence-authority={PICCADILLY_PERSISTENCE_POLICY.authority}
      data-local-cache-authoritative={String(PICCADILLY_PERSISTENCE_POLICY.localStorage.authoritative)}
      data-feature-branch-production-deploy="blocked"
      data-ios-status={PICCADILLY_MOBILE_ACCEPTANCE.ios.status}
      data-android-status={PICCADILLY_MOBILE_ACCEPTANCE.android.status}
      tabIndex={-1}
      className="fixed inset-0 min-h-[100svh] overflow-hidden bg-slate-950 text-white outline-none"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(30,64,175,.35),transparent_36%),linear-gradient(to_bottom,#020617,#0f172a)]" />

      <section className="relative z-10 flex min-h-[100svh] items-center justify-center px-5 py-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="w-full max-w-3xl rounded-[30px] border border-white/15 bg-slate-950/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="text-[10px] font-black tracking-[.24em] text-blue-300">PICCADILLY MAP · {PICCADILLY_LEVEL_ID}</div>
          <h1 className="mt-3 text-3xl font-black tracking-tight">Shared-platform integration boundary</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
            Piccadilly owns its station map, mission and transport behaviour. Routing, persistence, authentication, camera, rendering, NPCs, interactions, audio and mobile performance remain shared-platform responsibilities.
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
              <div className="text-xl font-black">{release.requiredAssetCount}</div>
              <div className="mt-1 text-[9px] font-black tracking-[.12em] text-slate-400">REQUIRED ASSET KEYS</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-center">
              <div className="text-xl font-black">{release.smokeStepCount}</div>
              <div className="mt-1 text-[9px] font-black tracking-[.12em] text-slate-400">SMOKE ACTIONS</div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-[10px] font-black tracking-[.18em] text-slate-400">PLATFORM STATUS</div>
              <p className="mt-2 text-sm font-bold text-slate-200">Route: {PICCADILLY_CANONICAL_ROUTE}</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">Registry: {release.registryStatus}</p>
              <p className="text-xs font-semibold leading-5 text-slate-400">Feature-branch production deploy: blocked</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-[10px] font-black tracking-[.18em] text-slate-400">PERSISTENCE STATUS</div>
              <p className="mt-2 text-sm font-bold text-slate-200">Authority: {persistence.authority}</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">Adoption: {persistence.adoptionStatus}</p>
              <p className="text-xs font-semibold leading-5 text-slate-400">LocalStorage: recovery cache only · not synchronized</p>
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
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2">{dependencies.sharedOwned} SHARED SYSTEMS</span>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2">{dependencies.localRuntimeDuplicatesAllowed} LOCAL DUPLICATES</span>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2">{persistence.blockingDependencies} PLATFORM DEPENDENCIES</span>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2">IOS TEST PENDING</span>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2">ANDROID TEST PENDING</span>
          </div>

          <button
            type="button"
            onClick={() => dispatch({ type: 'RESET' })}
            className="mt-6 min-h-12 rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-black transition active:scale-[0.98]"
          >
            Reset local recovery cache
          </button>
        </div>
      </section>
    </main>
  );
}
