import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, MapPin, MessageCircle, Sparkles, Volume2 } from "lucide-react";
import HeroStage from "@/components/game/hero/HeroStage";

const moments = [
  {
    eyebrow: "HEATHROW · ARRIVALS",
    title: "Your adventure begins here.",
    copy: "Meet the Smart Parrot Traveler and Pico in the first living prototype of our language-learning world.",
    prompt: "Say: Excuse me, where is the Underground?",
  },
  {
    eyebrow: "FIRST CONVERSATION",
    title: "Speak to move forward.",
    copy: "Short, useful English unlocks the journey. Pico helps when you need a hint, but never interrupts the adventure.",
    prompt: "Say: I need a ticket to central London, please.",
  },
  {
    eyebrow: "NEXT STOP · WESTMINSTER",
    title: "Learn English by living it.",
    copy: "Every conversation becomes part of the story: directions, friendships, discoveries, and choices.",
    prompt: "Say: Which line should I take?",
  },
];

export default function AdventurePrototype() {
  const [step, setStep] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const moment = moments[step];

  const next = () => {
    setSpeaking(false);
    setStep((current) => (current + 1) % moments.length);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f3ff] text-[#17213a]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(111,92,255,0.2),transparent_32%),radial-gradient(circle_at_78%_30%,rgba(61,168,255,0.15),transparent_30%),linear-gradient(180deg,#fbfaff_0%,#eef2ff_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[38%] bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.76))]" />

      <nav className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-10">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#6f5cff] text-xl text-white shadow-lg shadow-violet-300">🦜</div>
          <div>
            <div className="text-sm font-black tracking-tight">Smart Parrot</div>
            <div className="text-xs text-slate-500">Adventure prototype</div>
          </div>
        </div>
        <div className="rounded-full border border-white/80 bg-white/70 px-4 py-2 text-xs font-semibold text-[#5c48e8] shadow-sm backdrop-blur-xl">
          Interactive hero stage · Sprint build
        </div>
      </nav>

      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-88px)] max-w-7xl items-center gap-8 px-5 pb-10 md:grid-cols-[0.9fr_1.1fr] md:px-10">
        <div className="order-2 pb-8 md:order-1 md:pb-16">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.35 }}
            >
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/75 px-4 py-2 text-xs font-extrabold tracking-[0.18em] text-[#5c48e8] shadow-sm backdrop-blur">
                <MapPin className="h-3.5 w-3.5" /> {moment.eyebrow}
              </div>
              <h1 className="max-w-2xl text-5xl font-black leading-[0.98] tracking-[-0.055em] text-[#18213b] md:text-7xl">
                {moment.title}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 md:text-xl">{moment.copy}</p>
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 max-w-xl rounded-[28px] border border-white/90 bg-white/78 p-3 shadow-[0_22px_70px_rgba(72,52,160,0.14)] backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setSpeaking((value) => !value)}
              className="flex w-full items-center gap-4 rounded-[22px] bg-[#171d32] p-4 text-left text-white transition hover:-translate-y-0.5"
            >
              <motion.span
                animate={speaking ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                transition={{ repeat: speaking ? Infinity : 0, duration: 1 }}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#6f5cff]"
              >
                {speaking ? <Volume2 className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
              </motion.span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold uppercase tracking-[0.16em] text-violet-300">
                  {speaking ? "Listening…" : "Your first phrase"}
                </span>
                <span className="mt-1 block text-sm font-semibold leading-6 md:text-base">{moment.prompt}</span>
              </span>
              <Sparkles className="h-5 w-5 text-violet-300" />
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-2 rounded-full bg-[#6f5cff] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-violet-300 transition hover:-translate-y-0.5 hover:bg-[#5c48e8]"
            >
              Continue the journey <ArrowRight className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              {moments.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setStep(index)}
                  aria-label={`Go to story moment ${index + 1}`}
                  className={`h-2.5 rounded-full transition-all ${index === step ? "w-8 bg-[#6f5cff]" : "w-2.5 bg-violet-200"}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="order-1 flex min-h-[560px] items-center justify-center pt-4 md:order-2 md:min-h-[720px]">
          <div className="relative w-full max-w-[680px]">
            <motion.div
              animate={{ rotate: [0, 1.2, 0, -1.2, 0] }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
              className="absolute left-[4%] top-[10%] h-[78%] w-[92%] rounded-full bg-white/65 blur-3xl"
            />
            <HeroStage className="relative z-10" />
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1, y: [0, -8, 0] }}
              transition={{ opacity: { delay: 0.8 }, scale: { delay: 0.8 }, y: { duration: 3, repeat: Infinity } }}
              className="pointer-events-none absolute right-[3%] top-[12%] z-20 rounded-2xl border border-white/80 bg-white/82 px-4 py-3 text-sm font-bold text-[#40328f] shadow-xl backdrop-blur-xl"
            >
              Come on! 🦜
            </motion.div>
          </div>
        </div>
      </section>
    </main>
  );
}
