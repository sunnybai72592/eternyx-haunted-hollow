import React, { useState, useEffect } from 'react';
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
    description: 'Dark cyber-punk arsenal for threat detection, penetration testing, and vulnerability assessment.',
    icon: Shield,
    route: '/tools/category/cybersecurity',
    theme: 'cybersecurity',
    gradient: 'linear-gradient(135deg, hsl(350 80% 15%) 0%, hsl(0 70% 10%) 50%, hsl(330 60% 8%) 100%)',
    accentColor: '#ff3355',
    bgPattern: 'circuit',
  },
  {
    id: 'web-development',
    title: 'Web Development',
    subtitle: 'Modern Code Factory',
    description: 'Clean, efficient tools for frontend, backend, and full-stack development with best practices.',
    icon: Code,
    route: '/tools/category/web-development',
    theme: 'web-development',
    gradient: 'linear-gradient(135deg, hsl(210 40% 15%) 0%, hsl(200 50% 12%) 50%, hsl(220 45% 8%) 100%)',
    accentColor: '#3b82f6',
    bgPattern: 'grid',
  },
  {
    id: 'ai-automation',
    title: 'AI & Automation',
    subtitle: 'Intelligent Systems',
    description: 'Futuristic AI integration, machine learning tools, and intelligent automation solutions.',
    icon: Brain,
    route: '/tools/category/digital-innovation',
    theme: 'ai-automation',
    gradient: 'linear-gradient(135deg, hsl(280 50% 12%) 0%, hsl(260 40% 10%) 50%, hsl(300 45% 8%) 100%)',
    accentColor: '#a855f7',
    bgPattern: 'neural',
  },
  {
    id: 'education',
    title: 'Education',
    subtitle: 'Knowledge Academy',
    description: 'Comprehensive learning resources, tutorials, and certification programs for tech professionals.',
    icon: GraduationCap,
    route: '/education',
    theme: 'education',
    gradient: 'linear-gradient(135deg, hsl(35 40% 15%) 0%, hsl(30 35% 12%) 50%, hsl(25 30% 8%) 100%)',
    accentColor: '#f59e0b',
    bgPattern: 'dots',
  },
  {
    id: 'eternyx-ai',
    title: 'Eternyx AI',
    subtitle: 'Flagship Intelligence',
    description: 'Our premium AI assistant with advanced document analysis, conversation memory, and deep insights.',
    icon: Sparkles,
    route: '/eternyx-ai',
    theme: 'eternyx-ai',
    gradient: 'linear-gradient(135deg, hsl(185 60% 12%) 0%, hsl(220 50% 8%) 50%, hsl(280 40% 10%) 100%)',
    accentColor: '#06b6d4',
    bgPattern: 'neural',
  },
  {
    id: 'plans',
    title: 'Plans & Pricing',
    subtitle: 'Choose Your Tier',
    description: 'Flexible subscription options from free tier to enterprise, with transparent pricing.',
    icon: CreditCard,
    route: '/premium',
    theme: 'plans',
    gradient: 'linear-gradient(135deg, hsl(145 40% 12%) 0%, hsl(160 35% 10%) 50%, hsl(140 30% 8%) 100%)',
    accentColor: '#22c55e',
    bgPattern: 'none',
  },
  {
    id: 'contact',
    title: 'Contact Us',
    subtitle: 'Get In Touch',
    description: 'Reach out for custom solutions, enterprise partnerships, or technical support.',
    icon: Mail,
    route: '/contact',
    theme: 'contact',
    gradient: 'linear-gradient(135deg, hsl(210 30% 12%) 0%, hsl(200 25% 10%) 50%, hsl(220 20% 8%) 100%)',
    accentColor: '#64748b',
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

  // Background gradient based on hovered section
  const getBackgroundGradient = () => {
    if (!hoveredSection) {
      return 'radial-gradient(ellipse at center, hsl(220 50% 8%) 0%, hsl(220 60% 3%) 100%)';
    }
    const section = sections.find(s => s.id === hoveredSection);
    if (section) {
      return `radial-gradient(ellipse at center, ${section.accentColor}15 0%, hsl(220 60% 3%) 70%)`;
    }
    return 'radial-gradient(ellipse at center, hsl(220 50% 8%) 0%, hsl(220 60% 3%) 100%)';
  };

  return (
    <div 
      className={cn('min-h-screen relative overflow-hidden transition-all duration-700', className)}
      style={{ background: getBackgroundGradient() }}
    >
      {/* Animated background stars */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 80 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: `${Math.random() * 2 + 1}px`,
              height: `${Math.random() * 2 + 1}px`,
            }}
            animate={{
              opacity: [0.3, 1, 0.3],
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: Math.random() * 3 + 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* Gradient overlay based on hovered section */}
      <AnimatePresence>
        {hoveredSection && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            style={{
              background: `radial-gradient(circle at 50% 30%, ${sections.find(s => s.id === hoveredSection)?.accentColor}20 0%, transparent 50%)`,
            }}
          />
        )}
      </AnimatePresence>

      {/* Content Container */}
      <div className="relative z-10 container mx-auto px-4 py-8 md:py-16">
        
        {/* Hero Header */}
        <motion.header 
          className="text-center mb-12 md:mb-20"
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          {/* Status indicator */}
          <motion.div 
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 mb-6"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-sm text-cyan-400 font-mono tracking-wider">
              {isAuthenticated ? `AGENT ${profile?.username || 'ACTIVE'}` : 'SYSTEM READY'}
            </span>
          </motion.div>

          {/* Main title */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black mb-4 md:mb-6">
            <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
              ETERNYX
            </span>
          </h1>

          <p className="text-lg md:text-xl lg:text-2xl text-white/60 max-w-3xl mx-auto mb-8 font-light">
            Your digital command center for{' '}
            <span className="text-cyan-400">cybersecurity</span>,{' '}
            <span className="text-blue-400">development</span>, and{' '}
            <span className="text-purple-400">innovation</span>
          </p>

          {/* Auth buttons */}
          <motion.div 
            className="flex flex-col sm:flex-row justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            {isAuthenticated ? (
              <Button
                size="lg"
                onClick={() => navigate('/dashboard')}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold px-8 py-6 text-lg shadow-lg shadow-cyan-500/25"
              >
                <Terminal className="w-5 h-5 mr-2" />
                ACCESS DASHBOARD
              </Button>
            ) : (
              <>
                <Button
                  size="lg"
                  onClick={() => { setAuthMode('signin'); setAuthModalOpen(true); }}
                  className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold px-8 py-6 text-lg shadow-lg shadow-cyan-500/25"
                >
                  <Zap className="w-5 h-5 mr-2" />
                  SIGN IN
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => { setAuthMode('signup'); setAuthModalOpen(true); }}
                  className="border-purple-500/50 text-purple-300 hover:bg-purple-500/20 hover:border-purple-400 px-8 py-6 text-lg"
                >
                  <Users className="w-5 h-5 mr-2" />
                  CREATE ACCOUNT
                </Button>
              </>
            )}
          </motion.div>
        </motion.header>

        {/* Section Grid */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8 }}
        >
          <h2 className="text-center text-sm uppercase tracking-[0.3em] text-white/40 mb-8 font-mono">
            Select Your Destination
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
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

        {/* Stats Footer */}
        <motion.footer
          className="mt-16 md:mt-24 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.6 }}
        >
          {[
            { value: '500+', label: 'Tools', color: 'text-cyan-400' },
            { value: '24/7', label: 'Monitoring', color: 'text-green-400' },
            { value: '10K+', label: 'Users', color: 'text-purple-400' },
            { value: '99.9%', label: 'Uptime', color: 'text-orange-400' },
          ].map((stat, i) => (
            <div 
              key={i}
              className="text-center p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm"
            >
              <div className={cn('text-2xl md:text-3xl font-bold font-mono', stat.color)}>
                {stat.value}
              </div>
              <div className="text-xs md:text-sm text-white/50 uppercase tracking-wider mt-1">
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
