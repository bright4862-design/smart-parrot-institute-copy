import { Gauge, Sparkles, Zap } from 'lucide-react';
import {
  RENDER_PROFILE_MODES,
  RENDER_PROFILE_OPTIONS,
} from './renderProfiles';

const ICONS = Object.freeze({
  [RENDER_PROFILE_MODES.AUTO]: Gauge,
  [RENDER_PROFILE_MODES.HD]: Sparkles,
  [RENDER_PROFILE_MODES.PERFORMANCE]: Zap,
});

export default function RenderProfileSelector({
  mode,
  resolvedProfile,
  onChange,
  disabled = false,
}) {
  return (
    <section aria-labelledby="heathrow-graphics-title" className="rounded-[22px] border border-white/15 bg-white/[0.06] p-3">
      <div className="flex items-start justify-between gap-3 px-1">
        <div>
          <h3 id="heathrow-graphics-title" className="text-sm font-black text-white">Graphics quality</h3>
          <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-300">
            Changes apply immediately and remain saved on this device.
          </p>
        </div>
        {resolvedProfile && (
          <span className="shrink-0 rounded-full border border-cyan-200/25 bg-cyan-300/[0.1] px-2.5 py-1 text-[10px] font-black tracking-[.12em] text-cyan-100">
            {resolvedProfile.initialDpr.toFixed(2)}–{resolvedProfile.maxDpr.toFixed(2)}×
          </span>
        )}
      </div>

      <div className="mt-3 grid gap-2">
        {RENDER_PROFILE_OPTIONS.map((option) => {
          const Icon = ICONS[option.id];
          const active = mode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange?.(option.id)}
              className={`flex min-h-14 items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/70 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? 'border-amber-200/70 bg-amber-300 text-slate-950 shadow-[0_0_24px_rgba(252,211,77,.2)]'
                  : 'border-white/15 bg-slate-950/35 text-white hover:border-white/30 hover:bg-white/[0.08]'
              }`}
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${active ? 'bg-slate-950/10' : 'bg-white/[0.08]'}`}>
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black">{option.label}</span>
                <span className={`mt-0.5 block text-[11px] font-semibold leading-4 ${active ? 'text-slate-800' : 'text-slate-300'}`}>
                  {option.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
