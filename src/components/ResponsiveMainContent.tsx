import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AuthModal } from '@/components/AuthModal';
import { signInWithGoogle } from "../services/authService";
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
  Star
} from 'lucide-react';

interface ResponsiveMainContentProps {
  className?: string;
}

export const ResponsiveMainContent = ({ className = '' }: ResponsiveMainContentProps) => {
  const navigate = useNavigate();
  const { user, isAuthenticated, profile } = useAuthStore();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [stars, setStars] = useState<Array<{ id: number; x: number; y: number; size: number; delay: number }>>([]);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Create cosmic stars background
  useEffect(() => {
    const newStars = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      delay: Math.random() * 3
    }));
    setStars(newStars);
  }, []);

  // Track mouse for satellite effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setMousePos({
          x: ((e.clientX - rect.left) / rect.width) * 100,
          y: ((e.clientY - rect.top) / rect.height) * 100
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const createStarBurst = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Create star burst particles
    const particles = Array.from({ length: 12 }, (_, i) => {
      const angle = (i / 12) * Math.PI * 2;
      const particle = document.createElement('div');
      particle.className = 'absolute w-2 h-2 bg-cyan-400 rounded-full pointer-events-none';
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      particle.style.animation = 'starBurst 0.6s ease-out forwards';
      particle.style.setProperty('--tx', `${Math.cos(angle) * 50}px`);
      particle.style.setProperty('--ty', `${Math.sin(angle) * 50}px`);
      e.currentTarget.appendChild(particle);
      
      setTimeout(() => particle.remove(), 600);
    });
  };

  const handleInitializeConnection = async () => {
    if (isAuthenticated) {
      navigate("/cyber-arena");
    } else {
      // Attempt Google Sign-in
      const { error } = await signInWithGoogle();
      if (error) {
        console.error("Google Sign-in failed:", error);
        // Fallback to AuthModal if Google Sign-in fails or user cancels
        setAuthMode("signin");
        setAuthModalOpen(true);
      }
    }
  };

  const handleJoinNetwork = async () => {
    // Attempt Google Sign-in for signup
    const { error } = await signInWithGoogle();
    if (error) {
      console.error("Google Sign-in failed:", error);
      // Fallback to AuthModal if Google Sign-in fails or user cancels
      setAuthMode("signup");
      setAuthModalOpen(true);
    }
  };

  const handleAccessDashboard = () => {
    navigate('/dashboard');
  };

  const handleNavigateWithAnimation = (path: string, e: React.MouseEvent) => {
    createStarBurst(e);
    setTimeout(() => navigate(path), 300);
  };

  return (
    <div ref={containerRef} className={`min-h-screen bg-black relative overflow-hidden ${className}`}>
      {/* Cosmic Kingdom Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Nebula background */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-blue-900/20 to-black"></div>
        
        {/* Animated stars */}
        {stars.map(star => (
          <div
            key={star.id}
            className="absolute rounded-full bg-white animate-twinkle"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              animationDelay: `${star.delay}s`,
              boxShadow: `0 0 ${star.size * 2}px rgba(255, 255, 255, 0.8)`
            }}
          />
        ))}
        
        {/* Satellite cursor follower */}
        <div 
          className="absolute w-8 h-8 pointer-events-none transition-all duration-700 ease-out"
          style={{
            left: `${mousePos.x}%`,
            top: `${mousePos.y}%`,
            transform: 'translate(-50%, -50%)'
          }}
        >
          <div className="relative w-full h-full">
            <Sparkles className="w-8 h-8 text-cyan-400 animate-spin-slow opacity-60" />
            <div className="absolute inset-0 bg-cyan-400/20 rounded-full animate-ping"></div>
          </div>
        </div>

        {/* Constellation lines */}
        <svg className="absolute inset-0 w-full h-full opacity-20">
          <defs>
            <linearGradient id="constellationGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          {stars.slice(0, 20).map((star, i) => {
            const nextStar = stars[(i + 1) % 20];
            return (
              <line
                key={`line-${i}`}
                x1={`${star.x}%`}
                y1={`${star.y}%`}
                x2={`${nextStar.x}%`}
                y2={`${nextStar.y}%`}
                stroke="url(#constellationGradient)"
                strokeWidth="1"
                className="animate-pulse"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            );
          })}
        </svg>
        
        {/* Shooting stars */}
        <div className="absolute inset-0">
          {[1, 2, 3].map(i => (
            <div
              key={`shooting-${i}`}
              className="absolute w-1 h-1 bg-white rounded-full animate-shooting-star"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 50}%`,
                animationDelay: `${i * 3}s`,
                boxShadow: '0 0 10px 2px rgba(255, 255, 255, 0.8), 0 0 20px 4px rgba(100, 200, 255, 0.6)'
              }}
            />
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 sm:px-6 lg:px-8 pt-16">
        {/* Welcome Message */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="text-sm sm:text-base text-cyan-400 mb-2 sm:mb-4 font-mono">
            {isAuthenticated ? (
              <>Welcome back, <span className="text-green-400">{profile?.username || profile?.full_name || 'Agent'}</span></>
            ) : (
              <>Welcome, <span className="text-green-400">hacker</span></>
            )}
          </div>
          
          {/* Main Logo - Kingdom Crown */}
          <div className="mb-6 sm:mb-8 relative">
            <div className="absolute inset-0 blur-3xl opacity-30">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 animate-pulse"></div>
            </div>
            <h1 className="relative text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent mb-4 sm:mb-6 animate-float">
              <span className="inline-block hover:scale-110 transition-transform duration-300">E</span>
              <span className="inline-block hover:scale-110 transition-transform duration-300 delay-75">T</span>
              <span className="inline-block hover:scale-110 transition-transform duration-300 delay-100">E</span>
              <span className="inline-block hover:scale-110 transition-transform duration-300 delay-150">R</span>
              <span className="inline-block hover:scale-110 transition-transform duration-300 delay-200">N</span>
              <span className="inline-block hover:scale-110 transition-transform duration-300 delay-250">Y</span>
              <span className="inline-block hover:scale-110 transition-transform duration-300 delay-300">X</span>
            </h1>
            
            {/* Kingdom Subtitle */}
            <div className="text-base sm:text-lg md:text-xl text-blue-400 mb-2 font-mono animate-pulse">
              <Star className="inline w-4 h-4 mr-2 text-yellow-400" />
              The Digital Kingdom
              <Star className="inline w-4 h-4 ml-2 text-yellow-400" />
            </div>
            <div className="flex items-center justify-center gap-2 text-sm sm:text-base text-gray-300 font-mono">
              <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span className="text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer">Cybersecurity Galaxy</span>
              <span>•</span>
              <span className="text-purple-400 hover:text-purple-300 transition-colors cursor-pointer">Innovation Constellation</span>
              <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Stellar Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 w-full max-w-md sm:max-w-lg">
          {/* Primary Star Button */}
          <Button
            onClick={(e) => {
              createStarBurst(e);
              setTimeout(handleInitializeConnection, 300);
            }}
            className="
              group relative flex-1 h-12 sm:h-14 px-6 sm:px-8 
              bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600
              hover:from-cyan-400 hover:via-blue-500 hover:to-purple-500
              text-white font-bold text-sm sm:text-base
              rounded-xl shadow-2xl shadow-cyan-500/50
              hover:shadow-cyan-400/70 hover:scale-110
              transition-all duration-500 ease-out
              border-2 border-cyan-400/30 hover:border-cyan-300/60
              min-h-[48px] touch-manipulation overflow-hidden
              animate-pulse-glow
            "
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -skew-x-12 transform -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            <Terminal className="relative w-4 h-4 sm:w-5 sm:h-5 mr-2 flex-shrink-0 group-hover:rotate-12 transition-transform duration-300" />
            <span className="relative">{isAuthenticated ? '✨ Enter Cyber Galaxy' : '🌟 Initialize Portal'}</span>
            <ArrowRight className="relative w-4 h-4 sm:w-5 sm:h-5 ml-2 flex-shrink-0 group-hover:translate-x-1 transition-transform duration-300" />
            
            {/* Orbiting particles */}
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-cyan-300 rounded-full animate-ping"></div>
            <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
          </Button>

          {/* Secondary Star Button */}
          {!isAuthenticated && (
            <Button
              onClick={(e) => {
                createStarBurst(e);
                setTimeout(handleJoinNetwork, 300);
              }}
              variant="outline"
              className="
                group relative flex-1 h-12 sm:h-14 px-6 sm:px-8 
                bg-black/40 backdrop-blur-sm border-2 border-purple-500/60 
                hover:border-purple-300 hover:bg-purple-500/20
                text-purple-300 hover:text-white
                font-bold text-sm sm:text-base
                rounded-xl shadow-2xl shadow-purple-500/30
                hover:shadow-purple-400/60 hover:scale-110
                transition-all duration-500 ease-out
                min-h-[48px] touch-manipulation overflow-hidden
              "
            >
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-400/20 to-purple-500/0 -skew-x-12 transform -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
              <Users className="relative w-4 h-4 sm:w-5 sm:h-5 mr-2 flex-shrink-0 group-hover:scale-125 transition-transform duration-300" />
              <span className="relative">💫 Join Constellation</span>
              <Zap className="relative w-4 h-4 sm:w-5 sm:h-5 ml-2 flex-shrink-0 group-hover:rotate-180 transition-transform duration-500" />
            </Button>
          )}
        </div>

        {/* Only show feature cards when not authenticated */}
        {!isAuthenticated && (
          <>
            {/* Moon Portal Dashboard Button */}
            <div className="mt-8 sm:mt-12">
              <Button
                onClick={(e) => {
                  createStarBurst(e);
                  setTimeout(handleAccessDashboard, 300);
                }}
                variant="ghost"
                className="
                  group relative px-6 sm:px-8 py-3 sm:py-4 
                  text-gray-200 hover:text-cyan-300
                  border-2 border-gray-600/50 hover:border-cyan-400/80
                  rounded-2xl bg-black/30 backdrop-blur-md hover:bg-gradient-to-r hover:from-cyan-950/50 hover:to-purple-950/50
                  transition-all duration-700 ease-out hover:scale-110
                  text-sm sm:text-base
                  min-h-[44px] touch-manipulation overflow-hidden
                  shadow-lg shadow-gray-800/50 hover:shadow-cyan-500/50
                "
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-400/10 to-cyan-500/0 translate-y-full group-hover:translate-y-0 transition-transform duration-700"></div>
                <Shield className="relative w-4 h-4 sm:w-5 sm:h-5 mr-2 flex-shrink-0 group-hover:rotate-[360deg] transition-transform duration-700" />
                <span className="relative font-mono">🌙 Access Moon Portal</span>
                <Star className="relative w-4 h-4 sm:w-5 sm:h-5 ml-2 text-yellow-400 animate-pulse" />
              </Button>
            </div>

            {/* Stats Section */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mb-12 sm:mb-16 w-full max-w-4xl">
              <div className="bg-gradient-to-br from-cyan-500/10 to-transparent border border-cyan-500/30 rounded-xl p-4 backdrop-blur-sm">
                <div className="text-3xl font-bold text-cyan-400 mb-1">500+</div>
                <div className="text-xs text-gray-400">Tools Available</div>
              </div>
              <div className="bg-gradient-to-br from-green-500/10 to-transparent border border-green-500/30 rounded-xl p-4 backdrop-blur-sm">
                <div className="text-3xl font-bold text-green-400 mb-1">24/7</div>
                <div className="text-xs text-gray-400">Security Watch</div>
              </div>
              <div className="bg-gradient-to-br from-purple-500/10 to-transparent border border-purple-500/30 rounded-xl p-4 backdrop-blur-sm">
                <div className="text-3xl font-bold text-purple-400 mb-1">10K+</div>
                <div className="text-xs text-gray-400">Users Protected</div>
              </div>
              <div className="bg-gradient-to-br from-orange-500/10 to-transparent border border-orange-500/30 rounded-xl p-4 backdrop-blur-sm">
                <div className="text-3xl font-bold text-orange-400 mb-1">99.9%</div>
                <div className="text-xs text-gray-400">Uptime SLA</div>
              </div>
            </div>

            {/* Cosmic Galaxy Cards - Each Page is a Galaxy */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 w-full max-w-4xl">
              {/* Cybersecurity Galaxy */}
              <div 
                onClick={(e) => handleNavigateWithAnimation('/services', e)}
                className="
                  group relative p-6 sm:p-8 bg-gradient-to-br from-blue-950/40 via-cyan-950/30 to-black/40
                  border-2 border-blue-500/30 backdrop-blur-md
                  rounded-2xl hover:border-cyan-400/80 hover:bg-gradient-to-br hover:from-blue-900/60 hover:via-cyan-900/50 hover:to-purple-900/40
                  transition-all duration-700 ease-out cursor-pointer hover:scale-110 hover:-translate-y-2
                  min-h-[160px] touch-manipulation overflow-hidden
                  shadow-2xl shadow-blue-900/30 hover:shadow-cyan-500/50
                "
              >
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                <div className="absolute top-2 right-2 flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.1}s` }}></div>
                  ))}
                </div>
                <Shield className="relative w-8 h-8 sm:w-12 sm:h-12 text-cyan-400 mb-4 group-hover:scale-125 group-hover:rotate-12 transition-all duration-500 drop-shadow-[0_0_10px_rgba(34,211,238,0.7)]" />
                <h3 className="relative text-lg sm:text-xl font-bold text-white mb-3 group-hover:text-cyan-300 transition-colors font-mono">
                  🛡️ Cybersecurity Services
                </h3>
                <p className="relative text-sm text-gray-300 group-hover:text-gray-100 transition-colors leading-relaxed">
                  Enterprise-grade security solutions, penetration testing, and 24/7 threat monitoring
                </p>
                <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  <ArrowRight className="w-5 h-5 text-cyan-400 animate-pulse" />
                </div>
              </div>

              {/* Tools Arsenal Galaxy */}
              <div 
                onClick={(e) => handleNavigateWithAnimation('/tools', e)}
                className="
                  group relative p-6 sm:p-8 bg-gradient-to-br from-orange-950/40 via-red-950/30 to-black/40
                  border-2 border-orange-500/30 backdrop-blur-md
                  rounded-2xl hover:border-orange-400/80 hover:bg-gradient-to-br hover:from-orange-900/60 hover:via-red-900/50 hover:to-pink-900/40
                  transition-all duration-700 ease-out cursor-pointer hover:scale-110 hover:-translate-y-2
                  min-h-[160px] touch-manipulation overflow-hidden
                  shadow-2xl shadow-orange-900/30 hover:shadow-orange-500/50
                "
              >
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                <div className="absolute top-2 right-2 flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="w-1 h-1 bg-orange-400 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.1}s` }}></div>
                  ))}
                </div>
                <Code className="relative w-8 h-8 sm:w-12 sm:h-12 text-orange-400 mb-4 group-hover:scale-125 group-hover:-rotate-12 transition-all duration-500 drop-shadow-[0_0_10px_rgba(251,146,60,0.7)]" />
                <h3 className="relative text-lg sm:text-xl font-bold text-white mb-3 group-hover:text-orange-300 transition-colors font-mono">
                  🔧 Tools Arsenal
                </h3>
                <p className="relative text-sm text-gray-300 group-hover:text-gray-100 transition-colors leading-relaxed">
                  500+ professional tools for cybersecurity, development, and innovation
                </p>
                <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  <ArrowRight className="w-5 h-5 text-orange-400 animate-pulse" />
                </div>
              </div>

              {/* Profile & Dashboard Galaxy */}
              <div 
                onClick={(e) => handleNavigateWithAnimation(isAuthenticated ? '/profile' : '/innovation', e)}
                className="
                  group relative p-6 sm:p-8 bg-gradient-to-br from-purple-950/40 via-pink-950/30 to-black/40
                  border-2 border-purple-500/30 backdrop-blur-md
                  rounded-2xl hover:border-purple-400/80 hover:bg-gradient-to-br hover:from-purple-900/60 hover:via-pink-900/50 hover:to-fuchsia-900/40
                  transition-all duration-700 ease-out cursor-pointer hover:scale-110 hover:-translate-y-2
                  min-h-[160px] touch-manipulation overflow-hidden sm:col-span-2 lg:col-span-1
                  shadow-2xl shadow-purple-900/30 hover:shadow-purple-500/50
                "
              >
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                <div className="absolute top-2 right-2 flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="w-1 h-1 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.1}s` }}></div>
                  ))}
                </div>
                <Lightbulb className="relative w-8 h-8 sm:w-12 sm:h-12 text-purple-400 mb-4 group-hover:scale-125 group-hover:rotate-180 transition-all duration-500 drop-shadow-[0_0_10px_rgba(192,132,252,0.7)]" />
                <h3 className="relative text-lg sm:text-xl font-bold text-white mb-3 group-hover:text-purple-300 transition-colors font-mono">
                  {isAuthenticated ? '👤 Your Profile' : '💡 Innovation Constellation'}
                </h3>
                <p className="relative text-sm text-gray-300 group-hover:text-gray-100 transition-colors leading-relaxed">
                  {isAuthenticated ? 'Manage your profile, tools progress, and account settings' : 'Journey through AI integration, blockchain technology, and next-gen digital solutions'}
                </p>
                <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  <ArrowRight className="w-5 h-5 text-purple-400 animate-pulse" />
                </div>
              </div>
            </div>
          </>
        )}

        {/* Kingdom Status Beacon */}
        <div className="mt-12 sm:mt-16 text-center">
          <div className="inline-flex items-center justify-center gap-3 px-6 py-3 bg-black/40 backdrop-blur-md border-2 border-green-500/40 rounded-full text-xs sm:text-sm text-green-300 font-mono shadow-lg shadow-green-900/30 hover:shadow-green-500/50 transition-all duration-500 hover:scale-105">
            <div className="relative">
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
              <div className="absolute inset-0 w-3 h-3 bg-green-400 rounded-full animate-ping"></div>
            </div>
            <span className="font-bold">🌟 KINGDOM OPERATIONAL</span>
            <Sparkles className="w-4 h-4 text-green-400 animate-spin-slow" />
          </div>
          <p className="mt-4 text-xs text-gray-500 font-mono">
            ✨ Every moment is magical in the cosmic kingdom ✨
          </p>
        </div>
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

export default ResponsiveMainContent;

