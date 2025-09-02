import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Play, Volume2, VolumeX } from 'lucide-react';

interface HeroSectionProps {
  onEnterWorld: () => void;
}

const HeroSection: React.FC<HeroSectionProps> = ({ onEnterWorld }) => {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });

  // Cursor tracking for parallax effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setCursorPosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const parallaxStyle = {
    transform: `translate(${cursorPosition.x * 0.01}px, ${cursorPosition.y * 0.01}px)`,
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 z-0">
        {/* Rain-soaked neon city effect */}
        <div 
          className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black opacity-90"
          style={parallaxStyle}
        />
        
        {/* Holographic data streams */}
        <div className="absolute inset-0">
          {[...Array(15)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-data-stream text-cyber-cyan opacity-30"
              style={{
                left: `${i * 6.67}%`,
                animationDelay: `${i * 0.4}s`,
                fontSize: '14px',
                fontFamily: 'Fira Code, monospace',
                animationDuration: `${8 + Math.random() * 4}s`,
              }}
            >
              {Array.from({ length: 40 }, () => 
                Math.random() > 0.5 ? '1' : '0'
              ).join('')}
            </div>
          ))}
        </div>

        {/* Animated code lines */}
        <div className="absolute inset-0 opacity-20">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute text-neon-green font-mono text-xs animate-float-effect"
              style={{
                top: `${10 + i * 12}%`,
                left: `${Math.random() * 80}%`,
                animationDelay: `${i * 0.5}s`,
              }}
            >
              {`function hack${i}() { return "access_granted"; }`}
            </div>
          ))}
        </div>

        {/* Particle effects */}
        <div className="absolute inset-0">
          {[...Array(25)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-cyber-pink rounded-full opacity-70 animate-float"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${4 + Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Hero Content */}
      <div className="relative z-10 text-center max-w-4xl mx-auto px-6">
        <div className="mb-8">
          <h1 className="text-6xl md:text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyber-cyan via-neon-green to-cyber-pink mb-6 animate-pulse-soft">
            Enter the World of
          </h1>
          <h2 className="text-7xl md:text-9xl font-black text-neon-green mb-8 animate-neon-pulse tracking-wider">
            EterNyx
          </h2>
        </div>

        <p className="text-xl md:text-2xl text-cyber-cyan mb-12 font-mono max-w-2xl mx-auto leading-relaxed">
          "Unlocking the Digital Underworld" - Where cybersecurity meets innovation in a neon-lit digital realm.
        </p>

        {/* CTA Button */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-8">
          <Button
            onClick={onEnterWorld}
            size="lg"
            className="group relative bg-gradient-to-r from-cyber-cyan to-neon-green text-black font-bold px-12 py-6 text-xl rounded-lg overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-neon-green/50"
          >
            <span className="relative z-10 flex items-center">
              <Play className="mr-3 h-6 w-6" />
              Initialize Connection
            </span>
            
            {/* Animated background effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-neon-green to-cyber-pink opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            
            {/* Pulse effect */}
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 animate-pulse" />
          </Button>

          {/* Sound Toggle */}
          <Button
            onClick={() => setSoundEnabled(!soundEnabled)}
            variant="outline"
            size="lg"
            className="border-cyber-cyan text-cyber-cyan hover:bg-cyber-cyan hover:text-black transition-all duration-300"
          >
            {soundEnabled ? (
              <Volume2 className="h-5 w-5 mr-2" />
            ) : (
              <VolumeX className="h-5 w-5 mr-2" />
            )}
            {soundEnabled ? 'Disable' : 'Enable'} Audio
          </Button>
        </div>

        {/* Emotional Hook */}
        <div className="text-sm text-cyber-pink font-mono opacity-80">
          // Prepare for digital immersion...
        </div>

        {/* Cursor follower particles */}
        <div 
          className="fixed w-4 h-4 bg-neon-green rounded-full opacity-60 pointer-events-none z-50 animate-pulse"
          style={{
            left: cursorPosition.x - 8,
            top: cursorPosition.y - 8,
            transition: 'all 0.1s ease-out',
          }}
        />
      </div>

      {/* Scan lines effect */}
      <div className="absolute inset-0 pointer-events-none z-20">
        <div className="w-full h-0.5 bg-cyber-cyan opacity-30 animate-scan" />
      </div>

      {/* Neon highlights that react to scroll */}
      <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 text-cyber-cyan animate-bounce">
        <div className="text-xs font-mono">SCROLL TO EXPLORE</div>
        <div className="w-6 h-10 border-2 border-cyber-cyan rounded-full mx-auto mt-2 relative">
          <div className="w-1 h-3 bg-cyber-cyan rounded-full mx-auto mt-2 animate-pulse" />
        </div>
      </div>
    </section>
  );
};

export default HeroSection;

