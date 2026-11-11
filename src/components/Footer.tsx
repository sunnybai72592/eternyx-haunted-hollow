import React from 'react';
import { Link } from 'react-router-dom';
import { Github, Twitter, Linkedin, Bug } from 'lucide-react';

const Footer: React.FC = () => (
  <footer className="w-full bg-black/70 backdrop-blur-md border-t border-cyber-cyan/30 shadow-lg mt-8 py-6 relative overflow-hidden">
    <div className="absolute inset-0 pointer-events-none z-0 opacity-20">
      {[...Array(20)].map((_, i) => (
        <div key={i} className="absolute animate-data-stream text-cyber-green" style={{
          left: `${i * 5}%`, animationDelay: `${i * 0.3}s`,
          fontSize: `${Math.random() * 10 + 10}px`, fontFamily: 'Fira Code, monospace',
          top: '-100%', height: '200%', width: '2px',
          background: 'linear-gradient(to bottom, rgba(0,255,0,0) 0%, rgba(0,255,0,1) 50%, rgba(0,255,0,0) 100%)',
          animationDuration: `${5 + Math.random() * 5}s`, animationIterationCount: 'infinite', animationTimingFunction: 'linear',
        }}>{Array.from({ length: 50 }, () => Math.random() > 0.5 ? '1' : '0').join('')}</div>
      ))}
    </div>
    <div className="container mx-auto px-4 relative z-10 flex flex-col md:flex-row justify-between items-center text-cyber-cyan text-sm">
      <div className="mb-4 md:mb-0"><p>&copy; {new Date().getFullYear()} EterNyx. All rights reserved.</p><p className="mt-1">"Unlocking the Digital Underworld."</p></div>
      <div className="mb-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 md:mb-0">
        <Link to="/bug-report" className="inline-flex items-center gap-2 hover:text-neon-green transition-colors duration-300"><Bug className="h-4 w-4" />Report a Bug</Link>
        <Link to="/contact" className="hover:text-neon-green transition-colors duration-300">Contact Us</Link>
        <a href="#" className="hover:text-neon-green transition-colors duration-300">Privacy Policy</a>
        <a href="#" className="hover:text-neon-green transition-colors duration-300">Terms of Service</a>
      </div>
      <div className="flex space-x-4">
        <a href="#" aria-label="ETERNXY on GitHub" className="text-cyber-cyan hover:text-neon-green transition-colors duration-300"><Github className="h-5 w-5" /></a>
        <a href="#" aria-label="ETERNXY on Twitter" className="text-cyber-cyan hover:text-neon-green transition-colors duration-300"><Twitter className="h-5 w-5" /></a>
        <a href="#" aria-label="ETERNXY on LinkedIn" className="text-cyber-cyan hover:text-neon-green transition-colors duration-300"><Linkedin className="h-5 w-5" /></a>
      </div>
    </div>
  </footer>
);
export default Footer;
