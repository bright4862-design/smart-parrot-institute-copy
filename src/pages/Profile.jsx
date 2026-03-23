import React from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useUserProgress } from '@/lib/useUserProgress';
import { User, Flame, Zap, Trophy, BookOpen, Heart, LogOut, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

export default function Profile() {
  const { user } = useAuth();
  const { progress, isLoading } = useUserProgress();

  const { data: lessonProgress = [] } = useQuery({
    queryKey: ['lessonProgress', user?.email],
    queryFn: () => base44.entities.LessonProgress.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });

  const handleLogout = () => {
    base44.auth.logout();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const p = progress || {};
  const completedLessons = lessonProgress.filter(lp => lp.completed);
  const avgScore = completedLessons.length > 0
    ? Math.round(completedLessons.reduce((sum, lp) => sum + (lp.score || 0), 0) / completedLessons.length)
    : 0;

  const stats = [
    { icon: Zap, label: 'Total XP', value: p.total_xp || 0, color: 'text-primary' },
    { icon: Flame, label: 'Current Streak', value: `${p.current_streak || 0} days`, color: 'text-orange-500' },
    { icon: Trophy, label: 'Best Streak', value: `${p.longest_streak || 0} days`, color: 'text-accent' },
    { icon: BookOpen, label: 'Lessons Done', value: completedLessons.length, color: 'text-blue-500' },
    { icon: Heart, label: 'Avg Score', value: `${avgScore}%`, color: 'text-destructive' },
    { icon: Calendar, label: 'Level', value: p.level || 1, color: 'text-purple-500' },
  ];

  return (
    <div className="max-w-lg mx-auto p-6 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="w-24 h-24 bg-gradient-to-br from-primary/20 to-primary/40 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl font-black text-primary">
            {user?.full_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'}
          </span>
        </div>
        <h1 className="text-2xl font-black text-foreground">
          {user?.full_name || 'Learner'}
        </h1>
        <p className="text-muted-foreground font-semibold text-sm">{user?.email}</p>
        {p.last_practice_date && (
          <p className="text-xs text-muted-foreground mt-1">
            Last practiced: {format(new Date(p.last_practice_date), 'MMM d, yyyy')}
          </p>
        )}
      </motion.div>

      <div className="grid grid-cols-2 gap-3 mb-8">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-card rounded-2xl p-4 border border-border"
            >
              <Icon className={`w-5 h-5 ${stat.color} mb-2`} />
              <div className="text-xl font-black text-foreground">{stat.value}</div>
              <div className="text-xs font-bold text-muted-foreground">{stat.label}</div>
            </motion.div>
          );
        })}
      </div>

      <Button
        variant="outline"
        onClick={handleLogout}
        className="w-full rounded-2xl font-bold h-12"
      >
        <LogOut className="w-4 h-4 mr-2" />
        Log Out
      </Button>
    </div>
  );
}