import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';

const HeathrowPlayableSpine = lazy(() => import('@/game/heathrow/HeathrowPlayableSpine'));

const EXPERIENCE_STYLES = `
  .heathrow-experience-shell {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #020617;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  .heathrow-experience-shell *,
  .heathrow-experience-shell *::before,
  .heathrow-experience-shell *::after {
    -webkit-tap-highlight-color: transparent;
  }

  .heathrow-experience-shell canvas {
    display: block;
    width: 100% !important;
    height: 100% !important;
    image-rendering: auto;
    transform: translateZ(0);
    backface-visibility: hidden;
  }

  .heathrow-experience-shell button {
    touch-action: manipulation;
  }

  .heathrow-coach {
    animation: heathrow-coach-in 320ms ease-out both;
  }

  @keyframes heathrow-coach-in {
    from { opacity: 0; transform: translate(-50%, 8px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .heathrow-coach { animation: none; }
    .heathrow-experience-shell * { scroll-behavior: auto !important; }
  }
`;

function MissionLoading() {
  return (
    <main className="fixed inset-0 grid min-h-[100svh] place-items-center overflow-hidden bg-slate-950 px-6 text-center text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(56,189,248,.18),transparent_38%),radial-gradient(circle_at_50%_85%,rgba(250,204,21,.1),transparent_35%)]" />
      <div className="relative w-full max-w-sm">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] border border-white/15 bg-white/10 text-3xl shadow-2xl backdrop-blur-xl">🦜</div>
        <div className="mt-5 text-[10px] font-black tracking-[.24em] text-sky-300">LONDON · TERMINAL 5</div>
        <h1 className="mt-2 text-2xl font-black tracking-tight">Preparing Heathrow</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">Optimising the 3D scene and controls for this device.</p>

        <div className="mx-auto mt-6 h-2 w-full max-w-[260px] overflow-hidden rounded-full border border-white/10 bg-white/10 p-[2px]">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-sky-300 via-white to-amber-300" />
        </div>

        <div className="mx-auto mt-5 flex w-fit flex-wrap justify-center gap-2 text-[10px] font-black tracking-[.12em] text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5">MOVE</span>
          <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5">EXPLORE</span>
          <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5">INTERACT</span>
        </div>
      </div>
    </main>
  );
}

function HeathrowExperienceShell({ children }) {
  const shellRef = useRef(null);
  const [needsResume, setNeedsResume] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [renderDpr, setRenderDpr] = useState('');

  useEffect(() => {
    const showTimer = window.setTimeout(() => setShowCoach(true), 6800);
    const hideTimer = window.setTimeout(() => setShowCoach(false), 12800);

    const markPaused = () => setNeedsResume(true);
    const onVisibilityChange = () => {
      if (document.hidden) markPaused();
    };

    const syncRenderInfo = () => {
      const gameRoot = shellRef.current?.querySelector('[data-render-profile]');
      setRenderDpr(gameRoot?.getAttribute('data-render-dpr') || '');
    };

    const observer = new MutationObserver(syncRenderInfo);
    if (shellRef.current) {
      observer.observe(shellRef.current, {
        attributes: true,
        attributeFilter: ['data-render-dpr', 'data-render-profile'],
        childList: true,
        subtree: true,
      });
    }
    syncRenderInfo();

    window.addEventListener('blur', markPaused);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
      observer.disconnect();
      window.removeEventListener('blur', markPaused);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const resumeAdventure = () => {
    setNeedsResume(false);
    setShowCoach(false);
    window.requestAnimationFrame(() => {
      shellRef.current?.querySelector('[data-render-profile]')?.focus({ preventScroll: true });
    });
  };

  return (
    <div ref={shellRef} className="heathrow-experience-shell">
      <style>{EXPERIENCE_STYLES}</style>
      {children}

      {showCoach && !needsResume && (
        <div className="heathrow-coach pointer-events-none absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex max-w-[88vw] -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-slate-950/78 px-3 py-2 text-[9px] font-black tracking-[.12em] text-white shadow-2xl backdrop-blur-xl sm:bottom-5 sm:px-4 sm:text-[10px]">
          <span className="text-amber-300">MOVE</span>
          <span className="text-white/35">•</span>
          <span>EXPLORE</span>
          <span className="text-white/35">•</span>
          <span>INTERACT</span>
          <span className="ml-1 rounded-full bg-sky-300/15 px-2 py-1 text-sky-200">{renderDpr ? `HD ${renderDpr}×` : 'ADAPTIVE HD'}</span>
        </div>
      )}

      {needsResume && (
        <div className="absolute inset-0 z-[80] grid place-items-center bg-slate-950/55 px-6 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-[28px] border border-white/20 bg-slate-950/92 p-6 text-center text-white shadow-2xl">
            <div className="text-3xl">🦜</div>
            <h2 className="mt-3 text-xl font-black">Ready to continue?</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">Tap below to restore game focus and controls.</p>
            <button
              type="button"
              onClick={resumeAdventure}
              className="mt-5 min-h-12 w-full rounded-full bg-amber-300 px-5 py-3 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(250,204,21,.28)] transition active:scale-[0.98]"
            >
              Resume adventure
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LondonMission() {
  return (
    <HeathrowExperienceShell>
      <Suspense fallback={<MissionLoading />}>
        <HeathrowPlayableSpine />
      </Suspense>
    </HeathrowExperienceShell>
  );
}
