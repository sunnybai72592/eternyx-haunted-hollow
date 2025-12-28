import React, { useState } from 'react';
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

  // Animation variants
  const cardVariants = {
    initial: { 
      opacity: 0, 
      y: 50,
      scale: 0.9 
    },
    animate: { 
      opacity: 1, 
      y: 0,
      scale: 1,
      transition: { 
        duration: 0.5, 
        delay: index * 0.1,
        ease: 'easeOut' as const
      } 
    },
    hover: {
      scale: 1.05,
      zIndex: 50,
      transition: { duration: 0.3, ease: 'easeOut' }
    },
    notHovered: {
      scale: 0.95,
      opacity: 0.5,
      filter: 'blur(2px)',
      transition: { duration: 0.3 }
    }
  };

  const getCardState = () => {
    if (isHovered) return 'hover';
    if (isAnyHovered) return 'notHovered';
    return 'animate';
  };

  return (
    <motion.div
      className={cn(
        'relative group cursor-pointer rounded-2xl overflow-hidden',
        'min-h-[280px] md:min-h-[320px] lg:min-h-[360px]',
        'flex flex-col justify-end p-6 md:p-8',
        'border border-white/10 backdrop-blur-sm',
        'transition-all duration-500'
      )}
      style={{
        background: section.gradient,
      }}
      variants={cardVariants}
      initial="initial"
      animate={getCardState()}
      onMouseEnter={() => onHover(section.id)}
      onMouseLeave={() => onHover(null)}
      onClick={handleClick}
      whileTap={{ scale: 0.98 }}
    >
      {/* Background Pattern */}
      {section.bgPattern === 'grid' && (
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `
              linear-gradient(${section.accentColor}20 1px, transparent 1px),
              linear-gradient(90deg, ${section.accentColor}20 1px, transparent 1px)
            `,
            backgroundSize: '30px 30px'
          }}
        />
      )}
      
      {section.bgPattern === 'circuit' && (
        <div className="absolute inset-0 opacity-20">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <pattern id={`circuit-${section.id}`} width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M10 0v10h10" fill="none" stroke={section.accentColor} strokeWidth="0.5" opacity="0.5" />
              <circle cx="10" cy="10" r="1.5" fill={section.accentColor} opacity="0.3" />
            </pattern>
            <rect width="100%" height="100%" fill={`url(#circuit-${section.id})`} />
          </svg>
        </div>
      )}

      {section.bgPattern === 'neural' && (
        <div className="absolute inset-0">
          <div 
            className="absolute inset-0 opacity-30"
            style={{
              background: `
                radial-gradient(circle at 20% 30%, ${section.accentColor}30 0%, transparent 40%),
                radial-gradient(circle at 80% 70%, ${section.accentColor}20 0%, transparent 40%)
              `
            }}
          />
        </div>
      )}

      {/* Glow effect on hover */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              background: `radial-gradient(circle at center, ${section.accentColor}30 0%, transparent 70%)`,
            }}
          />
        )}
      </AnimatePresence>

      {/* Scanline effect for cybersecurity */}
      {section.theme === 'cybersecurity' && (
        <div 
          className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)',
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10">
        {/* Icon */}
        <motion.div
          className={cn(
            'w-14 h-14 md:w-16 md:h-16 rounded-xl mb-4 md:mb-6',
            'flex items-center justify-center',
            'backdrop-blur-md border border-white/20'
          )}
          style={{ backgroundColor: `${section.accentColor}20` }}
          animate={isHovered ? { scale: 1.1, rotate: 5 } : { scale: 1, rotate: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Icon 
            className="w-7 h-7 md:w-8 md:h-8" 
            style={{ color: section.accentColor }}
          />
        </motion.div>

        {/* Title */}
        <h3 
          className="text-xl md:text-2xl lg:text-3xl font-bold mb-2 text-white font-mono tracking-tight"
          style={{ textShadow: isHovered ? `0 0 20px ${section.accentColor}` : 'none' }}
        >
          {section.title}
        </h3>

        {/* Subtitle - visible on hover or always on mobile */}
        <AnimatePresence>
          <motion.p
            className="text-sm md:text-base text-white/70 mb-4 line-clamp-2"
            initial={{ opacity: 0, height: 0 }}
            animate={{ 
              opacity: isHovered ? 1 : 0.6, 
              height: 'auto' 
            }}
            transition={{ duration: 0.3 }}
          >
            {section.subtitle}
          </motion.p>
        </AnimatePresence>

        {/* Description - only on hover */}
        <AnimatePresence>
          {isHovered && (
            <motion.p
              className="text-xs md:text-sm text-white/60 mb-4 line-clamp-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
            >
              {section.description}
            </motion.p>
          )}
        </AnimatePresence>

        {/* CTA Arrow */}
        <motion.div
          className="flex items-center gap-2 text-sm font-medium"
          style={{ color: section.accentColor }}
          animate={isHovered ? { x: 8 } : { x: 0 }}
          transition={{ duration: 0.2 }}
        >
          <span>Explore</span>
          <ArrowRight className="w-4 h-4" />
        </motion.div>
      </div>

      {/* Border glow on hover */}
      {isHovered && (
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            boxShadow: `inset 0 0 0 2px ${section.accentColor}, 0 0 40px ${section.accentColor}40`,
          }}
        />
      )}
    </motion.div>
  );
};

export default SectionCard;
