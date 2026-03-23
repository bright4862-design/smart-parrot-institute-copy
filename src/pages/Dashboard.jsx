import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { BookOpen, ArrowRight } from 'lucide-react';
import StreakCard from '@/components/dashboard/StreakCard';
import DailyGoalCard from '@/components/dashboard/DailyGoalCard';
import XpCard from '@/components/dashboard/XpCard';
import HeartsCard from '@/components/dashboard/HeartsCard';
import { useUserProgress } from '@/lib/useUserProgress';
import LanguageSelector from '@/components/onboarding/LanguageSelector';

export default function Dashboard() {
  const { progress, isLoading, initProgress, user } = useUserProgress();

  useEffect(() => {
    if (!isLoading && !progress && user?.email) {
      initProgress.mutate();
    }
  }, [isLoading, progress, user]);

  const { data: lessonProgress = [] } = useQuery({
    queryKey: ['lessonProgress', user?.email],
    queryFn: () => base44.entities.LessonProgress.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
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

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-black text-foreground">
          Welcome back{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}! 👋
        </h1>
        <p className="text-muted-foreground font-semibold mt-1">
          Ready to continue your Spanish journey?
        </p>
      </motion.div>

      {/* Quick Action */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <Link to="/learn">
          <div className="bg-primary rounded-3xl p-6 text-primary-foreground relative overflow-hidden group cursor-pointer transition-shadow hover:shadow-xl">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full transition-transform group-hover:scale-110" />
            <div className="absolute -right-5 -bottom-10 w-32 h-32 bg-white/5 rounded-full" />
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-5 h-5" />
                  <span className="text-sm font-bold opacity-90">Continue Learning</span>
                </div>
                <h2 className="text-xl font-extrabold">
                  {lessonProgress.length === 0 ? 'Start your first lesson!' : 'Jump back into Spanish'}
                </h2>
                <p className="text-sm opacity-80 mt-1">
                  {lessonProgress.length} lesson{lessonProgress.length !== 1 ? 's' : ''} completed
                </p>
              </div>
              <div className="bg-white/20 rounded-2xl p-3 group-hover:bg-white/30 transition-colors">
                <ArrowRight className="w-6 h-6" />
              </div>
            </div>
          </div>
        </Link>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StreakCard streak={p.current_streak} longestStreak={p.longest_streak} />
        <DailyGoalCard dailyXp={p.daily_xp} dailyGoal={p.daily_goal} />
        <XpCard totalXp={p.total_xp} level={p.level} />
        <HeartsCard hearts={p.hearts} />
      </div>
    </div>
  );
}