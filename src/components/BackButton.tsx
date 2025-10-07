import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Monitor } from 'lucide-react';
import { motion } from 'framer-motion';

interface BackButtonProps {
  className?: string;
}

export const BackButton: React.FC<BackButtonProps> = ({ className }) => {
  const navigate = useNavigate();

  const handleBack = () => {
    // Check if there is history to go back to. If not, navigate to the home page.
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <motion.div
      initial={{ x: -50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 100, delay: 0.5 }}
      className={className}
    >
      <Button
        onClick={handleBack}
        variant="outline"
        className="
          group relative h-10 px-4 py-2 
          bg-black/50 backdrop-blur-sm border-2 border-border/50 
          hover:border-primary/80 hover:bg-primary/10
          text-muted-foreground hover:text-primary
          font-mono text-sm
          rounded-lg shadow-lg shadow-black/50
          transition-all duration-300 overflow-hidden
        "
      >
        {/* Scanline effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/20 to-transparent animate-scan-line opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
        
        <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-0.5 transition-transform duration-300" />
        <span className="relative">BACK_TO_PREVIOUS_STATE</span>
        <Monitor className="w-4 h-4 ml-2 text-primary/50 group-hover:text-primary transition-colors duration-300" />
      </Button>
    </motion.div>
  );
};
