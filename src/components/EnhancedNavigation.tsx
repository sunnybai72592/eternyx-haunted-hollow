import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { 
  Home, 
  Shield, 
  Code, 
  Lightbulb, 
  LayoutDashboard, 
  User, 
  Crown, 
  Menu,
  X,
  ChevronDown,
  Wrench,
  Settings,
  Bell,
  Search,
  Zap,
  Star,
  Lock,
  Smartphone,
  Monitor,
  Terminal,
  Database,
  Globe,
  Cpu,
  Network,
  Eye,
  FileCode,
  Server,
  Cloud,
  Wifi,
  Activity
} from 'lucide-react';

interface NavigationProps {
  className?: string;
}

interface NavCategory {
  id: string;
  name: string;
  path: string;
  icon: React.ComponentType<any>;
  color: string;
  hoverColor: string;
  level?: number;
  xp?: number;
  maxXp?: number;
  unlocked?: boolean;
  children?: {
    name: string;
    path: string;
    description: string;
    level?: number;
    icon?: React.ComponentType<any>;
  }[];
}

export const EnhancedNavigation = ({ className = '' }: NavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false);
      }
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setActiveDropdown(null);
  }, [location.pathname]);

  const categories: NavCategory[] = [
    {
      id: 'home',
      name: 'Home',
      path: '/',
      icon: Home,
      color: 'from-green-400 to-emerald-600',
      hoverColor: 'hover:from-green-300 hover:to-emerald-500',
      level: 1,
      xp: 100,
      maxXp: 100,
      unlocked: true
    },
    {
      id: 'cybersecurity',
      name: 'Cybersecurity',
      path: '/services',
      icon: Shield,
      color: 'from-blue-400 to-cyan-600',
      hoverColor: 'hover:from-blue-300 hover:to-cyan-500',
      level: 15,
      xp: 12750,
      maxXp: 15000,
      unlocked: true,
      children: [
        { name: 'Penetration Testing', path: '/penetration-testing', description: 'Advanced security testing', level: 12, icon: Terminal },
        { name: 'Vulnerability Assessment', path: '/vulnerability-assessment', description: 'System security analysis', level: 10, icon: Eye },
        { name: 'Security Auditing', path: '/security-auditing', description: 'Comprehensive security review', level: 14, icon: Search },
        { name: 'Incident Response', path: '/incident-response', description: 'Security breach management', level: 16, icon: Activity },
        { name: 'Network Security', path: '/network-security', description: 'Network protection protocols', level: 13, icon: Network },
        { name: 'Threat Intelligence', path: '/threat-intelligence', description: 'Advanced threat analysis', level: 18, icon: Database }
      ]
    },
    {
      id: 'web-development',
      name: 'Web Development',
      path: '/development',
      icon: Code,
      color: 'from-orange-400 to-red-600',
      hoverColor: 'hover:from-orange-300 hover:to-red-500',
      level: 12,
      xp: 8900,
      maxXp: 12000,
      unlocked: true,
      children: [
        { name: 'Frontend Development', path: '/frontend-development', description: 'Modern UI/UX solutions', level: 11, icon: Monitor },
        { name: 'Backend Development', path: '/backend-development', description: 'Server-side architecture', level: 13, icon: Server },
        { name: 'Full Stack Solutions', path: '/full-stack', description: 'End-to-end development', level: 15, icon: Globe },
        { name: 'Mobile Development', path: '/mobile-development', description: 'Cross-platform apps', level: 10, icon: Smartphone },
        { name: 'API Development', path: '/api-development', description: 'RESTful and GraphQL APIs', level: 12, icon: Database },
        { name: 'DevOps & Deployment', path: '/devops', description: 'CI/CD and infrastructure', level: 14, icon: Cloud }
      ]
    },
    {
      id: 'digital-innovation',
      name: 'Digital Innovation',
      path: '/innovation',
      icon: Lightbulb,
      color: 'from-purple-400 to-indigo-600',
      hoverColor: 'hover:from-purple-300 hover:to-indigo-500',
      level: 8,
      xp: 4500,
      maxXp: 8000,
      unlocked: true,
      children: [
        { name: 'AI Integration', path: '/ai-integration', description: 'Artificial intelligence solutions', level: 9, icon: Cpu },
        { name: 'Blockchain Development', path: '/blockchain', description: 'Decentralized applications', level: 7, icon: Lock },
        { name: 'IoT Solutions', path: '/iot-solutions', description: 'Internet of Things', level: 6, icon: Wifi },
        { name: 'Cloud Architecture', path: '/cloud-solutions', description: 'Scalable cloud systems', level: 10, icon: Cloud },
        { name: 'Data Analytics', path: '/data-analytics', description: 'Big data processing', level: 11, icon: Activity },
        { name: 'Machine Learning', path: '/machine-learning', description: 'ML model development', level: 12, icon: Cpu }
      ]
    },
    {
      id: 'tools-hub',
      name: 'Tools Hub',
      path: '/tools',
      icon: Wrench,
      color: 'from-cyan-400 to-teal-600',
      hoverColor: 'hover:from-cyan-300 hover:to-teal-500',
      level: 18,
      xp: 14200,
      maxXp: 18000,
      unlocked: true,
      children: [
        { name: 'Security Tools', path: '/tools/security', description: 'Cybersecurity arsenal', level: 15, icon: Shield },
        { name: 'Development Tools', path: '/tools/development', description: 'Coding utilities', level: 12, icon: FileCode },
        { name: 'Analysis Tools', path: '/tools/analysis', description: 'Data analysis suite', level: 14, icon: Search },
        { name: 'Monitoring Tools', path: '/tools/monitoring', description: 'System monitoring', level: 16, icon: Activity },
        { name: 'Network Tools', path: '/tools/network', description: 'Network diagnostics', level: 13, icon: Network },
        { name: 'Performance Tools', path: '/tools/performance', description: 'Optimization utilities', level: 17, icon: Zap }
      ]
    },
    {
      id: 'killer-edge',
      name: 'Killer Edge',
      path: '/premium',
      icon: Crown,
      color: 'from-pink-400 to-rose-600',
      hoverColor: 'hover:from-pink-300 hover:to-rose-500',
      level: 25,
      xp: 19800,
      maxXp: 25000,
      unlocked: true,
      children: [
        { name: 'Premium Services', path: '/premium/services', description: 'Exclusive offerings', level: 20, icon: Crown },
        { name: 'Advanced Analytics', path: '/premium/analytics', description: 'Deep insights', level: 22, icon: Activity },
        { name: 'Custom Solutions', path: '/premium/custom', description: 'Tailored development', level: 24, icon: Settings },
        { name: 'Enterprise Support', path: '/premium/enterprise', description: '24/7 premium support', level: 25, icon: User },
        { name: 'White Label', path: '/premium/white-label', description: 'Branded solutions', level: 23, icon: Globe },
        { name: 'Consulting', path: '/premium/consulting', description: 'Expert consultation', level: 26, icon: Lightbulb }
      ]
    },
    {
      id: 'dashboard',
      name: 'Dashboard',
      path: '/dashboard',
      icon: LayoutDashboard,
      color: 'from-indigo-400 to-purple-600',
      hoverColor: 'hover:from-indigo-300 hover:to-purple-500',
      level: 5,
      xp: 2500,
      maxXp: 5000,
      unlocked: true
    },
    {
      id: 'contact',
      name: 'Contact',
      path: '/contact',
      icon: User,
      color: 'from-gray-400 to-slate-600',
      hoverColor: 'hover:from-gray-300 hover:to-slate-500',
      level: 1,
      xp: 50,
      maxXp: 100,
      unlocked: true
    }
  ];

  const handleNavigation = (path: string, categoryName?: string) => {
    console.log(`Navigating to: ${path} (${categoryName || 'Direct'})`);
    navigate(path);
    setActiveDropdown(null);
    setIsMobileMenuOpen(false);
    
    // Add visual feedback
    const button = document.activeElement as HTMLButtonElement;
    if (button) {
      button.style.transform = 'scale(0.95)';
      setTimeout(() => {
        button.style.transform = 'scale(1)';
      }, 150);
    }
  };

  const toggleDropdown = (categoryId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    
    if (isMobile) {
      setActiveDropdown(activeDropdown === categoryId ? null : categoryId);
    } else {
      // For desktop, handle hover
      setActiveDropdown(categoryId);
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
    setActiveDropdown(null);
  };

  const isActivePath = (path: string) => {
    return location.pathname === path || 
           (path !== '/' && location.pathname.startsWith(path));
  };

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md border-b border-cyan-500/20 ${className}`}>
      {/* Matrix Rain Effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="matrix-rain opacity-10"></div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex-shrink-0 flex items-center">
            <button
              onClick={() => handleNavigation('/', 'Logo')}
              className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent hover:from-cyan-300 hover:to-blue-400 transition-all duration-300 flex items-center gap-2 hover:scale-105"
            >
              <Zap className="w-6 h-6 text-cyan-400 animate-pulse" />
              ETERNYX
            </button>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {categories.map((category) => (
              <div key={category.id} className="relative group">
                <Button
                  variant="ghost"
                  onClick={() => category.children ? toggleDropdown(category.id) : handleNavigation(category.path, category.name)}
                  className={`
                    relative px-3 py-2 text-sm font-medium transition-all duration-300 
                    border border-transparent rounded-lg hover:scale-105
                    ${isActivePath(category.path) 
                      ? 'bg-gradient-to-r ' + category.color + ' text-white shadow-lg shadow-cyan-500/25 scale-105' 
                      : 'text-gray-300 hover:text-white hover:bg-gray-800/50 hover:border-cyan-500/30'
                    }
                    ${category.children ? 'pr-8' : ''}
                  `}
                  onMouseEnter={() => !isMobile && category.children && setActiveDropdown(category.id)}
                  onMouseLeave={() => !isMobile && setTimeout(() => setActiveDropdown(null), 300)}
                >
                  <category.icon className="w-4 h-4 mr-2" />
                  <span className="hidden lg:inline">{category.name}</span>
                  
                  {/* Level and XP Display */}
                  {category.level && (
                    <div className="ml-2 flex items-center gap-1">
                      <Star className="w-3 h-3 text-yellow-400" />
                      <span className="text-xs text-yellow-400">{category.level}</span>
                      <span className="text-xs text-cyan-400">{category.xp}</span>
                    </div>
                  )}
                  
                  {category.children && (
                    <ChevronDown className={`w-4 h-4 ml-1 transition-transform duration-200 ${
                      activeDropdown === category.id ? 'rotate-180' : ''
                    }`} />
                  )}
                </Button>

                {/* Desktop Dropdown */}
                {category.children && activeDropdown === category.id && !isMobile && (
                  <div 
                    className="absolute top-full left-0 mt-2 w-80 bg-black/95 backdrop-blur-md border border-cyan-500/20 rounded-lg shadow-xl shadow-cyan-500/10 z-50 animate-in slide-in-from-top-2 duration-200"
                    onMouseEnter={() => setActiveDropdown(category.id)}
                    onMouseLeave={() => setTimeout(() => setActiveDropdown(null), 300)}
                  >
                    <div className="p-4">
                      <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        <category.icon className="w-5 h-5 text-cyan-400" />
                        {category.name}
                      </h3>
                      <div className="grid gap-2">
                        {category.children.map((child) => (
                          <button
                            key={child.path}
                            onClick={() => handleNavigation(child.path, child.name)}
                            className="text-left p-3 rounded-lg hover:bg-gray-800/50 transition-all duration-200 group hover:scale-105"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {child.icon && <child.icon className="w-4 h-4 text-cyan-400" />}
                                <div>
                                  <div className="text-white font-medium group-hover:text-cyan-400 transition-colors">
                                    {child.name}
                                  </div>
                                  <div className="text-gray-400 text-sm mt-1">
                                    {child.description}
                                  </div>
                                </div>
                              </div>
                              {child.level && (
                                <div className="flex items-center gap-1 text-yellow-400">
                                  <Star className="w-3 h-3" />
                                  <span className="text-xs">{child.level}</span>
                                </div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Right Side - Screen Size Indicator and Mobile Menu */}
          <div className="flex items-center gap-4">
            {/* Screen Size Indicator */}
            <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400">
              {isMobile ? (
                <Smartphone className="w-4 h-4" />
              ) : (
                <Monitor className="w-4 h-4" />
              )}
              <span>{isMobile ? 'Mobile' : 'Desktop'}</span>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={toggleMobileMenu}
              className="md:hidden p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800/50 transition-all duration-200 hover:scale-110"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-black/95 backdrop-blur-md border-b border-cyan-500/20 shadow-xl animate-in slide-in-from-top-2 duration-300">
            <div className="px-4 py-6 space-y-4 max-h-screen overflow-y-auto">
              {categories.map((category) => (
                <div key={category.id} className="space-y-2">
                  <button
                    onClick={() => category.children ? toggleDropdown(category.id) : handleNavigation(category.path, category.name)}
                    className={`
                      w-full flex items-center justify-between p-4 rounded-lg transition-all duration-300 hover:scale-105
                      ${isActivePath(category.path) 
                        ? 'bg-gradient-to-r ' + category.color + ' text-white shadow-lg' 
                        : 'text-gray-300 hover:text-white hover:bg-gray-800/50'
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <category.icon className="w-5 h-5" />
                      <span className="font-medium">{category.name}</span>
                      {category.level && (
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-yellow-400" />
                          <span className="text-xs text-yellow-400">{category.level}</span>
                          <span className="text-xs text-cyan-400">{category.xp}</span>
                        </div>
                      )}
                    </div>
                    {category.children && (
                      <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${
                        activeDropdown === category.id ? 'rotate-180' : ''
                      }`} />
                    )}
                  </button>

                  {/* Mobile Dropdown */}
                  {category.children && activeDropdown === category.id && (
                    <div className="ml-4 space-y-2 border-l-2 border-cyan-500/20 pl-4 animate-in slide-in-from-top-2 duration-200">
                      {category.children.map((child) => (
                        <button
                          key={child.path}
                          onClick={() => handleNavigation(child.path, child.name)}
                          className="w-full text-left p-3 rounded-lg hover:bg-gray-800/50 transition-all duration-200 hover:scale-105"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {child.icon && <child.icon className="w-4 h-4 text-cyan-400" />}
                              <div>
                                <div className="text-white font-medium">
                                  {child.name}
                                </div>
                                <div className="text-gray-400 text-sm mt-1">
                                  {child.description}
                                </div>
                              </div>
                            </div>
                            {child.level && (
                              <div className="flex items-center gap-1 text-yellow-400">
                                <Star className="w-3 h-3" />
                                <span className="text-xs">{child.level}</span>
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default EnhancedNavigation;

