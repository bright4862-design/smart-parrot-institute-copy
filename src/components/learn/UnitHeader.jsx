import React from 'react';
import { motion } from 'framer-motion';

const unitColors = [
  'from-primary to-emerald-500',
  'from-blue-500 to-indigo-500',
  'from-purple-500 to-pink-500',
  'from-orange-400 to-red-500',
];

const unitDescriptions = {
  1: 'Master the basics of English',
  2: 'Build your vocabulary',
  3: 'Real-world conversations',
};

export default function UnitHeader({ unit, lessonsInUnit, completedCount }) {
  const colorClass = unitColors[(unit - 1) % unitColors.length];
  const progress = lessonsInUnit > 0 ? (completedCount / lessonsInUnit) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={`bg-gradient-to-r ${colorClass} rounded-3xl p-6 text-white relative overflow-hidden`}
    >
      <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5" />
      <div className="relative z-10">
        <div className="text-xs font-bold opacity-80 uppercase tracking-wider">
          Unit {unit}
        </div>
        <h2 className="text-xl font-extrabold mt-1">
          {unitDescriptions[unit] || `Unit ${unit}`}
        </h2>
        <div className="flex items-center gap-3 mt-3">
          <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white/70 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs font-bold opacity-90">
            {completedCount}/{lessonsInUnit}
          </span>
        </div>
      </div>
    </motion.div>
  );
}