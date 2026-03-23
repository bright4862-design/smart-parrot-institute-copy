import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Check, Lock, Star, BookOpen, Hash, Palette, Users, MessageCircle, Utensils, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';

const iconMap = {
  'hand-wave': Star,
  'message-circle': MessageCircle,
  'hash': Hash,
  'palette': Palette,
  'users': Users,
  'utensils': Utensils,
  'chef-hat': Utensils,
  'compass': Compass,
};

export default function LessonNode({ lesson, index, isCompleted, isLocked, score }) {
  const Icon = iconMap[lesson.icon] || BookOpen;

  const positions = [0, -30, -40, -30, 0, 30, 40, 30];
  const offset = positions[index % positions.length];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.1 }}
      className="flex flex-col items-center"
      style={{ marginLeft: `${offset}px` }}
    >
      {isLocked ? (
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-muted border-4 border-border flex items-center justify-center shadow-sm">
            <Lock className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-xs font-bold text-muted-foreground mt-2 text-center max-w-[100px]">
            {lesson.title}
          </p>
        </div>
      ) : (
        <Link to={`/lesson/${lesson.id}`} className="relative group">
          <div
            className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 border-4",
              "group-hover:scale-110 group-hover:shadow-xl",
              isCompleted
                ? "bg-primary border-primary/30"
                : "bg-card border-primary/50 hover:border-primary"
            )}
          >
            {isCompleted ? (
              <Check className="w-7 h-7 text-primary-foreground" strokeWidth={3} />
            ) : (
              <Icon className="w-6 h-6 text-primary" />
            )}
          </div>
          {isCompleted && (
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-accent rounded-full flex items-center justify-center border-2 border-card">
              <Star className="w-3 h-3 text-accent-foreground" />
            </div>
          )}
          <p className={cn(
            "text-xs font-bold mt-2 text-center max-w-[100px]",
            isCompleted ? "text-primary" : "text-foreground"
          )}>
            {lesson.title}
          </p>
          {isCompleted && score > 0 && (
            <p className="text-[10px] font-bold text-muted-foreground text-center">{score}%</p>
          )}
        </Link>
      )}
    </motion.div>
  );
}