import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  Code, 
  Brain, 
  GraduationCap, 
  Sparkles, 
  CreditCard, 
  Mail,
  Terminal,
  Zap,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { AuthModal } from '@/components/AuthModal';
import { SectionCard, SectionCardData } from './SectionCard';
import { cn } from '@/lib/utils';

const sections: SectionCardData[] = [
  {
    id: 'cybersecurity',
    title: 'Cyber Security',
    subtitle: 'Advanced Threat Defense',
    description: 'Elite penetration testing, threat intelligence, and vulnerability assessment with military-grade precision.',
    icon: Shield,
    route: '/tools/category/cybersecurity',
    theme: 'cybersecurity',
    gradient: 'linear-gradient(145deg, #0a0a0a 0%, #1a0505 40%, #2d0a0a 70%, #0f0505 100%)',
    accentColor: '#dc2626',
    bgPattern: 'circuit',
  },
  {
    id: 'web-development',
    title: 'Web Development',
    subtitle: 'Modern Code Factory',
    description: 'Cutting-edge frontend, backend, and full-stack solutions built with precision engineering.',
    icon: Code,
    route: '/tools/category/web-development',
    theme: 'web-development',
    gradient: 'linear-gradient(145deg, #0a0f1a 0%, #0c1829 40%, #0f2140 70%, #081020 100%)',
    accentColor: '#3b82f6',
    bgPattern: 'grid',
  },
  {
    id: 'ai-automation',
    title: 'AI & Automation',
    subtitle: 'Intelligent Systems',
    description: 'Next-generation machine learning, neural networks, and intelligent automation pipelines.',
    icon: Brain,
    route: '/tools/category/digital-innovation',
    theme: 'ai-automation',
    gradient: 'linear-gradient(145deg, #0f0a1a 0%, #1a0f2e 40%, #2a1545 70%, #120a20 100%)',
    accentColor: '#a855f7',
    bgPattern: 'neural',
  },
  {
    id: 'education',
    title: 'Education Hub',
    subtitle: 'Knowledge Academy',
    description: 'Comprehensive certification programs, tutorials, and professional development pathways.',
    icon: GraduationCap,
    route: '/education',
    theme: 'education',
    gradient: 'linear-gradient(145deg, #0f0f05 0%, #1a1808 40%, #252010 70%, #100f05 100%)',
    accentColor: '#eab308',
    bgPattern: 'dots',
  },
  {
    id: 'eternyx-ai',
    title: 'Eternyx AI',
    subtitle: 'Flagship Intelligence',
    description: 'Premium AI assistant with advanced document analysis, deep reasoning, and enterprise capabilities.',
    icon: Sparkles,
    route: '/eternyx-ai',
    theme: 'eternyx-ai',
    gradient: 'linear-gradient(145deg, #030a10 0%, #051520 40%, #082030 70%, #020810 100%)',
    accentColor: '#06b6d4',
    bgPattern: 'neural',
  },
  {
    id: 'plans',
    title: 'Plans & Pricing',
    subtitle: 'Choose Your Tier',
    description: 'Flexible enterprise solutions from starter to unlimited, with transparent value-based pricing.',
    icon: CreditCard,
    route: '/premium',
    theme: 'plans',
    gradient: 'linear-gradient(145deg, #050f0a 0%, #0a1a10 40%, #0f2518 70%, #05100a 100%)',
    accentColor: '#22c55e',
    bgPattern: 'none',
  },
  {
    id: 'contact',
    title: 'Contact Us',
    subtitle: 'Get In Touch',
    description: 'Enterprise partnerships, custom solutions, and dedicated technical support channels.',
    icon: Mail,
    route: '/contact',
    theme: 'contact',
    gradient: 'linear-gradient(145deg, #0a0a0f 0%, #12121a 40%, #1a1a25 70%, #0a0a10 100%)',
    accentColor: '#6366f1',
    bgPattern: 'none',
  },
];

interface SectionSelectorProps {
  className?: string;
}

export const SectionSelector: React.FC<SectionSelectorProps> = ({ className = '' }) => {
  const navigate = useNavigate();
  const { isAuthenticated, profile } = useAuthStore();
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  const getBackgroundStyle = () => {
    if (!hoveredSection) {
      return {
        background: 'radial-gradient(ellipse at 50% 30%, rgba(6, 182, 212, 0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(168, 85, 247, 0.05) 0%, transparent 40%), #030303',
      };
    }
    const section = sections.find(s => s.id === hoveredSection);
    if (section) {
      return {
        background: `radial-gradient(ellipse at 50% 30%, ${section.accentColor}20 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, ${section.accentColor}10 0%, transparent 50%), #030303`,
      };
    }
    return { background: '#030303' };
  };

  return (
    <div 
      className={cn('min-h-screen relative overflow-hidden transition-all duration-1000', className)}
      style={getBackgroundStyle()}
    >
      {/* Subtle grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 40 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: `${Math.random() * 3 + 1}px`,
              height: `${Math.random() * 3 + 1}px`,
              background: hoveredSection 
                ? sections.find(s => s.id === hoveredSection)?.accentColor || '#fff'
                : '#fff',
              opacity: 0.4,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.2, 0.6, 0.2],
            }}
            transition={{
              duration: Math.random() * 4 + 3,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* Gradient orbs */}
      <AnimatePresence>
        {hoveredSection && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div 
              className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-[120px]"
              style={{ background: `${sections.find(s => s.id === hoveredSection)?.accentColor}15` }}
            />
            <div 
              className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full blur-[100px]"
              style={{ background: `${sections.find(s => s.id === hoveredSection)?.accentColor}10` }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content Container */}
      <div className="relative z-10 container mx-auto px-4 py-12 md:py-20">
        
        {/* Hero Header */}
        <motion.header 
          className="text-center mb-16 md:mb-24"
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Status indicator */}
          <motion.div 
            className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full border border-white/10 bg-white/[0.03] backdrop-blur-sm mb-8"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm text-white/60 font-light tracking-[0.2em] uppercase">
              {isAuthenticated ? `Welcome, ${profile?.username || 'Agent'}` : 'System Online'}
            </span>
          </motion.div>

          {/* Main title */}
          <motion.h1 
            className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black mb-6 tracking-tighter"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            <span className="bg-gradient-to-r from-white via-white/90 to-white/70 bg-clip-text text-transparent">
              ETERNYX
            </span>
          </motion.h1>

          <motion.p 
            className="text-lg md:text-xl lg:text-2xl text-white/40 max-w-2xl mx-auto mb-10 font-light leading-relaxed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
          >
            The future of digital excellence. Enterprise-grade solutions for{' '}
            <span className="text-white/70">security</span>,{' '}
            <span className="text-white/70">development</span>, and{' '}
            <span className="text-white/70">intelligence</span>.
          </motion.p>

          {/* Auth buttons */}
          <motion.div 
            className="flex flex-col sm:flex-row justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
          >
            {isAuthenticated ? (
              <Button
                size="lg"
                onClick={() => navigate('/dashboard')}
                className="bg-white text-black hover:bg-white/90 font-semibold px-10 py-6 text-base rounded-full transition-all duration-300 hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]"
              >
                <Terminal className="w-5 h-5 mr-2" />
                Open Dashboard
              </Button>
            ) : (
              <>
                <Button
                  size="lg"
                  onClick={() => { setAuthMode('signin'); setAuthModalOpen(true); }}
                  className="bg-white text-black hover:bg-white/90 font-semibold px-10 py-6 text-base rounded-full transition-all duration-300 hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]"
                >
                  <Zap className="w-5 h-5 mr-2" />
                  Sign In
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => { setAuthMode('signup'); setAuthModalOpen(true); }}
                  className="border-white/20 text-white/80 hover:bg-white/10 hover:border-white/40 px-10 py-6 text-base rounded-full transition-all duration-300"
                >
                  <Users className="w-5 h-5 mr-2" />
                  Create Account
                </Button>
              </>
            )}
          </motion.div>
        </motion.header>

        {/* Section Grid */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 1 }}
        >
          <motion.h2 
            className="text-center text-xs uppercase tracking-[0.4em] text-white/30 mb-12 font-light"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            Select Your Destination
          </motion.h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 md:gap-6">
            {sections.map((section, index) => (
              <SectionCard
                key={section.id}
                section={section}
                isHovered={hoveredSection === section.id}
                isAnyHovered={hoveredSection !== null}
                onHover={setHoveredSection}
                index={index}
              />
            ))}
          </div>
        </motion.section>

        {/* Minimal footer stats */}
        <motion.footer
          className="mt-20 md:mt-32 flex flex-wrap justify-center gap-8 md:gap-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
        >
          {[
            { value: '500+', label: 'Tools' },
            { value: '24/7', label: 'Monitoring' },
            { value: '10K+', label: 'Users' },
            { value: '99.9%', label: 'Uptime' },
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-2xl md:text-3xl font-light text-white/80 mb-1">
                {stat.value}
              </div>
              <div className="text-xs text-white/30 uppercase tracking-[0.2em]">
                {stat.label}
              </div>
            </div>
          ))}
        </motion.footer>
      </div>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={authModalOpen} 
        onClose={() => setAuthModalOpen(false)} 
        initialMode={authMode} 
      />
    </div>
  );
};

export default SectionSelector;
