import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

export function useUserProgress() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: progressList, isLoading } = useQuery({
    queryKey: ['userProgress', user?.email],
    queryFn: () => base44.entities.UserProgress.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });

  const progress = progressList?.[0] || null;

  const initProgress = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      return base44.entities.UserProgress.create({
        user_email: user.email,
        user_name: user.full_name || user.email.split('@')[0],
        total_xp: 0,
        level: 1,
        current_streak: 0,
        longest_streak: 0,
        daily_xp: 0,
        daily_goal: 50,
        last_practice_date: today,
        hearts: 5,
        language: 'spanish',
        lessons_completed: 0,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['userProgress'] }),
  });

  const updateProgress = useMutation({
    mutationFn: async (data) => {
      if (!progress) return;
      return base44.entities.UserProgress.update(progress.id, data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['userProgress'] }),
  });

  return { progress, isLoading, initProgress, updateProgress, user };
}