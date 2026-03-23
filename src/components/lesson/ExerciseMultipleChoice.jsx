import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Check, X, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ExerciseMultipleChoice({ exercise, onAnswer }) {
  const [selected, setSelected] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const handleCheck = () => {
    setShowResult(true);
    setTimeout(() => {
      onAnswer(selected === exercise.correct_answer);
      setSelected(null);
      setShowResult(false);
      setShowHint(false);
    }, 1500);
  };

  const isCorrect = selected === exercise.correct_answer;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-center px-4 max-w-lg mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full"
        >
          <div className="mb-2">
            <span className="text-xs font-bold text-primary uppercase tracking-wider">
              {exercise.type === 'translation' ? 'Translate this' : 
               exercise.type === 'fill_blank' ? 'Fill in the blank' : 'Choose the correct answer'}
            </span>
          </div>
          <h2 className="text-2xl font-extrabold text-foreground mb-8">
            {exercise.question}
          </h2>

          {showHint && exercise.hint && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-4 p-3 bg-accent/10 rounded-2xl flex items-center gap-2"
            >
              <Lightbulb className="w-4 h-4 text-accent" />
              <span className="text-sm text-foreground">{exercise.hint}</span>
            </motion.div>
          )}

          <div className="grid grid-cols-1 gap-3">
            {(exercise.options || []).map((option, i) => (
              <motion.button
                key={option}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => !showResult && setSelected(option)}
                className={cn(
                  "p-4 rounded-2xl border-2 text-left font-bold transition-all duration-200",
                  selected === option && !showResult && "border-primary bg-primary/5",
                  selected !== option && !showResult && "border-border hover:border-primary/30 bg-card",
                  showResult && option === exercise.correct_answer && "border-primary bg-primary/10",
                  showResult && selected === option && option !== exercise.correct_answer && "border-destructive bg-destructive/10",
                )}
              >
                <div className="flex items-center justify-between">
                  <span>{option}</span>
                  {showResult && option === exercise.correct_answer && (
                    <Check className="w-5 h-5 text-primary" />
                  )}
                  {showResult && selected === option && option !== exercise.correct_answer && (
                    <X className="w-5 h-5 text-destructive" />
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="p-4 border-t border-border bg-card">
        <div className="max-w-lg mx-auto flex gap-3">
          {!showHint && exercise.hint && (
            <Button
              variant="outline"
              onClick={() => setShowHint(true)}
              className="rounded-2xl font-bold"
            >
              <Lightbulb className="w-4 h-4 mr-2" />
              Hint
            </Button>
          )}
          <Button
            onClick={handleCheck}
            disabled={!selected || showResult}
            className="flex-1 rounded-2xl font-bold h-12 text-base"
          >
            Check
          </Button>
        </div>

        <AnimatePresence>
          {showResult && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={cn(
                "max-w-lg mx-auto mt-3 p-4 rounded-2xl font-bold text-sm",
                isCorrect ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
              )}
            >
              {isCorrect ? '🎉 Correct! Great job!' : `❌ Incorrect. The answer is: ${exercise.correct_answer}`}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}