import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import UnitHeader from '@/components/learn/UnitHeader';
import LessonNode from '@/components/learn/LessonNode';
import { motion } from 'framer-motion';

export default function Learn() {
  const { user } = useAuth();

  const { data: lessons = [], isLoading: lessonsLoading } = useQuery({
    queryKey: ['lessons'],
    queryFn: () => base44.entities.Lesson.list('+unit', 100),
  });

  const { data: lessonProgress = [] } = useQuery({
    queryKey: ['lessonProgress', user?.email],
    queryFn: () => base44.entities.LessonProgress.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });

  if (lessonsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const completedSet = new Set(
    lessonProgress.filter(lp => lp.completed).map(lp => lp.lesson_id)
  );
  const progressMap = {};
  lessonProgress.forEach(lp => { progressMap[lp.lesson_id] = lp; });

  const units = {};
  lessons.forEach(lesson => {
    if (!units[lesson.unit]) units[lesson.unit] = [];
    units[lesson.unit].push(lesson);
  });

  Object.keys(units).forEach(unit => {
    units[unit].sort((a, b) => a.order - b.order);
  });

  const sortedLessons = Object.values(units).flat();
  const unlockedIds = new Set(sortedLessons.map(l => l.id));

  return (
    <div className="max-w-lg mx-auto p-6 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <p className="text-xs font-black uppercase tracking-[0.22em] text-primary mb-2">London · Mission 1</p>
        <h1 className="text-3xl font-black text-foreground">Arrive at Heathrow</h1>
        <p className="text-muted-foreground font-semibold mt-1">
          Find the Underground 🇬🇧 • {lessons.length} mission{lessons.length === 1 ? '' : 's'}
        </p>
      </motion.div>

      <div className="space-y-8">
        {Object.entries(units).sort(([a], [b]) => a - b).map(([unit, unitLessons]) => {
          const completedInUnit = unitLessons.filter(l => completedSet.has(l.id)).length;
          return (
            <div key={unit}>
              <UnitHeader
                unit={Number(unit)}
                lessonsInUnit={unitLessons.length}
                completedCount={completedInUnit}
              />
              <div className="flex flex-col items-center gap-6 mt-6">
                {unitLessons.map((lesson, idx) => (
                  <LessonNode
                    key={lesson.id}
                    lesson={lesson}
                    index={idx}
                    isCompleted={completedSet.has(lesson.id)}
                    isLocked={!unlockedIds.has(lesson.id)}
                    score={progressMap[lesson.id]?.score || 0}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}