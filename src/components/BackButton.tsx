import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Home, ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface BackButtonProps {
  className?: string;
}

const prettify = (segment: string) =>
  decodeURIComponent(segment)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

export const BackButton: React.FC<BackButtonProps> = ({ className }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const prefersReducedMotion = useReducedMotion();
  const segments = pathname.split("/").filter(Boolean);
  const current = segments.length ? prettify(segments[segments.length - 1]) : "Home";

  const handleBack = () => {
    const historyIndex = window.history.state?.idx;

    if (typeof historyIndex === "number" && historyIndex > 0) {
      navigate(-1);
      return;
    }

    // A direct visit has no in-app history. Return to the parent section
    // when possible instead of unexpectedly sending every visitor to Home.
    const parentPath = segments.length > 1
      ? `/${segments.slice(0, -1).join("/")}`
      : "/";
    navigate(parentPath, { replace: true });
  };

  return (
    <motion.nav
      aria-label="Page navigation"
      initial={prefersReducedMotion ? false : { y: -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-[#09111f]/85 p-1.5 pr-3 shadow-[0_10px_35px_rgba(0,0,0,.28)] backdrop-blur-xl",
        "supports-[backdrop-filter]:bg-[#09111f]/70",
        className
      )}
    >
      <button
        type="button"
        onClick={handleBack}
        title="Go back"
        aria-label="Go back to the previous page"
        className="group inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-slate-200 transition-[background-color,color,transform] duration-200 hover:bg-cyan-200/10 hover:text-cyan-100 active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09111f]"
      >
        <ArrowLeft className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5 motion-reduce:transform-none" />
        <span>Back</span>
      </button>
      <span className="h-5 w-px bg-white/10" aria-hidden="true" />
      <button
        type="button"
        onClick={() => navigate("/", { replace: pathname === "/" })}
        title="Go to ETERNYX home"
        aria-label="Go to ETERNYX home"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition-[background-color,color,transform] duration-200 hover:bg-cyan-200/10 hover:text-cyan-100 active:scale-[.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09111f]"
      >
        <Home className="h-4 w-4" />
      </button>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-600" aria-hidden="true" />
      <span className="max-w-[32vw] truncate pr-1 text-xs font-medium text-slate-300 sm:max-w-[220px]" aria-current="page">
        {current}
      </span>
    </motion.nav>
  );
};

export default BackButton;
