import React from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, Bell, User, Settings } from 'lucide-react';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';

const Header: React.FC = () => {
  return (
    <header className="sticky top-0 z-40 w-full bg-black/70 backdrop-blur-md border-b border-cyber-cyan/30 shadow-lg">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <Link to="/" className="text-2xl font-bold text-cyber-green hover:text-neon-green transition-colors duration-300">
          EterNyx
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex space-x-6">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/arsenal">Cyber Arsenal</NavLink>
          <NavLink to="/subscriptions">Subscriptions</NavLink>
          <NavLink to="/knowledge">Knowledge Hub</NavLink>
        </nav>

        {/* Quick Access Icons */}
        <div className="hidden md:flex items-center space-x-4">
          <Button variant="ghost" size="icon" className="text-cyber-cyan hover:text-neon-cyan">
            <Bell className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-cyber-cyan hover:text-neon-cyan">
            <User className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-cyber-cyan hover:text-neon-cyan">
            <Settings className="h-5 w-5" />
          </Button>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden flex items-center">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-cyber-cyan hover:text-neon-cyan">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-black/90 border-l border-cyber-cyan/30 backdrop-blur-lg w-[250px]">
              <div className="flex flex-col items-start space-y-4 pt-8">
                <NavLink to="/dashboard">Dashboard</NavLink>
                <NavLink to="/arsenal">Cyber Arsenal</NavLink>
                <NavLink to="/subscriptions">Subscriptions</NavLink>
                <NavLink to="/knowledge">Knowledge Hub</NavLink>
                <div className="w-full border-t border-cyber-cyan/20 pt-4 mt-4"></div>
                <Button variant="ghost" className="w-full justify-start text-cyber-cyan hover:text-neon-cyan">
                  <Bell className="h-5 w-5 mr-2" /> Notifications
                </Button>
                <Button variant="ghost" className="w-full justify-start text-cyber-cyan hover:text-neon-cyan">
                  <User className="h-5 w-5 mr-2" /> Profile
                </Button>
                <Button variant="ghost" className="w-full justify-start text-cyber-cyan hover:text-neon-cyan">
                  <Settings className="h-5 w-5 mr-2" /> Settings
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
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


