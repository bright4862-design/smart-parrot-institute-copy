import React from 'react';
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';

const levelColors = [
  'from-slate-400 to-slate-500',
  'from-emerald-400 to-emerald-600',
  'from-blue-400 to-blue-600',
  'from-purple-400 to-purple-600',
  'from-orange-400 to-red-500',
  'from-pink-400 to-rose-600',
];

const levelTitles = [
  'Beginner',
  'Explorer',
  'Achiever',
  'Scholar',
  'Master',
  'Legend',
];

export default function LevelBadge({ level, size = 'md' }) {
  const colorIdx = Math.min(Math.floor((level - 1) / 2), levelColors.length - 1);
  const colorClass = levelColors[colorIdx];
  const title = levelTitles[colorIdx];

  const sizes = {
    sm: { badge: 'w-10 h-10', text: 'text-xs', star: 'w-3 h-3' },
    md: { badge: 'w-14 h-14', text: 'text-sm', star: 'w-4 h-4' },
    lg: { badge: 'w-20 h-20', text: 'text-lg', star: 'w-5 h-5' },
  };
  const s = sizes[size];

  return (
    <div className="flex items-center gap-3">
      <motion.div
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, delay: 0.3 }}
        whileHover={{ scale: 1.1 }}
        className={`${s.badge} bg-gradient-to-br ${colorClass} rounded-full flex items-center justify-center shadow-lg relative`}
      >
        <Star className={`${s.star} text-white/30 absolute`} fill="white" />
        <span className={`${s.text} font-black text-white relative z-10`}>{level}</span>
      </motion.div>
      {size !== 'sm' && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Level {level}</p>
          <p className={`font-extrabold text-foreground ${size === 'lg' ? 'text-lg' : 'text-sm'}`}>{title}</p>
        </div>
      )}
    </div>
  );
}