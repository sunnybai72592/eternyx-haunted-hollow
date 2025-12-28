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
    },
    {
      id: 'services-hub',
      name: 'Services Hub',
      path: '/services-hub',
      icon: Zap,
      color: 'from-purple-400 to-indigo-600',
    },
    {
      id: 'tools-hub',
      name: 'Tools Hub',
      path: '/tools',
      icon: Wrench,
      color: 'from-cyan-400 to-teal-600',
    },
    {
      id: 'eternyx-ai',
      name: 'Eternyx AI',
      path: '/eternyx-ai',
      icon: Bot,
      color: 'from-pink-400 to-rose-600',
    },
    {
      id: 'education',
      name: 'Education',
      path: '/education',
      icon: GraduationCap,
      color: 'from-amber-400 to-orange-600',
    },
    {
      id: 'dashboard',
      name: 'Unified Dashboard',
      path: '/dashboard',
      icon: LayoutDashboard,
      color: 'from-indigo-400 to-purple-600',
    },
    {
      id: 'contact',
      name: 'Contact',
      path: '/contact',
      icon: User,
      color: 'from-gray-400 to-slate-600',
    }
  ];

  const handleNavigation = (path: string, categoryName?: string) => {
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
    <nav className={`fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md border-b border-white/10 ${className}`}>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex-shrink-0 flex items-center">
            <button
              onClick={() => handleNavigation('/', 'Logo')}
              className="text-xl sm:text-2xl font-bold text-white hover:text-white/80 transition-all duration-300 flex items-center gap-2"
            >
              <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400" />
              ETERNYX
            </button>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {!isAuthenticated ? (
              <div className="flex items-center gap-2 mr-4">
                <Button
                  onClick={handleSignIn}
                  variant="ghost"
                  className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Sign In
                </Button>
                <Button
                  onClick={handleSignUp}
                  className="px-4 py-2 text-sm font-medium bg-white text-black hover:bg-white/90 rounded-lg transition-all"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Sign Up
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mr-4">
                <Button
                  onClick={handleProfileClick}
                  variant="ghost"
                  className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                >
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </Button>
                <Button
                  onClick={handleSignOut}
                  variant="ghost"
                  className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                >
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
                    px-3 py-2 text-sm font-medium transition-all duration-300 rounded-lg
                    ${isActivePath(category.path) 
                      ? 'bg-white/10 text-white' 
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                    }
                    ${category.children ? 'pr-8' : ''}
                  `}
                  onMouseEnter={() => category.children && setActiveDropdown(category.id)}
                  onMouseLeave={() => setTimeout(() => setActiveDropdown(null), 300)}
                >
                  <category.icon className="w-4 h-4 mr-2" />
                  <span className="hidden lg:inline">{category.name}</span>
                  
                  {category.children && (
                    <ChevronDown className={`w-4 h-4 ml-1 transition-transform duration-200 ${
                      activeDropdown === category.id ? 'rotate-180' : ''
                    }`} />
                  )}
                </Button>

                {/* Desktop Dropdown */}
                {category.children && activeDropdown === category.id && (
                  <div 
                    className="absolute top-full left-0 mt-2 w-80 bg-black/95 backdrop-blur-md border border-white/10 rounded-lg shadow-xl z-50"
                    onMouseEnter={() => setActiveDropdown(category.id)}
                    onMouseLeave={() => setTimeout(() => setActiveDropdown(null), 300)}
                  >
                    <div className="p-4">
                      <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        <category.icon className="w-5 h-5 text-white/60" />
                        {category.name}
                      </h3>
                      <div className="grid gap-2">
                        {category.children.map((child) => (
                          <button
                            key={child.path}
                            onClick={() => handleNavigation(child.path, child.name)}
                            className="text-left p-3 rounded-lg hover:bg-white/5 transition-all duration-200"
                          >
                            <div className="text-white font-medium">
                              {child.name}
                            </div>
                            <div className="text-white/40 text-sm mt-1">
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
            className="md:hidden p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200 min-w-[44px] min-h-[44px] flex items-center justify-center"
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
          <div className="md:hidden absolute top-full left-0 right-0 bg-black/95 backdrop-blur-md border-b border-white/10 shadow-xl max-h-[calc(100vh-4rem)] overflow-y-auto">
            <div className="px-4 py-6 space-y-3">
              {!isAuthenticated ? (
                <div className="space-y-2 pb-3 border-b border-white/10">
                  <Button
                    onClick={handleSignIn}
                    variant="ghost"
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-lg text-white/70 hover:text-white hover:bg-white/10 min-h-[56px]"
                  >
                    <LogIn className="w-5 h-5" />
                    <span className="font-medium text-base">Sign In</span>
                  </Button>
                  <Button
                    onClick={handleSignUp}
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-lg bg-white text-black hover:bg-white/90 min-h-[56px]"
                  >
                    <UserPlus className="w-5 h-5" />
                    <span className="font-medium text-base">Sign Up</span>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 pb-3 border-b border-white/10">
                  <Button
                    onClick={handleProfileClick}
                    variant="ghost"
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-lg text-white/70 hover:text-white hover:bg-white/10 min-h-[56px]"
                  >
                    <User className="w-5 h-5" />
                    <span className="font-medium text-base">Profile</span>
                  </Button>
                  <Button
                    onClick={handleSignOut}
                    variant="ghost"
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-lg text-white/70 hover:text-white hover:bg-white/10 min-h-[56px]"
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
                        ? 'bg-white/10 text-white'
                        : 'text-white/60 hover:text-white hover:bg-white/5 border border-white/5'
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <category.icon className="w-5 h-5 flex-shrink-0" />
                      <span className="font-medium text-base">{category.name}</span>
                    </div>
                    
                    {category.children && (
                      <ChevronDown className={`w-5 h-5 transition-transform duration-200 flex-shrink-0 ${
                        activeDropdown === category.id ? 'rotate-180' : ''
                      }`} />
                    )}
                  </button>

                  {/* Mobile Dropdown */}
                  {category.children && activeDropdown === category.id && (
                    <div className="ml-4 space-y-2">
                      {category.children.map((child) => (
                        <button
                          key={child.path}
                          onClick={() => handleNavigation(child.path, child.name)}
                          className="w-full text-left p-3 rounded-lg hover:bg-white/5 transition-all duration-200 border border-white/5 min-h-[48px]"
                        >
                          <div className="text-white font-medium text-sm">
                            {child.name}
                          </div>
                          <div className="text-white/40 text-xs mt-1">
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
      
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)}
      />
    </nav>
  );
};

export default MobileResponsiveNavigation;
