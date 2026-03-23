import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

const LANGUAGES = [
  { code: 'french', label: 'Français', flag: '🇫🇷', name: 'French' },
  { code: 'arabic', label: 'العربية', flag: '🇸🇦', name: 'Arabic' },
  { code: 'spanish', label: 'Español', flag: '🇪🇸', name: 'Spanish' },
  { code: 'portuguese', label: 'Português', flag: '🇧🇷', name: 'Portuguese' },
  { code: 'german', label: 'Deutsch', flag: '🇩🇪', name: 'German' },
  { code: 'chinese', label: '中文', flag: '🇨🇳', name: 'Chinese' },
  { code: 'korean', label: '한국어', flag: '🇰🇷', name: 'Korean' },
  { code: 'japanese', label: '日本語', flag: '🇯🇵', name: 'Japanese' },
];

export default function LanguageSelector({ onSelect }) {
  const [selected, setSelected] = useState(null);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-10 max-w-md"
      >
        <div className="w-16 h-16 bg-primary rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg">
          <Flame className="w-9 h-9 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-black text-foreground mb-2">Welcome to Linguo!</h1>
        <p className="text-muted-foreground font-semibold text-lg">
          What is your native language?
        </p>
      </motion.div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-sm mb-8">
        {LANGUAGES.map((lang, i) => (
          <motion.button
            key={lang.code}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => setSelected(lang.code)}
            className={cn(
              "flex items-center gap-3 p-4 rounded-2xl border-2 font-bold transition-all duration-200",
              selected === lang.code
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card hover:border-primary/40 text-foreground"
            )}
          >
            <span className="text-2xl">{lang.flag}</span>
            <div className="text-left">
              <div className="text-sm font-extrabold">{lang.label}</div>
              <div className="text-xs text-muted-foreground font-semibold">{lang.name}</div>
            </div>
          </motion.button>
        ))}
      </div>

      <Button
        className="w-full max-w-sm rounded-2xl h-14 text-lg font-extrabold"
        disabled={!selected}
        onClick={() => onSelect(selected)}
      >
        Start Learning English 🇺🇸
      </Button>
    </div>
  );
}