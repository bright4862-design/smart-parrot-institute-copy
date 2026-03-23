import React from 'react';
import { Heart } from 'lucide-react';
import { motion } from 'framer-motion';

export default function HeartsCard({ hearts }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="bg-card rounded-3xl p-6 border border-border"
    >
      <div className="flex items-center gap-2 mb-3">
        <Heart className="w-5 h-5 text-destructive fill-destructive" />
        <span className="text-sm font-bold text-muted-foreground">Hearts</span>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Heart
            key={i}
            className={`w-7 h-7 transition-all ${
              i < hearts
                ? 'text-destructive fill-destructive'
                : 'text-muted-foreground/20'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-3 font-semibold">
        {hearts > 0 ? `${hearts} hearts remaining` : 'No hearts left! Practice to earn more.'}
      </p>
    </motion.div>
  );
}