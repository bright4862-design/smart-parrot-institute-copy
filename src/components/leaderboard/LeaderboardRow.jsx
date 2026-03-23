import React from 'react';
import { motion } from 'framer-motion';
import { Crown, Medal, Award } from 'lucide-react';
import { cn } from '@/lib/utils';

const rankIcons = {
  1: <Crown className="w-5 h-5 text-yellow-500" />,
  2: <Medal className="w-5 h-5 text-gray-400" />,
  3: <Award className="w-5 h-5 text-amber-600" />,
};

export default function LeaderboardRow({ rank, name, xp, isCurrentUser, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "flex items-center gap-4 p-4 rounded-2xl transition-colors",
        isCurrentUser ? "bg-primary/5 border-2 border-primary/20" : "hover:bg-secondary"
      )}
    >
      <div className="w-8 flex justify-center">
        {rankIcons[rank] || (
          <span className="text-sm font-bold text-muted-foreground">{rank}</span>
        )}
      </div>
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
        <span className="text-sm font-black text-primary">
          {name?.charAt(0)?.toUpperCase() || '?'}
        </span>
      </div>
      <div className="flex-1">
        <p className={cn("font-bold text-sm", isCurrentUser ? "text-primary" : "text-foreground")}>
          {name || 'Anonymous'}
          {isCurrentUser && <span className="text-xs ml-2 text-primary/70">(You)</span>}
        </p>
      </div>
      <div className="text-right">
        <span className="font-extrabold text-foreground">{xp}</span>
        <span className="text-xs font-bold text-muted-foreground ml-1">XP</span>
      </div>
    </motion.div>
  );
}