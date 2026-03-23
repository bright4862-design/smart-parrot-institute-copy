import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import ProgressBar from '@/components/lesson/ProgressBar';
import ExerciseMultipleChoice from '@/components/lesson/ExerciseMultipleChoice';
import LessonComplete from '@/components/lesson/LessonComplete';
import { useUserProgress } from '@/lib/useUserProgress';

export default function LessonPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const lessonId = window.location.pathname.split('/lesson/')[1];
  const { user } = useAuth();
  const { progress, updateProgress } = useUserProgress();
  const queryClient = useQueryClient();

  const [currentExercise, setCurrentExercise] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [hearts, setHearts] = useState(5);
  const [isComplete, setIsComplete] = useState(false);

  const { data: lesson, isLoading } = useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: async () => {
      const lessons = await base44.entities.Lesson.filter({ id: lessonId });
      return lessons[0];
    },
    enabled: !!lessonId,
  });

  useEffect(() => {
    if (progress) {
      setHearts(progress.hearts || 5);
    }
  }, [progress]);

  const saveLessonProgress = useMutation({
    mutationFn: async ({ score, xpEarned }) => {
      const existing = await base44.entities.LessonProgress.filter({
        lesson_id: lessonId,
        user_email: user.email,
      });

      const today = new Date().toISOString().split('T')[0];

      if (existing.length > 0) {
        await base44.entities.LessonProgress.update(existing[0].id, {
          completed: true,
          score,
          xp_earned: xpEarned,
          completed_date: today,
          attempts: (existing[0].attempts || 0) + 1,
        });
      } else {
        await base44.entities.LessonProgress.create({
          lesson_id: lessonId,
          user_email: user.email,
          completed: true,
          score,
          xp_earned: xpEarned,
          completed_date: today,
          attempts: 1,
        });
      }

      // Update user progress
      if (progress) {
        const isNewDay = progress.last_practice_date !== today;
        const newStreak = isNewDay ? (progress.current_streak || 0) + 1 : (progress.current_streak || 0);
        await updateProgress.mutateAsync({
          total_xp: (progress.total_xp || 0) + xpEarned,
          daily_xp: isNewDay ? xpEarned : (progress.daily_xp || 0) + xpEarned,
          level: Math.floor(((progress.total_xp || 0) + xpEarned) / 100) + 1,
          current_streak: newStreak,
          longest_streak: Math.max(newStreak, progress.longest_streak || 0),
          last_practice_date: today,
          hearts: hearts,
          lessons_completed: (progress.lessons_completed || 0) + 1,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessonProgress'] });
      queryClient.invalidateQueries({ queryKey: ['userProgress'] });
    },
  });

  const handleAnswer = (isCorrect) => {
    if (isCorrect) {
      setCorrectCount(prev => prev + 1);
    } else {
      setHearts(prev => Math.max(0, prev - 1));
    }

    const exercises = lesson?.exercises || [];
    if (currentExercise + 1 >= exercises.length) {
      const totalExercises = exercises.length;
      const finalCorrect = isCorrect ? correctCount + 1 : correctCount;
      const score = Math.round((finalCorrect / totalExercises) * 100);
      const xpEarned = lesson?.xp_reward || 10;

      saveLessonProgress.mutate({ score, xpEarned });
      setIsComplete(true);
    } else {
      setCurrentExercise(prev => prev + 1);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground font-bold">Lesson not found</p>
      </div>
    );
  }

  const exercises = lesson.exercises || [];

  if (isComplete) {
    const score = Math.round((correctCount / exercises.length) * 100);
    return (
      <LessonComplete
        score={score}
        xpEarned={lesson.xp_reward || 10}
        correctCount={correctCount}
        totalCount={exercises.length}
      />
    );
  }

  const exercise = exercises[currentExercise];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <ProgressBar current={currentExercise} total={exercises.length} hearts={hearts} />
      <div className="flex-1">
        {exercise && (
          <ExerciseMultipleChoice
            key={currentExercise}
            exercise={exercise}
            onAnswer={handleAnswer}
          />
        )}
      </div>
    </div>
  );
}