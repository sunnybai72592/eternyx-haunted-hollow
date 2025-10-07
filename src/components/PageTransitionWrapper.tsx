import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

interface PageTransitionWrapperProps {
  children: React.ReactNode;
}

const transitionVariants = {
  initial: {
    opacity: 0,
    x: 50,
    scale: 0.98,
  },
  in: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 100,
      damping: 20,
      duration: 0.5,
    },
  },
  out: {
    opacity: 0,
    x: -50,
    scale: 0.98,
    transition: {
      duration: 0.3,
    },
  },
};

export const PageTransitionWrapper: React.FC<PageTransitionWrapperProps> = ({ children }) => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        variants={transitionVariants}
        initial="initial"
        animate="in"
        exit="out"
        className="w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};
