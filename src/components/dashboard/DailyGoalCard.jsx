import React from 'react';
import { Target } from 'lucide-react';
import { motion } from 'framer-motion';

export default function DailyGoalCard({ dailyXp, dailyGoal }) {
  const progress = Math.min((dailyXp / dailyGoal) * 100, 100);
  const isComplete = dailyXp >= dailyGoal;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="bg-card rounded-3xl p-6 border border-border relative overflow-hidden"
    >
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-5 h-5 text-primary" />
        <span className="text-sm font-bold text-muted-foreground">Daily Goal</span>
      </div>
      <div className="flex items-end gap-1">
        <span className="text-3xl font-black text-foreground">{dailyXp}</span>
        <span className="text-lg font-bold text-muted-foreground mb-0.5">/ {dailyGoal} XP</span>
      </div>
      <div className="mt-4 h-3 bg-secondary rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${isComplete ? 'bg-primary' : 'bg-primary/70'}`}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
        />
      </div>
      {isComplete && (
        <p className="text-xs font-bold text-primary mt-2">Goal complete! 🎉</p>
      )}
    </motion.div>
  );
}