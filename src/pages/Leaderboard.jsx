import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import LeaderboardRow from '@/components/leaderboard/LeaderboardRow';

export default function Leaderboard() {
  const { user } = useAuth();

  const { data: allProgress = [], isLoading } = useQuery({
    queryKey: ['allUserProgress'],
    queryFn: () => base44.entities.UserProgress.list('-total_xp', 50),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-6 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-accent/10 rounded-2xl flex items-center justify-center">
            <Trophy className="w-5 h-5 text-accent" />
          </div>
          <h1 className="text-3xl font-black text-foreground">Leaderboard</h1>
        </div>
        <p className="text-muted-foreground font-semibold">
          See how you rank among other learners
        </p>
      </motion.div>

      {allProgress.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground font-bold">No learners yet</p>
          <p className="text-sm text-muted-foreground mt-1">Complete lessons to appear here!</p>
        </motion.div>
      ) : (
        <div className="space-y-2">
          {allProgress.map((up, index) => (
            <LeaderboardRow
              key={up.id}
              rank={index + 1}
              name={up.user_name || up.user_email}
              xp={up.total_xp || 0}
              isCurrentUser={up.user_email === user?.email}
              index={index}
            />
          ))}
        </div>
      )}
    </div>
  );
}