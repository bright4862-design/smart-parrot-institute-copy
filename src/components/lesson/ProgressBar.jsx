import React from 'react';
import { X, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function ProgressBar({ current, total, hearts }) {
  const progress = ((current) / total) * 100;

  return (
    <div className="flex items-center gap-4 p-4">
      <Link to="/learn" className="p-2 hover:bg-secondary rounded-xl transition-colors">
        <X className="w-5 h-5 text-muted-foreground" />
      </Link>
      <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <div className="flex items-center gap-1">
        <Heart className="w-5 h-5 text-destructive fill-destructive" />
        <span className="text-sm font-bold text-foreground">{hearts}</span>
      </div>
    </div>
  );
}