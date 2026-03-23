import React from 'react';
import { Flame } from 'lucide-react';
import { motion } from 'framer-motion';

export default function StreakCard({ streak, longestStreak }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="bg-gradient-to-br from-orange-400 to-orange-500 rounded-3xl p-6 text-white relative overflow-hidden"
    >
      <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full" />
      <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/5 rounded-full" />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <Flame className="w-5 h-5" />
          <span className="text-sm font-bold opacity-90">Daily Streak</span>
        </div>
        <div className="text-4xl font-black">{streak}</div>
        <div className="text-sm opacity-80 mt-1">day{streak !== 1 ? 's' : ''} in a row</div>
        <div className="mt-3 text-xs opacity-70 font-semibold">
          Best: {longestStreak} days
        </div>
      </div>
    </motion.div>
  );
}