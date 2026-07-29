import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Headphones,
  MapPin,
  RotateCcw,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { clearCheckpoint, HEATHROW_CHECKPOINT_KEY, HEATHROW_STEPS } from './missionState';

const HeathrowPlayableSpine = lazy(() => import('./HeathrowPlayableSpine'));

const LISTENING_OPTIONS = [
  'Excuse me, where is the Underground?',
  'Give me the train now.',
  'Underground where?',
];

const SIGN_CHALLENGES = [
  {
    sign: 'BAGGAGE RECLAIM',
    question: 'Where should you go to collect your suitcase?',
    options: ['Baggage reclaim', 'Gate A12', 'The coffee shop'],
    correctIndex: 0,
  },
  {
    sign: 'GATE A12 →',
    question: 'Which sign helps a passenger find their departure gate?',
    options: ['Underground', 'Gate A12', 'Restrooms'],
    correctIndex: 1,
  },
  {
    sign: 'UNDERGROUND',
    question: 'Which sign leads toward the London train?',
    options: ['Baggage reclaim', 'Coffee', 'Underground'],
    correctIndex: 2,
  },
];

const SENTENCE_TOKENS = ['the', 'Excuse me,', 'Underground?', 'is', 'where'];
const CORRECT_SENTENCE = ['Excuse me,', 'where', 'is', 'the', 'Underground?'];

const RECAP_QUESTIONS = [
  {
    question: 'What does “baggage reclaim” mean?',
    options: ['The place where arriving bags appear', 'A train platform', 'A passport office'],
    correctIndex: 0,
  },
  {
    question: 'Which sentence is the most polite?',
    options: ['Underground now.', 'Excuse me, where is the Underground?', 'You show train.'],
    correctIndex: 1,
  },
  {
    question: 'What did the yellow route help you find?',
    options: ['The Underground', 'A hotel room', 'The runway'],
    correctIndex: 0,
  },
];

function formatElapsed(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function speak(text) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-GB';
  utterance.rate = 0.84;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function ProgressDots({ current, total }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Practice step ${current + 1} of ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={`h-1.5 rounded-full transition-all ${index === current ? 'w-8 bg-amber-300' : index < current ? 'w-4 bg-emerald-300' : 'w-3 bg-white/25'}`}
        />
      ))}
    </div>
  );
}

function PracticeShell({ step, children, title, eyebrow, copy, onBack }) {
  return (
    <main className="fixed inset-0 min-h-[100svh] overflow-y-auto bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(111,92,255,.34),transparent_34%),radial-gradient(circle_at_85%_22%,rgba(56,189,248,.2),transparent_32%),linear-gradient(180deg,#111827_0%,#020617_100%)]" />
      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-5xl flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-400 text-2xl shadow-lg shadow-emerald-950/30">🦜</div>
            <div>
              <div className="text-sm font-black">Smart Parrot Adventure</div>
              <div className="text-xs font-semibold text-slate-400">London · Heathrow A1</div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-black text-slate-200 backdrop-blur-xl">
            <Clock3 className="h-3.5 w-3.5 text-amber-300" /> About 5 minutes
          </div>
        </header>

        <section className="my-auto py-8 sm:py-12">
          <div className="mb-6 flex items-center justify-between gap-4">
            <ProgressDots current={step} total={4} />
            {onBack && (
              <button type="button" onClick={onBack} className="text-xs font-bold text-slate-400 transition hover:text-white">
                Back
              </button>
            )}
          </div>

          <div className="grid items-center gap-8 lg:grid-cols-[0.78fr_1.22fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-[10px] font-black tracking-[.18em] text-amber-300">
                <Sparkles className="h-3.5 w-3.5" /> {eyebrow}
              </div>
              <h1 className="mt-5 text-4xl font-black leading-[1.02] tracking-[-.045em] sm:text-6xl">{title}</h1>
              <p className="mt-5 max-w-xl text-base font-medium leading-7 text-slate-300 sm:text-lg">{copy}</p>
            </div>

            <div className="rounded-[30px] border border-white/15 bg-white/[.08] p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-6">
              {children}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Briefing({ onNext }) {
  return (
    <PracticeShell
      step={0}
      eyebrow="MISSION BRIEFING"
      title="Arrive ready to speak."
      copy="Before entering Terminal 5, learn the three phrases and signs you will actually use inside the level."
    >
      <div className="grid gap-3">
        {[
          ['🧳', 'Find your suitcase', 'Look for BAGGAGE RECLAIM and identify the purple case.'],
          ['💬', 'Ask politely', 'Use “Excuse me…” before asking an airport employee for help.'],
          ['🚇', 'Follow the route', 'Read the signs and reach the Underground.'],
        ].map(([icon, title, body]) => (
          <div key={title} className="flex gap-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-xl">{icon}</div>
            <div>
              <div className="font-black">{title}</div>
              <div className="mt-1 text-sm font-medium leading-6 text-slate-400">{body}</div>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={onNext} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 py-4 text-sm font-black text-slate-950 shadow-lg shadow-amber-950/20 transition hover:-translate-y-0.5 active:scale-[.99]">
        Begin airport practice <ArrowRight className="h-4 w-4" />
      </button>
    </PracticeShell>
  );
}

function ListeningPractice({ onNext, onBack }) {
  const [feedback, setFeedback] = useState('');

  const choose = (index) => {
    if (index === 0) {
      setFeedback('Perfect — polite, complete, and natural.');
      window.setTimeout(onNext, 650);
    } else {
      setFeedback('Try again. Begin politely with “Excuse me”.');
    }
  };

  return (
    <PracticeShell
      step={1}
      eyebrow="LISTENING · POLITE ENGLISH"
      title="Hear it, then choose it."
      copy="Listen to the phrase you will need in the terminal, then select the natural English sentence."
      onBack={onBack}
    >
      <button type="button" onClick={() => speak(LISTENING_OPTIONS[0])} className="flex w-full items-center gap-4 rounded-2xl bg-violet-500 p-4 text-left shadow-lg shadow-violet-950/25 transition hover:bg-violet-400 active:scale-[.99]">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15"><Volume2 className="h-5 w-5" /></span>
        <span>
          <span className="block text-xs font-black tracking-[.16em] text-violet-100">PLAY PHRASE</span>
          <span className="mt-1 block text-sm font-semibold">Tap to hear British English</span>
        </span>
      </button>

      <div className="mt-4 grid gap-2.5">
        {LISTENING_OPTIONS.map((option, index) => (
          <button key={option} type="button" onClick={() => choose(index)} className="rounded-2xl border border-white/12 bg-slate-950/45 px-4 py-3.5 text-left text-sm font-bold leading-6 transition hover:border-amber-300/60 hover:bg-white/10 active:scale-[.99]">
            {option}
          </button>
        ))}
      </div>
      {feedback && <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-bold ${feedback.startsWith('Perfect') ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-300/15 text-amber-200'}`}>{feedback}</div>}
    </PracticeShell>
  );
}

function SignPractice({ onNext, onBack }) {
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [feedback, setFeedback] = useState('');
  const challenge = SIGN_CHALLENGES[challengeIndex];

  const choose = (index) => {
    if (index !== challenge.correctIndex) {
      setFeedback('Look at the sign again and choose the clearest meaning.');
      return;
    }

    setFeedback('Correct!');
    window.setTimeout(() => {
      if (challengeIndex === SIGN_CHALLENGES.length - 1) {
        onNext();
      } else {
        setChallengeIndex((value) => value + 1);
        setFeedback('');
      }
    }, 500);
  };

  return (
    <PracticeShell
      step={2}
      eyebrow={`READING SIGNS · ${challengeIndex + 1}/${SIGN_CHALLENGES.length}`}
      title="Read the airport around you."
      copy="Signs are part of the level, not decoration. Learn what each one means before you navigate the terminal."
      onBack={onBack}
    >
      <div className="rounded-2xl border border-sky-300/25 bg-[#17365f] px-5 py-6 text-center shadow-xl">
        <MapPin className="mx-auto h-5 w-5 text-sky-200" />
        <div className="mt-2 text-xl font-black tracking-[.08em]">{challenge.sign}</div>
      </div>
      <p className="mt-4 text-sm font-bold leading-6 text-slate-200">{challenge.question}</p>
      <div className="mt-3 grid gap-2.5">
        {challenge.options.map((option, index) => (
          <button key={option} type="button" onClick={() => choose(index)} className="rounded-2xl border border-white/12 bg-slate-950/45 px-4 py-3.5 text-left text-sm font-bold transition hover:border-sky-300/60 hover:bg-white/10 active:scale-[.99]">
            {option}
          </button>
        ))}
      </div>
      {feedback && <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-bold ${feedback === 'Correct!' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-300/15 text-amber-200'}`}>{feedback}</div>}
    </PracticeShell>
  );
}

function SentencePractice({ onEnterMission, onBack }) {
  const [selected, setSelected] = useState([]);
  const [feedback, setFeedback] = useState('');
  const remaining = SENTENCE_TOKENS.filter((token) => !selected.includes(token));

  const check = () => {
    const correct = selected.length === CORRECT_SENTENCE.length && selected.every((token, index) => token === CORRECT_SENTENCE[index]);
    if (!correct) {
      setFeedback('Almost. Start with “Excuse me,” and finish with the place you need.');
      return;
    }
    setFeedback('Excellent — you are ready for the live mission.');
  };

  return (
    <PracticeShell
      step={3}
      eyebrow="SPEAKING PATTERN"
      title="Build the sentence yourself."
      copy="Put the words in the correct order. This phrase will unlock the route inside Heathrow."
      onBack={onBack}
    >
      <div className="min-h-20 rounded-2xl border border-dashed border-white/25 bg-slate-950/45 p-3">
        <div className="flex min-h-12 flex-wrap items-center gap-2">
          {selected.length === 0 && <span className="text-sm font-semibold text-slate-500">Tap the words below…</span>}
          {selected.map((token) => (
            <button key={token} type="button" onClick={() => { setSelected((items) => items.filter((item) => item !== token)); setFeedback(''); }} className="rounded-xl bg-white px-3 py-2 text-sm font-black text-slate-900">
              {token}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {remaining.map((token) => (
          <button key={token} type="button" onClick={() => { setSelected((items) => [...items, token]); setFeedback(''); }} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-bold transition hover:border-amber-300/60 hover:bg-white/15">
            {token}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => { setSelected([]); setFeedback(''); }} className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3.5 text-sm font-black transition hover:bg-white/10">
          <RotateCcw className="h-4 w-4" /> Clear
        </button>
        <button type="button" onClick={check} disabled={selected.length !== CORRECT_SENTENCE.length} className="flex items-center justify-center gap-2 rounded-2xl bg-amber-300 px-4 py-3.5 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40">
          <Check className="h-4 w-4" /> Check sentence
        </button>
      </div>

      {feedback && <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-bold ${feedback.startsWith('Excellent') ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-300/15 text-amber-200'}`}>{feedback}</div>}

      {feedback.startsWith('Excellent') && (
        <button type="button" onClick={onEnterMission} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 py-4 text-sm font-black text-slate-950 shadow-lg shadow-emerald-950/20 transition hover:-translate-y-0.5 active:scale-[.99]">
          Enter Heathrow Terminal 5 <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </PracticeShell>
  );
}

function MissionLoading() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-slate-950 text-white">
      <div className="text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-white/15 bg-white/10 text-3xl">🦜</div>
        <div className="mt-5 text-lg font-black">Opening Terminal 5…</div>
        <div className="mx-auto mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-white/10"><div className="h-full w-2/3 animate-pulse rounded-full bg-amber-300" /></div>
      </div>
    </div>
  );
}

function Recap({ elapsed, onRestart }) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [feedback, setFeedback] = useState('');
  const complete = questionIndex >= RECAP_QUESTIONS.length;
  const question = RECAP_QUESTIONS[questionIndex];

  const choose = (index) => {
    const correct = index === question.correctIndex;
    setFeedback(correct ? 'Correct!' : 'Not quite — try the phrase or sign you used in the terminal.');
    if (!correct) return;

    setCorrectAnswers((value) => value + 1);
    window.setTimeout(() => {
      setQuestionIndex((value) => value + 1);
      setFeedback('');
    }, 550);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/80 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-white backdrop-blur-md">
      <div className="w-full max-w-xl rounded-[30px] border border-white/15 bg-slate-900/95 p-5 shadow-2xl sm:p-7">
        {!complete ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-black tracking-[.18em] text-amber-300">MISSION RECAP · {questionIndex + 1}/{RECAP_QUESTIONS.length}</div>
              <div className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-slate-300">{formatElapsed(elapsed)}</div>
            </div>
            <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">{question.question}</h2>
            <div className="mt-5 grid gap-2.5">
              {question.options.map((option, index) => (
                <button key={option} type="button" onClick={() => choose(index)} className="rounded-2xl border border-white/12 bg-white/5 px-4 py-3.5 text-left text-sm font-bold transition hover:border-amber-300/60 hover:bg-white/10 active:scale-[.99]">
                  {option}
                </button>
              ))}
            </div>
            {feedback && <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-bold ${feedback === 'Correct!' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-300/15 text-amber-200'}`}>{feedback}</div>}
          </>
        ) : (
          <div className="text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-950/30"><CheckCircle2 className="h-8 w-8" /></div>
            <div className="mt-5 text-xs font-black tracking-[.18em] text-emerald-300">HEATHROW A1 COMPLETE</div>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">You learned it by living it.</h2>
            <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-6 text-slate-300">You practised airport signs, polite questions, directions, and a complete London travel phrase.</p>
            <div className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/5 p-4"><div className="text-2xl font-black text-amber-300">{correctAnswers}/{RECAP_QUESTIONS.length}</div><div className="mt-1 text-xs font-bold text-slate-400">Recap score</div></div>
              <div className="rounded-2xl bg-white/5 p-4"><div className="text-2xl font-black text-sky-300">{formatElapsed(elapsed)}</div><div className="mt-1 text-xs font-bold text-slate-400">Session time</div></div>
            </div>
            <button type="button" onClick={onRestart} className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-300 px-6 py-4 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 active:scale-[.99]">
              <RotateCcw className="h-4 w-4" /> Play Heathrow again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HeathrowLearningMission() {
  const [phase, setPhase] = useState('briefing');
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef(null);

  const practiceStep = useMemo(() => ({ briefing: 0, listening: 1, signs: 2, sentence: 3 }[phase] ?? 0), [phase]);

  useEffect(() => {
    if (phase === 'briefing') {
      startedAtRef.current = Date.now();
      setElapsed(0);
    }

    if (!startedAtRef.current) return undefined;
    const timer = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase === 'briefing']);

  useEffect(() => {
    if (phase !== 'mission') return undefined;

    const checkCompletion = () => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(HEATHROW_CHECKPOINT_KEY));
        if (saved?.step === HEATHROW_STEPS.COMPLETE) setPhase('recap');
      } catch {
        // Ignore malformed local checkpoints and keep the mission playable.
      }
    };

    checkCompletion();
    const interval = window.setInterval(checkCompletion, 600);
    return () => window.clearInterval(interval);
  }, [phase]);

  const enterMission = () => {
    clearCheckpoint();
    setPhase('mission');
  };

  const restart = () => {
    clearCheckpoint();
    startedAtRef.current = Date.now();
    setElapsed(0);
    setPhase('briefing');
  };

  if (phase === 'briefing') return <Briefing onNext={() => setPhase('listening')} />;
  if (phase === 'listening') return <ListeningPractice onNext={() => setPhase('signs')} onBack={() => setPhase('briefing')} />;
  if (phase === 'signs') return <SignPractice onNext={() => setPhase('sentence')} onBack={() => setPhase('listening')} />;
  if (phase === 'sentence') return <SentencePractice onEnterMission={enterMission} onBack={() => setPhase('signs')} />;

  return (
    <main className="fixed inset-0 min-h-[100svh] overflow-hidden bg-slate-950">
      <Suspense fallback={<MissionLoading />}>
        <HeathrowPlayableSpine />
      </Suspense>

      {phase === 'mission' && (
        <div className="pointer-events-none absolute left-1/2 top-[max(.75rem,env(safe-area-inset-top))] z-30 -translate-x-1/2 rounded-full border border-white/20 bg-slate-950/65 px-3 py-2 text-[10px] font-black tracking-[.12em] text-white shadow-xl backdrop-blur-xl sm:text-xs">
          <span className="inline-flex items-center gap-1.5"><Headphones className="h-3.5 w-3.5 text-emerald-300" /> LIVE MISSION · {formatElapsed(elapsed)}</span>
        </div>
      )}

      {phase === 'recap' && <Recap elapsed={elapsed} onRestart={restart} />}
    </main>
  );
}
