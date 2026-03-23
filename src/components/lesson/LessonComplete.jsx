import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Star, Zap, Trophy } from 'lucide-react';

export default function LessonComplete({ score, xpEarned, correctCount, totalCount }) {
  const stars = score >= 90 ? 3 : score >= 70 ? 2 : 1;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="text-center max-w-sm"
      >
        <div className="mb-6">
          <motion.div
            initial={{ rotate: -10, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ delay: 0.3, type: 'spring' }}
            className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto"
          >
            <Trophy className="w-12 h-12 text-primary" />
          </motion.div>
        </div>

        <h1 className="text-3xl font-black text-foreground mb-2">Lesson Complete!</h1>
        <p className="text-muted-foreground font-semibold mb-8">Great work! Keep it up!</p>

        {/* Stars */}
        <div className="flex justify-center gap-2 mb-8">
          {[1, 2, 3].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.2 }}
            >
              <Star
                className={`w-10 h-10 ${
                  i <= stars
                    ? 'text-accent fill-accent'
                    : 'text-muted-foreground/20'
                }`}
              />
            </motion.div>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1 }}
            className="bg-primary/10 rounded-2xl p-4"
          >
            <Zap className="w-6 h-6 text-primary mx-auto mb-1" />
            <div className="text-2xl font-black text-primary">{xpEarned}</div>
            <div className="text-xs font-bold text-primary/70">XP Earned</div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.1 }}
            className="bg-accent/10 rounded-2xl p-4"
          >
            <Star className="w-6 h-6 text-accent mx-auto mb-1" />
            <div className="text-2xl font-black text-accent">{score}%</div>
            <div className="text-xs font-bold text-accent/70">Score</div>
          </motion.div>
        </div>

        <p className="text-sm font-bold text-muted-foreground mb-6">
          {correctCount} of {totalCount} correct
        </p>

        <Link to="/learn">
          <Button className="w-full rounded-2xl h-14 text-lg font-extrabold">
            Continue
          </Button>
        </Link>
      </motion.div>
    </div>
  );
}