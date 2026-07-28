import React from 'react';
import { Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import LevelBadge from '@/components/mascot/LevelBadge';

export default function XpCard({ totalXp, level }) {
  const xpInCurrentLevel = totalXp % 100;
  const progress = (xpInCurrentLevel / 100) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-gradient-to-br from-primary to-emerald-600 rounded-3xl p-6 text-white relative overflow-hidden"
    >
      <div className="absolute -left-6 -bottom-6 w-28 h-28 bg-white/10 rounded-full" />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            <span className="text-sm font-bold opacity-90">Total XP</span>
          </div>
          <LevelBadge level={level} size="sm" />
        </div>
        <div className="text-4xl font-black">{totalXp}</div>
        <div className="text-sm opacity-80 mt-1">Level {level}</div>
        <div className="mt-3 h-2.5 bg-white/20 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-white/70 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.6 }}
          />
        </div>
        <div className="text-xs opacity-70 mt-1.5 font-semibold">
          {xpInCurrentLevel}/100 XP to level {level + 1}
        </div>
      </div>
    </motion.div>
  );
}