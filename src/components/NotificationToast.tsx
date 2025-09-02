import React, { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NotificationProps {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
  onClose: (id: string) => void;
}

const NotificationToast: React.FC<NotificationProps> = ({
  id,
  type,
  title,
  message,
  duration = 5000,
  onClose,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Animate in
    setTimeout(() => setIsVisible(true), 100);

    // Auto close
    const timer = setTimeout(() => {
      handleClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose(id);
    }, 300);
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-neon-green" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-cyber-red" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-cyber-orange" />;
      case 'info':
      default:
        return <Info className="h-5 w-5 text-cyber-cyan" />;
    }
  };

  const getTypeClasses = () => {
    switch (type) {
      case 'success':
        return 'border-neon-green shadow-neon-green/20';
      case 'error':
        return 'border-cyber-red shadow-cyber-red/20';
      case 'warning':
        return 'border-cyber-orange shadow-cyber-orange/20';
      case 'info':
      default:
        return 'border-cyber-cyan shadow-cyber-cyan/20';
    }
  };

  return (
    <div
      className={cn(
        'fixed top-4 right-4 z-50 max-w-sm w-full transition-all duration-300 transform',
        'bg-black/90 backdrop-blur-md border-2 rounded-lg p-4 shadow-2xl',
        getTypeClasses(),
        isVisible && !isExiting ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      )}
    >
      {/* Holographic effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-lg" />
      
      <div className="relative z-10 flex items-start space-x-3">
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-white font-mono">
            {title}
          </h4>
          {message && (
            <p className="text-xs text-gray-300 mt-1 leading-relaxed">
              {message}
            </p>
          )}
        </div>
        
        <button
          onClick={handleClose}
          className="flex-shrink-0 text-gray-400 hover:text-white transition-colors duration-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-800 rounded-b-lg overflow-hidden">
        <div 
          className={cn(
            'h-full transition-all duration-300 ease-linear',
            type === 'success' && 'bg-neon-green',
            type === 'error' && 'bg-cyber-red',
            type === 'warning' && 'bg-cyber-orange',
            type === 'info' && 'bg-cyber-cyan'
          )}
          style={{
            width: isExiting ? '0%' : '100%',
            transitionDuration: `${duration}ms`,
          }}
        />
      </div>

      {/* Particle effects */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className={cn(
              'absolute w-1 h-1 rounded-full animate-float opacity-60',
              type === 'success' && 'bg-neon-green',
              type === 'error' && 'bg-cyber-red',
              type === 'warning' && 'bg-cyber-orange',
              type === 'info' && 'bg-cyber-cyan'
            )}
            style={{
              left: `${20 + i * 30}%`,
              top: `${10 + i * 20}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: '3s',
            }}
          />
        ))}
      </div>

      {/* Scan line effect */}
      <div className="absolute inset-0 overflow-hidden rounded-lg">
        <div 
          className={cn(
            'w-full h-0.5 opacity-30 animate-scan',
            type === 'success' && 'bg-neon-green',
            type === 'error' && 'bg-cyber-red',
            type === 'warning' && 'bg-cyber-orange',
            type === 'info' && 'bg-cyber-cyan'
          )}
        />
      </div>
    </div>
  );
};

export default NotificationToast;

