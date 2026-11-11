import React, { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocation, useNavigationType } from "react-router-dom";

interface PageTransitionWrapperProps {
  children: React.ReactNode;
}

export const PageTransitionWrapper: React.FC<PageTransitionWrapperProps> = ({ children }) => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    // Start each new route at the top. Hash links remain responsible for
    // their own target scrolling.
    if (location.hash) return;
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [location.pathname, location.search, location.hash, prefersReducedMotion]);

  const initialY = navigationType === "POP" ? -8 : 8;
  const exitY = navigationType === "POP" ? 8 : -8;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.key}
        initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: initialY, filter: "blur(3px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: exitY, filter: "blur(2px)" }}
        transition={{
          duration: prefersReducedMotion ? 0 : 0.22,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="w-full will-change-[opacity,transform]"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

export default PageTransitionWrapper;
