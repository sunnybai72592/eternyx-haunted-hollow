import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AuthModal } from '@/components/AuthModal';
import { 
  Zap, 
  Users, 
  ArrowRight,
  Terminal,
  Shield,
  Code,
  Lightbulb
} from 'lucide-react';

interface ResponsiveMainContentProps {
  className?: string;
}

export const ResponsiveMainContent = ({ className = '' }: ResponsiveMainContentProps) => {
  const navigate = useNavigate();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  const handleInitializeConnection = () => {
    console.log('Initialize Connection clicked');
    setAuthMode('signin');
    setAuthModalOpen(true);
  };

  const handleJoinNetwork = () => {
    console.log('Join Network clicked');
    setAuthMode('signup');
    setAuthModalOpen(true);
  };

  const handleAccessDashboard = () => {
    console.log('Access Dashboard clicked');
    navigate('/dashboard');
  };

  return (
    <div className={`min-h-screen bg-black relative overflow-hidden ${className}`}>
      {/* Matrix Rain Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="matrix-rain opacity-20"></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 sm:px-6 lg:px-8 pt-16">
        {/* Welcome Message */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="text-sm sm:text-base text-cyan-400 mb-2 sm:mb-4 font-mono">
            Welcome back, <span className="text-green-400">hacker</span>
          </div>
          
          {/* Main Logo */}
          <div className="mb-6 sm:mb-8">
            <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent mb-4 sm:mb-6 animate-pulse">
              ETERNYX
            </h1>
            
            {/* Subtitle */}
            <div className="text-base sm:text-lg md:text-xl text-blue-400 mb-2">
              Full Stack Development
            </div>
            <div className="flex items-center justify-center gap-2 text-sm sm:text-base text-gray-300">
              <span>•</span>
              <span className="text-cyan-400">Cybersecurity</span>
              <span>•</span>
              <span className="text-purple-400">Digital Innovation</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 w-full max-w-md sm:max-w-lg">
          {/* Initialize Connection Button */}
          <Button
            onClick={handleInitializeConnection}
            className="
              flex-1 h-12 sm:h-14 px-6 sm:px-8 
              bg-gradient-to-r from-cyan-500 to-blue-600 
              hover:from-cyan-400 hover:to-blue-500 
              text-white font-semibold text-sm sm:text-base
              rounded-lg shadow-lg shadow-cyan-500/25 
              hover:shadow-cyan-500/40 hover:scale-105 
              transition-all duration-300 
              border border-cyan-400/20 hover:border-cyan-400/40
              min-h-[48px] touch-manipulation
            "
          >
            <Terminal className="w-4 h-4 sm:w-5 sm:h-5 mr-2 flex-shrink-0" />
            <span>Initialize Connection</span>
            <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 ml-2 flex-shrink-0" />
          </Button>

          {/* Join Network Button */}
          <Button
            onClick={handleJoinNetwork}
            variant="outline"
            className="
              flex-1 h-12 sm:h-14 px-6 sm:px-8 
              bg-transparent border-2 border-purple-500/50 
              hover:border-purple-400 hover:bg-purple-500/10 
              text-purple-400 hover:text-purple-300 
              font-semibold text-sm sm:text-base
              rounded-lg shadow-lg shadow-purple-500/10 
              hover:shadow-purple-500/25 hover:scale-105 
              transition-all duration-300
              min-h-[48px] touch-manipulation
            "
          >
            <Users className="w-4 h-4 sm:w-5 sm:h-5 mr-2 flex-shrink-0" />
            <span>Join Network</span>
            <Zap className="w-4 h-4 sm:w-5 sm:h-5 ml-2 flex-shrink-0" />
          </Button>
        </div>

        {/* Quick Access Dashboard Button */}
        <div className="mt-8 sm:mt-12">
          <Button
            onClick={handleAccessDashboard}
            variant="ghost"
            className="
              px-6 sm:px-8 py-3 sm:py-4 
              text-gray-300 hover:text-white 
              border border-gray-600 hover:border-cyan-500/50 
              rounded-lg hover:bg-gray-800/50 
              transition-all duration-300 hover:scale-105
              text-sm sm:text-base
              min-h-[44px] touch-manipulation
            "
          >
            <Shield className="w-4 h-4 sm:w-5 sm:h-5 mr-2 flex-shrink-0" />
            <span>Access Dashboard</span>
          </Button>
        </div>

        {/* Feature Cards - Mobile Responsive */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mt-12 sm:mt-16 w-full max-w-4xl">
          {/* Cybersecurity Card */}
          <div 
            onClick={() => navigate('/services')}
            className="
              p-4 sm:p-6 bg-gray-900/50 border border-blue-500/20 
              rounded-lg hover:border-blue-500/40 hover:bg-gray-900/70 
              transition-all duration-300 cursor-pointer hover:scale-105
              min-h-[120px] touch-manipulation
            "
          >
            <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400 mb-3 sm:mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Cybersecurity</h3>
            <p className="text-xs sm:text-sm text-gray-400">Advanced security solutions and penetration testing</p>
          </div>

          {/* Web Development Card */}
          <div 
            onClick={() => navigate('/development')}
            className="
              p-4 sm:p-6 bg-gray-900/50 border border-orange-500/20 
              rounded-lg hover:border-orange-500/40 hover:bg-gray-900/70 
              transition-all duration-300 cursor-pointer hover:scale-105
              min-h-[120px] touch-manipulation
            "
          >
            <Code className="w-6 h-6 sm:w-8 sm:h-8 text-orange-400 mb-3 sm:mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Web Development</h3>
            <p className="text-xs sm:text-sm text-gray-400">Full-stack solutions and modern web applications</p>
          </div>

          {/* Digital Innovation Card */}
          <div 
            onClick={() => navigate('/innovation')}
            className="
              p-4 sm:p-6 bg-gray-900/50 border border-purple-500/20 
              rounded-lg hover:border-purple-500/40 hover:bg-gray-900/70 
              transition-all duration-300 cursor-pointer hover:scale-105
              min-h-[120px] touch-manipulation sm:col-span-2 lg:col-span-1
            "
          >
            <Lightbulb className="w-6 h-6 sm:w-8 sm:h-8 text-purple-400 mb-3 sm:mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Digital Innovation</h3>
            <p className="text-xs sm:text-sm text-gray-400">AI integration and cutting-edge technology solutions</p>
          </div>
        </div>

        {/* System Status */}
        <div className="mt-8 sm:mt-12 text-center">
          <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-green-400">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span>SYSTEM OPERATIONAL</span>
          </div>
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

