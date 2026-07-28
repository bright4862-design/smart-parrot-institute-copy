import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowRight, Map, Sparkles, Trophy } from 'lucide-react';
import StreakCard from '@/components/dashboard/StreakCard';
import DailyGoalCard from '@/components/dashboard/DailyGoalCard';
import XpCard from '@/components/dashboard/XpCard';
import HeartsCard from '@/components/dashboard/HeartsCard';
import ParrotGuide from '@/components/characters/ParrotGuide';
import { useUserProgress } from '@/lib/useUserProgress';
import LanguageSelector from '@/components/onboarding/LanguageSelector';

export default function Dashboard() {
  const { progress, isLoading, initProgress, user } = useUserProgress();

  const { data: lessonProgress = [] } = useQuery({
    queryKey: ['lessonProgress', user?.email],
    queryFn: () => base44.entities.LessonProgress.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );
  }

  if (!progress && user?.email) {
    return <LanguageSelector onSelect={(lang) => initProgress.mutate(lang)} />;
  }

  const p = progress || {
    current_streak: 0,
    longest_streak: 0,
    daily_xp: 0,
    daily_goal: 50,
    total_xp: 0,
    level: 1,
    hearts: 5,
  };

  const completed = lessonProgress.filter((item) => item.completed).length;
  const firstName = user?.full_name?.split(' ')[0];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-5 lg:p-8">
      <motion.section
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[2rem] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-6 shadow-sm lg:p-8"
      >
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-emerald-200/30 blur-2xl" />
        <div className="relative grid items-center gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-emerald-700 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" /> Smart Parrot Adventure
            </div>
            <h1 className="max-w-2xl text-3xl font-black leading-tight text-slate-900 lg:text-5xl">
              Welcome back{firstName ? `, ${firstName}` : ''}.
            </h1>
            <p className="mt-3 max-w-xl text-base font-semibold leading-relaxed text-slate-600 lg:text-lg">
              Continue your journey, unlock new places, and help Pico rebuild the world of languages.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to="/learn"
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white shadow-lg shadow-emerald-600/20 transition hover:-translate-y-0.5 hover:bg-emerald-700"
              >
                Explore the map <ArrowRight className="h-5 w-5" />
              </Link>
              <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 font-extrabold text-slate-700">
                <Trophy className="h-5 w-5 text-amber-500" /> Level {p.level}
              </div>
            </div>
          </div>
          <ParrotGuide
            mood={completed > 0 ? 'proud' : 'happy'}
            message={completed > 0 ? `You have completed ${completed} lesson${completed === 1 ? '' : 's'}. Let’s keep flying!` : 'Your first adventure is waiting on Beginner Island!'}
          />
        </div>
      </motion.section>

      <Link to="/learn" className="block">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="group relative overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl lg:p-8"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.35),transparent_40%)]" />
          <div className="relative flex items-center justify-between gap-5">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-black text-emerald-300">
                <Map className="h-5 w-5" /> Current world
              </div>
              <h2 className="text-2xl font-black">Beginner Island</h2>
              <p className="mt-2 font-semibold text-slate-300">
                {completed === 0 ? 'Begin at Welcome Cove and unlock your first path.' : `${completed} lessons restored. Your next destination is ready.`}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4 transition group-hover:translate-x-1 group-hover:bg-white/15">
              <ArrowRight className="h-6 w-6" />
            </div>
          </div>
        </motion.section>
      </Link>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StreakCard streak={p.current_streak} longestStreak={p.longest_streak} />
        <DailyGoalCard dailyXp={p.daily_xp} dailyGoal={p.daily_goal} />
        <XpCard totalXp={p.total_xp} level={p.level} />
        <HeartsCard hearts={p.hearts} />
      </section>
    </div>
  );
}
