import React from 'react';
import { motion } from 'framer-motion';

const moods = {
  happy: { eyes: '•  •', message: 'Ready for your next adventure?' },
  proud: { eyes: '⌒  ⌒', message: 'You are getting stronger every day!' },
  curious: { eyes: '•  ◔', message: 'Let’s discover something new.' },
};

export default function ParrotGuide({ mood = 'happy', compact = false, message }) {
  const current = moods[mood] || moods.happy;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className={`flex items-center ${compact ? 'gap-3' : 'gap-5'} rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-4 shadow-sm`}
    >
      <motion.div
        animate={{ y: [0, -5, 0], rotate: [0, -2, 2, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        className={`${compact ? 'h-16 w-16' : 'h-24 w-24'} relative shrink-0 rounded-[40%_50%_45%_55%] bg-gradient-to-br from-emerald-400 to-green-600 shadow-lg`}
      >
        <div className="absolute left-1/2 top-[22%] -translate-x-1/2 whitespace-pre text-[10px] font-black tracking-[4px] text-slate-900">{current.eyes}</div>
        <div className="absolute left-1/2 top-[43%] h-5 w-8 -translate-x-1/2 rounded-[70%_30%_60%_40%] bg-amber-400 shadow-sm" />
        <div className="absolute -left-2 top-10 h-10 w-6 -rotate-12 rounded-full bg-emerald-500" />
        <div className="absolute -right-2 top-10 h-10 w-6 rotate-12 rounded-full bg-emerald-500" />
        <div className="absolute bottom-0 left-1/2 h-6 w-10 -translate-x-1/2 rounded-t-full bg-rose-400/90" />
      </motion.div>
      <div>
        <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">Pico, your guide</div>
        <p className={`${compact ? 'text-sm' : 'text-lg'} mt-1 font-extrabold leading-snug text-slate-800`}>
          {message || current.message}
        </p>
      </div>
    </motion.div>
  );
}
