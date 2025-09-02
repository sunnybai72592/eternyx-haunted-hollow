import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CombinedAuthButton } from '@/components/CombinedAuthButton';
import { UserProfile } from '@/components/auth/UserProfile';
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
  Wrench
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

interface NavigationProps {
  className?: string;
}

export const Navigation = ({ className = '' }: NavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  const navigationItems = [
    { 
      name: 'Home', 
      path: '/', 
      icon: Home, 
      color: 'text-cyber-green',
      hoverColor: 'hover:text-cyber-green'
    },
    { 
      name: 'Cybersecurity', 
      path: '/services', 
      icon: Shield, 
      color: 'text-red-400',
      hoverColor: 'hover:text-red-400'
    },
    { 
      name: 'Web Development', 
      path: '/development', 
      icon: Code, 
      color: 'text-blue-400',
      hoverColor: 'hover:text-blue-400'
    },
    { 
      name: 'Digital Innovation', 
      path: '/innovation', 
      icon: Lightbulb, 
      color: 'text-yellow-400',
      hoverColor: 'hover:text-yellow-400'
    },
    { 
      name: 'Killer Edge', 
      path: '/killer-edge', 
      icon: Crown, 
      color: 'text-pink-400',
      hoverColor: 'hover:text-pink-400'
    },
    { 
      name: 'Tools Hub', 
      path: '/tools', 
      icon: Wrench, 
      color: 'text-purple-400',
      hoverColor: 'hover:text-purple-400'
    }
  ];

  const authenticatedItems = [
    { 
      name: 'Dashboard', 
      path: '/dashboard', 
      icon: LayoutDashboard, 
      color: 'text-cyan-400',
      hoverColor: 'hover:text-cyan-400'
    },
    { 
      name: 'Profile', 
      path: '/profile', 
      icon: User, 
      color: 'text-green-400',
      hoverColor: 'hover:text-green-400'
    },
    { 
      name: 'Premium', 
      path: '/premium', 
      icon: Crown, 
      color: 'text-amber-400',
      hoverColor: 'hover:text-amber-400'
    }
  ];

  const isActivePath = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setIsMenuOpen(false);
  };

  return (
    <nav 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled 
          ? 'bg-background/95 backdrop-blur-md border-b border-primary/20 shadow-lg shadow-primary/10' 
          : 'bg-background/80 backdrop-blur-sm'
      } ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <div 
            className="flex items-center cursor-pointer group"
            onClick={() => handleNavigation('/')}
          >
            <div className="text-xl sm:text-2xl font-bold text-primary neon-text group-hover:animate-pulse">
              ETERNYX
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center space-x-1">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = isActivePath(item.path);
              
              return (
                <Button
                  key={item.path}
                  variant="ghost"
                  size="sm"
                  onClick={() => handleNavigation(item.path)}
                  className={`
                    relative px-3 py-2 text-sm font-medium transition-all duration-300
                    ${isActive 
                      ? `${item.color} bg-primary/10 border border-primary/20` 
                      : `text-muted-foreground ${item.hoverColor} hover:bg-primary/5`
                    }
                    hover:scale-105 hover:shadow-lg hover:shadow-primary/20
                  `}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {item.name}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary animate-pulse" />
                  )}
                </Button>
              );
            })}

            {/* Authenticated Items */}
            {isAuthenticated && (
              <>
                <div className="w-px h-6 bg-border mx-2" />
                {authenticatedItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = isActivePath(item.path);
                  
                  return (
                    <Button
                      key={item.path}
                      variant="ghost"
                      size="sm"
                      onClick={() => handleNavigation(item.path)}
                      className={`
                        relative px-3 py-2 text-sm font-medium transition-all duration-300
                        ${isActive 
                          ? `${item.color} bg-primary/10 border border-primary/20` 
                          : `text-muted-foreground ${item.hoverColor} hover:bg-primary/5`
                        }
                        hover:scale-105 hover:shadow-lg hover:shadow-primary/20
                      `}
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      {item.name}
                      {isActive && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary animate-pulse" />
                      )}
                    </Button>
                  );
                })}
              </>
            )}
          </div>

          {/* Desktop Authentication */}
          <div className="hidden lg:flex items-center space-x-3">
            {!isAuthenticated ? (
              <CombinedAuthButton />
            ) : (
              <UserProfile />
            )}
          </div>

          {/* Mobile Menu Button and Auth */}
          <div className="lg:hidden flex items-center space-x-2">
            {/* Authentication Button for Mobile */}
            {!isAuthenticated ? (
              <CombinedAuthButton className="mr-1" />
            ) : (
              <UserProfile className="mr-1" />
            )}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-primary hover:bg-primary/10 touch-target"
            >
              {isMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="lg:hidden border-t border-primary/20 bg-background/95 backdrop-blur-md">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {/* Main Navigation Items */}
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = isActivePath(item.path);
                
                return (
                  <Button
                    key={item.path}
                    variant="ghost"
                    onClick={() => handleNavigation(item.path)}
                    className={`
                      w-full justify-start px-3 py-3 text-base font-medium transition-all duration-300
                      ${isActive 
                        ? `${item.color} bg-primary/10 border border-primary/20` 
                        : `text-muted-foreground ${item.hoverColor} hover:bg-primary/5`
                      }
                      touch-target
                    `}
                  >
                    <Icon className="h-5 w-5 mr-3" />
                    {item.name}
                    {isActive && (
                      <div className="ml-auto w-2 h-2 bg-primary rounded-full animate-pulse" />
                    )}
                  </Button>
                );
              })}

              {/* Authenticated Items */}
              {isAuthenticated && (
                <>
                  <div className="border-t border-primary/20 my-2" />
                  {authenticatedItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = isActivePath(item.path);
                    
                    return (
                      <Button
                        key={item.path}
                        variant="ghost"
                        onClick={() => handleNavigation(item.path)}
                        className={`
                          w-full justify-start px-3 py-3 text-base font-medium transition-all duration-300
                          ${isActive 
                            ? `${item.color} bg-primary/10 border border-primary/20` 
                            : `text-muted-foreground ${item.hoverColor} hover:bg-primary/5`
                          }
                          touch-target
                        `}
                      >
                        <Icon className="h-5 w-5 mr-3" />
                        {item.name}
                        {isActive && (
                          <div className="ml-auto w-2 h-2 bg-primary rounded-full animate-pulse" />
                        )}
                      </Button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Scanning line effect */}
      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary to-transparent animate-scan opacity-50" />
    </nav>
  );
};

export default Navigation;

