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
  Zap,
  Star,
  LogIn,
  UserPlus,
  Bot,
  GraduationCap
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { AuthModal } from '@/components/AuthModal';

interface NavigationProps {
  className?: string;
}

interface NavCategory {
  id: string;
  name: string;
  path: string;
  icon: React.ComponentType<any>;
  color: string;
  level?: number;
  xp?: number;
  children?: {
    name: string;
    path: string;
    description: string;
  }[];
}

export const MobileResponsiveNavigation = ({ className = '' }: NavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  
  const { user, isAuthenticated, signOut } = useAuthStore();

  // Detect mobile screen size
  useEffect(() => {
    const checkScreenSize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
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
      level: 1,
      xp: 100
    },
    {
      id: 'services-hub',
      name: 'Services Hub',
      path: '/services-hub',
      icon: Zap,
      color: 'from-purple-400 to-indigo-600',
      level: 10,
      xp: 6000
    },
    {
      id: 'tools-hub',
      name: 'Tools Hub',
      path: '/tools',
      icon: Wrench,
      color: 'from-cyan-400 to-teal-600',
      level: 18,
      xp: 14200,
    },
    {
      id: 'eternyx-ai',
      name: 'Eternyx AI',
      path: '/eternyx-ai',
      icon: Bot,
      color: 'from-pink-400 to-rose-600',
      level: 25,
      xp: 25000
    },
    {
      id: 'education',
      name: 'Education',
      path: '/education',
      icon: GraduationCap,
      color: 'from-amber-400 to-orange-600',
      level: 15,
      xp: 12000
    },
    {
      id: 'dashboard',
      name: 'Unified Dashboard',
      path: '/dashboard',
      icon: LayoutDashboard,
      color: 'from-indigo-400 to-purple-600',
      level: 5,
      xp: 2500
    },
    {
      id: 'contact',
      name: 'Contact',
      path: '/contact',
      icon: User,
      color: 'from-gray-400 to-slate-600',
      level: 1,
      xp: 50
    }
  ];

  const handleNavigation = (path: string, categoryName?: string) => {
    console.log(`Navigating to: ${path} (${categoryName || 'Direct'})`);
    navigate(path);
    setActiveDropdown(null);
    setIsMobileMenuOpen(false);
  };

  const toggleDropdown = (categoryId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    setActiveDropdown(activeDropdown === categoryId ? null : categoryId);
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
    setActiveDropdown(null);
  };

  const isActivePath = (path: string) => {
    return location.pathname === path || 
           (path !== '/' && location.pathname.startsWith(path));
  };

  const handleSignIn = () => {
    setAuthMode('login');
    setShowAuthModal(true);
  };

  const handleSignUp = () => {
    setAuthMode('signup');
    setShowAuthModal(true);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleProfileClick = () => {
    navigate('/profile');
    setIsMobileMenuOpen(false);
  };

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md border-b border-cyan-500/20 ${className}`}>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex-shrink-0 flex items-center">
            <button
              onClick={() => handleNavigation('/', 'Logo')}
              className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent hover:from-cyan-300 hover:to-blue-400 transition-all duration-300 flex items-center gap-2 hover:scale-105"
            >
              <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400 animate-pulse" />
              ETERNYX
            </button>
          </div>

          {/* Desktop Navigation - Hidden on mobile */}
          <div className="hidden md:flex items-center space-x-1">
            {/* Auth Buttons or User Menu */}
            {!isAuthenticated ? (
              <div className="flex items-center gap-2 mr-2">
                <Button
                  onClick={handleSignIn}
                  variant="ghost"
                  className="relative px-4 py-2 text-sm font-medium transition-all duration-300 border border-cyan-500/30 rounded-lg hover:scale-105 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-400 hover:shadow-lg hover:shadow-cyan-500/25"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Sign In
                </Button>
                <Button
                  onClick={handleSignUp}
                  className="relative px-4 py-2 text-sm font-medium transition-all duration-300 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:scale-105 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/25"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Sign Up
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mr-2">
                <Button
                  onClick={handleProfileClick}
                  variant="ghost"
                  className="relative px-4 py-2 text-sm font-medium transition-all duration-300 border border-purple-500/30 rounded-lg hover:scale-105 text-purple-400 hover:bg-purple-500/10 hover:border-purple-400"
                >
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </Button>
                <Button
                  onClick={handleSignOut}
                  variant="ghost"
                  className="relative px-4 py-2 text-sm font-medium transition-all duration-300 border border-red-500/30 rounded-lg hover:scale-105 text-red-400 hover:bg-red-500/10 hover:border-red-400"
                >
                  <X className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            )}
            
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
                  onMouseEnter={() => category.children && setActiveDropdown(category.id)}
                  onMouseLeave={() => setTimeout(() => setActiveDropdown(null), 300)}
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
                {category.children && activeDropdown === category.id && (
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
                            <div className="text-white font-medium group-hover:text-cyan-400 transition-colors">
                              {child.name}
                            </div>
                            <div className="text-gray-400 text-sm mt-1">
                              {child.description}
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

          {/* Mobile Menu Button */}
          <button
            onClick={toggleMobileMenu}
            className="md:hidden p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800/50 transition-all duration-200 hover:scale-110 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Toggle mobile menu"
          >
            {isMobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-black/95 backdrop-blur-md border-b border-cyan-500/20 shadow-xl animate-in slide-in-from-top-2 duration-300 max-h-[calc(100vh-4rem)] overflow-y-auto">
            <div className="px-4 py-6 space-y-3">
              {/* Mobile Auth Buttons */}
              {!isAuthenticated ? (
                <div className="space-y-2 pb-3 border-b border-cyan-500/20">
                  <Button
                    onClick={handleSignIn}
                    variant="ghost"
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-lg transition-all duration-300 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-400 min-h-[56px]"
                  >
                    <LogIn className="w-5 h-5" />
                    <span className="font-medium text-base">Sign In</span>
                  </Button>
                  <Button
                    onClick={handleSignUp}
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-lg transition-all duration-300 bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg min-h-[56px]"
                  >
                    <UserPlus className="w-5 h-5" />
                    <span className="font-medium text-base">Sign Up</span>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 pb-3 border-b border-cyan-500/20">
                  <Button
                    onClick={handleProfileClick}
                    variant="ghost"
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-lg transition-all duration-300 border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:border-purple-400 min-h-[56px]"
                  >
                    <User className="w-5 h-5" />
                    <span className="font-medium text-base">Profile</span>
                  </Button>
                  <Button
                    onClick={handleSignOut}
                    variant="ghost"
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-lg transition-all duration-300 border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-400 min-h-[56px]"
                  >
                    <X className="w-5 h-5" />
                    <span className="font-medium text-base">Sign Out</span>
                  </Button>
                </div>
              )}
              
              {categories.map((category) => (
                <div key={category.id} className="space-y-2">
                  <button
                    onClick={() => category.children ? 
                      toggleDropdown(category.id) : 
                      handleNavigation(category.path, category.name)
                    }
                    className={`
                      w-full flex items-center justify-between p-4 rounded-lg transition-all duration-300 min-h-[56px]
                      ${isActivePath(category.path)
                        ? 'bg-gradient-to-r ' + category.color + ' text-white shadow-lg'
                        : 'text-gray-300 hover:text-white hover:bg-gray-800/50 border border-gray-700 hover:border-cyan-500/30'
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <category.icon className="w-5 h-5 flex-shrink-0" />
                      <div className="flex flex-col items-start">
                        <span className="font-medium text-base">{category.name}</span>
                        {category.level && (
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex items-center gap-1">
                              <Star className="w-3 h-3 text-yellow-400" />
                              <span className="text-xs text-yellow-400">Level {category.level}</span>
                            </div>
                            <span className="text-xs text-cyan-400">{category.xp} XP</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {category.children && (
                      <ChevronDown className={`w-5 h-5 transition-transform duration-200 flex-shrink-0 ${
                        activeDropdown === category.id ? 'rotate-180' : ''
                      }`} />
                    )}
                  </button>

                  {/* Mobile Dropdown */}
                  {category.children && activeDropdown === category.id && (
                    <div className="ml-4 space-y-2 animate-in slide-in-from-top-1 duration-200">
                      {category.children.map((child) => (
                        <button
                          key={child.path}
                          onClick={() => handleNavigation(child.path, child.name)}
                          className="w-full text-left p-3 rounded-lg hover:bg-gray-800/50 transition-all duration-200 border border-gray-700/50 hover:border-cyan-500/30 min-h-[48px]"
                        >
                          <div className="text-white font-medium text-sm">
                            {child.name}
                          </div>
                          <div className="text-gray-400 text-xs mt-1">
                            {child.description}
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
      
      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)}
      />
    </nav>
  );
};

export default MobileResponsiveNavigation;

