import React from 'react';
import { Link } from 'react-router-dom';
import { Home, Zap, Shield, Book, Settings, User, Compass, Layers, Gem, Bell, Code, Cloud, Smartphone, TrendingUp, Puzzle, Bug } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { Separator } from "./ui/separator";

interface SidebarLinkProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  xp?: number;
  active?: boolean;
}

const SidebarLink: React.FC<SidebarLinkProps> = ({ to, icon, label, xp, active }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={to}
          className={`flex items-center p-3 rounded-lg transition-all duration-300 group
            ${active ? 'bg-cyber-cyan/20 text-neon-green shadow-neon-green/30' : 'text-cyber-cyan hover:bg-cyber-cyan/10 hover:text-neon-green'}
            relative overflow-hidden
          `}
        >
          <div className="relative z-10 flex items-center w-full">
            {icon}
            <span className="ml-3 text-sm font-medium hidden lg:inline-block">{label}</span>
            {xp !== undefined && (
              <span className="ml-auto text-xs font-mono text-cyber-green hidden lg:inline-block">{xp} XP</span>
            )}
          </div>
          {/* Neon border effect on hover */}
          <div className="absolute inset-0 border-2 border-transparent group-hover:border-neon-green rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" className="bg-black border-cyber-cyan text-cyber-cyan">
        {label}
        {xp !== undefined && <span className="block text-xs text-cyber-green">{xp} XP</span>}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

const Sidebar: React.FC = () => {
  // You can use react-router-dom's useLocation hook to determine active link
  // const location = useLocation();
  // const isActive = (path: string) => location.pathname === path;

  return (
    <aside className="fixed left-0 top-0 h-full w-16 lg:w-64 bg-black/70 backdrop-blur-md border-r border-cyber-cyan/30 shadow-lg pt-32 pb-4 flex flex-col justify-between z-30 transform transition-transform duration-300 ease-in-out lg:translate-x-0 -translate-x-full md:translate-x-0">
      <nav className="flex flex-col items-center lg:items-stretch space-y-2 px-2 lg:px-4">
        <SidebarLink to="/cyber-dashboard" icon={<Home className="h-5 w-5" />} label="Dashboard" active={true} xp={1250} />
        <SidebarLink to="/arsenal" icon={<Zap className="h-5 w-5" />} label="Cyber Arsenal" xp={800} />
        <SidebarLink to="/subscriptions" icon={<Gem className="h-5 w-5" />} label="Subscriptions" />
        <SidebarLink to="/knowledge" icon={<Book className="h-5 w-5" />} label="Knowledge Hub" />
        
        <Separator className="bg-cyber-cyan/20 my-2" />

        <SidebarLink to="/threat-monitoring" icon={<Shield className="h-5 w-5" />} label="Threat Monitoring" />
        <SidebarLink to="/ai-powered-security" icon={<Compass className="h-5 w-5" />} label="AI Security" />
        <SidebarLink to="/quantum-encryption" icon={<Layers className="h-5 w-5" />} label="Quantum Encryption" />
        
        <Separator className="bg-cyber-cyan/20 my-2" />

        <SidebarLink to="/development" icon={<Code className="h-5 w-5" />} label="Development" />
        <SidebarLink to="/cloud-solutions" icon={<Cloud className="h-5 w-5" />} label="Cloud Solutions" />
        <SidebarLink to="/mobile-development" icon={<Smartphone className="h-5 w-5" />} label="Mobile Dev" />
        <SidebarLink to="/performance-optimization" icon={<TrendingUp className="h-5 w-5" />} label="Performance" />
        <SidebarLink to="/custom-solutions" icon={<Puzzle className="h-5 w-5" />} label="Custom Solutions" />
      </nav>

      <div className="flex flex-col items-center lg:items-stretch space-y-2 px-2 lg:px-4 mt-auto">
        <Separator className="bg-cyber-cyan/20 my-2" />
        <SidebarLink to="/profile" icon={<User className="h-5 w-5" />} label="Profile" />
        <SidebarLink to="/settings" icon={<Settings className="h-5 w-5" />} label="Settings" />
        <SidebarLink to="/notifications" icon={<Bell className="h-5 w-5" />} label="Notifications" />
        <SidebarLink to="/bug-report" icon={<Bug className="h-5 w-5" />} label="Bug Report" />
      </div>
    </aside>
  );
};

export default Sidebar;


