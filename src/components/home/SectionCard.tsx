import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SectionCardData {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: LucideIcon;
  route: string;
  theme: string;
  gradient: string;
  accentColor: string;
  bgPattern?: 'grid' | 'dots' | 'circuit' | 'neural' | 'none';
}

interface SectionCardProps {
  section: SectionCardData;
  isHovered: boolean;
  isAnyHovered: boolean;
  onHover: (id: string | null) => void;
  index: number;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  section,
  isHovered,
  isAnyHovered,
  onHover,
  index,
}) => {
  const navigate = useNavigate();
  const Icon = section.icon;

  const handleClick = () => {
    navigate(section.route);
  };

  return (
    <motion.div
      className={cn(
        'relative group cursor-pointer rounded-2xl overflow-hidden',
        'min-h-[300px] md:min-h-[340px]',
        'flex flex-col justify-end p-6 md:p-8',
        'border border-white/[0.08] backdrop-blur-sm',
        'transition-all duration-500'
      )}
      style={{
        background: section.gradient,
      }}
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ 
        opacity: isAnyHovered && !isHovered ? 0.5 : 1, 
        y: 0, 
        scale: isHovered ? 1.02 : isAnyHovered ? 0.98 : 1,
        filter: isAnyHovered && !isHovered ? 'blur(1px)' : 'blur(0px)',
      }}
      transition={{ 
        duration: 0.5, 
        delay: index * 0.08,
        ease: [0.25, 0.46, 0.45, 0.94]
      }}
      onMouseEnter={() => onHover(section.id)}
      onMouseLeave={() => onHover(null)}
      onClick={handleClick}
      whileTap={{ scale: 0.98 }}
    >
      {/* Background Pattern - Grid */}
      {section.bgPattern === 'grid' && (
        <div 
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: `
              linear-gradient(${section.accentColor}40 1px, transparent 1px),
              linear-gradient(90deg, ${section.accentColor}40 1px, transparent 1px)
            `,
            backgroundSize: '24px 24px'
          }}
        />
      )}
      
      {/* Background Pattern - Circuit */}
      {section.bgPattern === 'circuit' && (
        <div className="absolute inset-0 opacity-20">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <pattern id={`circuit-${section.id}`} width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M10 0v10h10" fill="none" stroke={section.accentColor} strokeWidth="0.3" opacity="0.6" />
              <circle cx="10" cy="10" r="1" fill={section.accentColor} opacity="0.4" />
              <path d="M0 5h5" fill="none" stroke={section.accentColor} strokeWidth="0.2" opacity="0.4" />
            </pattern>
            <rect width="100%" height="100%" fill={`url(#circuit-${section.id})`} />
          </svg>
        </div>
      )}

      {/* Background Pattern - Neural */}
      {section.bgPattern === 'neural' && (
        <div className="absolute inset-0">
          <div 
            className="absolute inset-0 opacity-30"
            style={{
              background: `
                radial-gradient(circle at 15% 25%, ${section.accentColor}25 0%, transparent 35%),
                radial-gradient(circle at 85% 75%, ${section.accentColor}15 0%, transparent 35%),
                radial-gradient(circle at 50% 50%, ${section.accentColor}08 0%, transparent 50%)
              `
            }}
          />
        </div>
      )}

      {/* Background Pattern - Dots */}
      {section.bgPattern === 'dots' && (
        <div 
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: `radial-gradient(circle, ${section.accentColor} 1px, transparent 1px)`,
            backgroundSize: '20px 20px'
          }}
        />
      )}

      {/* Hover glow effect */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              background: `radial-gradient(ellipse at 50% 80%, ${section.accentColor}25 0%, transparent 60%)`,
            }}
          />
        )}
      </AnimatePresence>

      {/* Top accent line */}
      <motion.div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: section.accentColor }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: isHovered ? 1 : 0 }}
        transition={{ duration: 0.4 }}
      />

      {/* Content */}
      <div className="relative z-10">
        {/* Icon */}
        <motion.div
          className={cn(
            'w-12 h-12 md:w-14 md:h-14 rounded-xl mb-5',
            'flex items-center justify-center',
            'border border-white/10'
          )}
          style={{ 
            backgroundColor: `${section.accentColor}15`,
          }}
          animate={isHovered ? { scale: 1.1 } : { scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Icon 
            className="w-6 h-6 md:w-7 md:h-7" 
            style={{ color: section.accentColor }}
          />
        </motion.div>

        {/* Title */}
        <h3 
          className="text-xl md:text-2xl font-semibold mb-2 text-white tracking-tight"
          style={{ textShadow: isHovered ? `0 0 30px ${section.accentColor}60` : 'none' }}
        >
          {section.title}
        </h3>

        {/* Subtitle */}
        <p
          className="text-sm text-white/50 mb-3 font-light"
        >
          {section.subtitle}
        </p>

        {/* Description - visible on hover */}
        <AnimatePresence>
          {isHovered && (
            <motion.p
              className="text-sm text-white/40 mb-4 leading-relaxed"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              {section.description}
            </motion.p>
          )}
        </AnimatePresence>

        {/* CTA */}
        <motion.div
          className="flex items-center gap-2 text-sm font-medium"
          style={{ color: section.accentColor }}
          animate={isHovered ? { x: 6 } : { x: 0 }}
          transition={{ duration: 0.25 }}
        >
          <span className="opacity-80">Explore</span>
          <ArrowRight className="w-4 h-4" />
        </motion.div>
      </div>

      {/* Border glow on hover */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              boxShadow: `inset 0 0 0 1px ${section.accentColor}60, 0 0 40px ${section.accentColor}20`,
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default SectionCard;
