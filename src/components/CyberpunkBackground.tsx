import React, { useEffect, useRef } from 'react';

interface CyberpunkBackgroundProps {
  variant?: 'matrix' | 'circuit' | 'glitch';
  color?: string;
  intensity?: 'low' | 'medium' | 'high';
}

export const CyberpunkBackground: React.FC<CyberpunkBackgroundProps> = ({
  variant = 'matrix',
  color = '#00ff41',
  intensity = 'medium'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Matrix rain effect
    if (variant === 'matrix') {
      const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
      const charArray = chars.split('');
      const fontSize = 14;
      const columns = canvas.width / fontSize;
      const drops: number[] = [];

      // Initialize drops
      for (let i = 0; i < columns; i++) {
        drops[i] = 1;
      }

      const draw = () => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = color;
        ctx.font = `${fontSize}px monospace`;

        for (let i = 0; i < drops.length; i++) {
          const text = charArray[Math.floor(Math.random() * charArray.length)];
          ctx.fillText(text, i * fontSize, drops[i] * fontSize);

          if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
            drops[i] = 0;
          }
          drops[i]++;
        }
      };

      const interval = setInterval(draw, intensity === 'high' ? 33 : intensity === 'medium' ? 50 : 100);
      return () => {
        clearInterval(interval);
        window.removeEventListener('resize', resizeCanvas);
      };
    }

    // Circuit pattern effect
    if (variant === 'circuit') {
      const drawCircuit = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;

        // Draw grid
        for (let x = 0; x < canvas.width; x += 50) {
          for (let y = 0; y < canvas.height; y += 50) {
            if (Math.random() > 0.7) {
              ctx.beginPath();
              ctx.rect(x, y, 20, 20);
              ctx.stroke();
              
              // Add connecting lines
              if (Math.random() > 0.5) {
                ctx.beginPath();
                ctx.moveTo(x + 20, y + 10);
                ctx.lineTo(x + 50, y + 10);
                ctx.stroke();
              }
            }
          }
        }
      };

      drawCircuit();
      const interval = setInterval(drawCircuit, 2000);
      return () => {
        clearInterval(interval);
        window.removeEventListener('resize', resizeCanvas);
      };
    }

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [variant, color, intensity]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.1 }}
    />
  );
};

export default CyberpunkBackground;

