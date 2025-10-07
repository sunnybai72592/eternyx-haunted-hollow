import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AuthModal } from '@/components/AuthModal';
import { useAuthStore } from '@/store/authStore';
import { 
  Zap, 
  Users, 
  ArrowRight,
  Terminal,
  Shield,
  Code,
  Lightbulb,
  Sparkles,
  Star,
  Wrench,
  Server,
  Brain
} from 'lucide-react';
import { motion } from 'framer-motion';
import { services } from '@/data/services';
import { toolCategories } from '@/data/tools';

interface ResponsiveMainContentProps {
  className?: string;
}

const SectionCard: React.FC<{ title: string; icon: React.ElementType; description: string; link: string; color: string }> = ({ title, icon: Icon, description, link, color }) => {
  const navigate = useNavigate();
  
  return (
    <motion.div
      whileHover={{ scale: 1.05, boxShadow: `0 0 20px ${color}80` }}
      whileTap={{ scale: 0.98 }}
      className={`cyber-card p-6 border-2 ${color.replace('text', 'border')} hover:shadow-xl hover:shadow-primary/50 transition-all duration-300 cursor-pointer relative overflow-hidden`}
      onClick={() => navigate(link)}
    >
      <div className="flex items-start justify-between mb-4">
        <Icon className={`w-8 h-8 ${color} transition-transform duration-500 group-hover:rotate-6`} />
        <ArrowRight className={`w-5 h-5 text-muted-foreground transition-transform duration-500 group-hover:translate-x-1 ${color.replace('text', 'group-hover:text')}`} />
      </div>
      <h3 className="text-xl font-bold mb-2 text-foreground font-mono">{title}</h3>
      <p className="text-sm text-muted-foreground/80">{description}</p>
    </motion.div>
  );
};

export const ResponsiveMainContent = ({ className = '' }: ResponsiveMainContentProps) => {
  const navigate = useNavigate();
  const { user, isAuthenticated, profile } = useAuthStore();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const containerRef = useRef<HTMLDivElement>(null);

  const handleAccessDashboard = () => {
    navigate('/dashboard');
  };

  const handleAuthClick = (mode: 'signin' | 'signup') => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const heroVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
  };

  const sectionVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, staggerChildren: 0.1 } },
  };

  const stats = [
    { value: '500+', label: 'Tools Available', color: 'text-cyan-400', icon: Wrench },
    { value: '24/7', label: 'Security Watch', color: 'text-green-400', icon: Shield },
    { value: '10K+', label: 'Agents Protected', color: 'text-purple-400', icon: Users },
    { value: '99.9%', label: 'Uptime SLA', color: 'text-orange-400', icon: Server },
  ];

  return (
    <motion.div 
      ref={containerRef} 
      className={`min-h-screen bg-black relative overflow-hidden ${className}`}
      initial="hidden"
      animate="visible"
    >
      {/* Background effects (keeping the cosmic theme) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Nebula background */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-blue-900/20 to-black"></div>
        {/* Simplified Star Field */}
        {Array.from({ length: 100 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white animate-twinkle"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: `${Math.random() * 2 + 1}px`,
              height: `${Math.random() * 2 + 1}px`,
              animationDelay: `${Math.random() * 3}s`,
              boxShadow: `0 0 4px rgba(255, 255, 255, 0.8)`
            }}
          />
        ))}
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 sm:px-6 lg:px-8 pt-16 pb-16">
        
        {/* 1. HERO SECTION - Title and Primary Actions */}
        <motion.section 
          className="text-center mb-16 sm:mb-24 max-w-4xl"
          variants={heroVariants}
        >
          <motion.div 
            className="text-sm sm:text-base text-cyan-400 mb-4 font-mono tracking-widest"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            {isAuthenticated ? (
              <>WELCOME BACK, <span className="text-green-400">{profile?.username || profile?.full_name || 'AGENT'}</span></>
            ) : (
              <>INITIATING ETERNYX PROTOCOL</>
            )}
          </motion.div>
          
          <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-extrabold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent mb-6 glitch-text-large">
            ETERNYX
          </h1>
          
          <p className="text-lg sm:text-xl md:text-2xl text-blue-300 font-light max-w-3xl mx-auto mb-10">
            The **Digital Kingdom** where advanced cybersecurity meets limitless innovation. Secure your future.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-6">
            {isAuthenticated ? (
              <Button
                onClick={handleAccessDashboard}
                className="neon-border-lg bg-primary hover:bg-primary/90 text-lg font-bold min-h-[52px] shadow-primary/50"
              >
                <Terminal className="w-5 h-5 mr-3" />
                ACCESS OPERATIONAL DASHBOARD
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => handleAuthClick('signin')}
                  className="neon-border-lg bg-primary hover:bg-primary/90 text-lg font-bold min-h-[52px] shadow-primary/50"
                >
                  <Zap className="w-5 h-5 mr-3" />
                  INITIATE LOGIN
                </Button>
                <Button
                  onClick={() => handleAuthClick('signup')}
                  variant="outline"
                  className="neon-border-lg border-purple-500/60 hover:border-purple-300 hover:bg-purple-500/20 text-purple-300 text-lg font-bold min-h-[52px]"
                >
                  <Users className="w-5 h-5 mr-3" />
                  REQUEST CREDENTIALS
                </Button>
              </>
            )}
          </div>
        </motion.section>

        {/* 2. STATS SECTION - Visual Hierarchy */}
        <motion.section 
          className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mb-16 w-full max-w-5xl"
          variants={sectionVariants}
        >
          {stats.map((stat, index) => (
            <motion.div 
              key={index}
              variants={heroVariants}
              className="bg-gradient-to-br from-black/50 to-transparent border border-border/50 rounded-xl p-4 backdrop-blur-sm text-center transition-all duration-300 hover:border-primary/80 hover:shadow-lg hover:shadow-primary/20"
            >
              <stat.icon className={`w-6 h-6 mx-auto mb-2 ${stat.color} animate-pulse`} />
              <div className={`text-3xl font-bold ${stat.color} mb-1 font-mono`}>{stat.value}</div>
              <div className="text-xs text-gray-400 uppercase tracking-wider">{stat.label}</div>
            </motion.div>
          ))}
        </motion.section>

        {/* 3. SERVICES SECTION - Connection to Services Page */}
        <motion.section 
          className="w-full max-w-5xl mb-16"
          variants={sectionVariants}
        >
          <h2 className="text-3xl font-bold text-center mb-8 text-primary flex items-center justify-center">
            <Server className="w-6 h-6 mr-3" />
            OPERATIONAL SERVICES
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {services.slice(0, 3).map((service) => (
              <SectionCard
                key={service.id}
                title={service.title}
                icon={service.icon}
                description={service.subtitle}
                link={service.link}
                color={service.color}
              />
            ))}
          </div>
          <div className="text-center mt-8">
            <Button
              onClick={() => navigate('/services')}
              variant="link"
              className="text-lg text-cyan-400 hover:text-cyan-300 transition-colors duration-300 font-mono"
            >
              VIEW FULL SERVICE CATALOG <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </motion.section>

        {/* 4. TOOLS CATEGORIES SECTION - Connection to Tool Categories */}
        <motion.section 
          className="w-full max-w-5xl mb-16"
          variants={sectionVariants}
        >
          <h2 className="text-3xl font-bold text-center mb-8 text-primary flex items-center justify-center">
            <Wrench className="w-6 h-6 mr-3" />
            TOOL CATEGORIES
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {toolCategories.map((category) => (
              <SectionCard
                key={category.id}
                title={category.name}
                icon={category.icon}
                description={category.description}
                link={category.route}
                color={category.id === 'cybersecurity' ? 'text-red-400' : category.id === 'web-development' ? 'text-blue-400' : 'text-purple-400'}
              />
            ))}
          </div>
        </motion.section>
      </div>

      <AuthModal 
        isOpen={authModalOpen} 
        onClose={() => setAuthModalOpen(false)} 
        initialMode={authMode} 
      />
    </motion.div>
  );
};
