import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Home, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BackButtonProps {
  className?: string;
}

const prettify = (seg: string) =>
  decodeURIComponent(seg)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const BackButton: React.FC<BackButtonProps> = ({ className }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);
  const current = segments.length ? prettify(segments[segments.length - 1]) : 'Home';

  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate('/');
  };

  // Keyboard shortcut: Alt + ←
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        handleBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <motion.nav
      aria-label="Page navigation"
      initial={{ y: -12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'flex items-center gap-1 rounded-full border border-border/60 bg-background/70 p-1 pr-3 shadow-lg backdrop-blur-md',
        className
      )}
    >
      <button
        onClick={handleBack}
        title="Go back (Alt + ←)"
        aria-label="Go back"
        className="group flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-foreground transition-all duration-300 hover:bg-primary/15 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-1" />
        <span className="hidden sm:inline">Back</span>
      </button>
      <button
        onClick={() => navigate('/')}
        title="Home"
        aria-label="Go home"
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-all duration-300 hover:bg-primary/15 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Home className="h-4 w-4" />
      </button>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden="true" />
      <span className="max-w-[45vw] truncate text-xs font-medium text-muted-foreground sm:max-w-xs" aria-current="page">
        {current}
      </span>
    </motion.nav>
  );
};
