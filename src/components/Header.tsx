import React from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, Bell, Search } from 'lucide-react';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';
import CyberNavBar from './CyberNavBar';

const Header: React.FC = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      {/* Main Header */}
      <div className="bg-black/80 backdrop-blur-md border-b border-cyber-cyan/30 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-2 group">
              <div className="relative">
                <div className="w-8 h-8 bg-gradient-to-br from-cyber-cyan to-cyber-green rounded-lg flex items-center justify-center font-bold text-black text-sm transform group-hover:scale-110 transition-transform duration-300">
                  E
                </div>
                <div className="absolute inset-0 bg-cyber-cyan rounded-lg blur-sm opacity-0 group-hover:opacity-50 transition-opacity duration-300"></div>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-cyber-cyan to-cyber-green bg-clip-text text-transparent">
                EterNyx
              </span>
            </Link>

            {/* Right Side Actions */}
            <div className="flex items-center space-x-4">
              {/* Search */}
              <button className="p-2 text-cyber-cyan hover:text-neon-green transition-colors duration-300">
                <Search className="h-5 w-5" />
              </button>

              {/* Notifications */}
              <button className="p-2 text-cyber-cyan hover:text-neon-green transition-colors duration-300 relative">
                <Bell className="h-5 w-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-cyber-pink rounded-full animate-pulse"></span>
              </button>

              {/* Mobile Menu Button */}
              <div className="md:hidden">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-cyber-cyan hover:text-neon-cyan">
                      <Menu className="h-6 w-6" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="bg-black/90 border-l border-cyber-cyan/30 backdrop-blur-lg w-[250px]">
                    <div className="flex flex-col items-start space-y-4 pt-8">
                      <NavLink to="/cyber-dashboard">Dashboard</NavLink>
                      <NavLink to="/arsenal">Cyber Arsenal</NavLink>
                      <NavLink to="/subscriptions">Subscriptions</NavLink>
                      <NavLink to="/knowledge">Knowledge Hub</NavLink>
                      <div className="w-full border-t border-cyber-cyan/20 pt-4 mt-4"></div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cyberpunk Navigation Bar */}
      <CyberNavBar />
    </header>
  );
};

const NavLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <Link
    to={to}
    className="text-lg font-mono text-cyber-cyan hover:text-neon-green transition-all duration-300 relative group"
  >
    {children}
    <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-neon-green transition-all duration-300 group-hover:w-full"></span>
  </Link>
);

export default Header;


