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
  Wrench,
  Settings,
  Bell,
  Search,
  Zap,
  Star,
  Lock
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

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
  }[];
}

export const UnifiedNavigation = ({ className = '' }: NavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

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
    setExpandedCategory(null);
  }, [location.pathname]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setExpandedCategory(null);
    };

    if (expandedCategory) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [expandedCategory]);

  const navigationCategories: NavCategory[] = [
    { 
      id: 'home',
      name: 'Home', 
      path: '/', 
      icon: Home, 
      color: 'text-cyber-green',
      hoverColor: 'hover:text-cyber-green'
    },
    { 
      id: 'cybersecurity',
      name: 'Cybersecurity', 
      path: '/services', 
      icon: Shield, 
      color: 'text-red-400',
      hoverColor: 'hover:text-red-400',
      level: 15,
      xp: 12750,
      maxXp: 15000,
      unlocked: true,
      children: [
        { name: 'Threat Monitoring', path: '/threat-monitoring', description: 'Real-time threat detection' },
        { name: 'Zero-Day Protection', path: '/zero-day-protection', description: 'Advanced vulnerability shields' },
        { name: 'Quantum Encryption', path: '/quantum-encryption', description: 'Unbreakable data protection' },
        { name: 'AI Security', path: '/ai-powered-security', description: 'Machine learning defense' },
        { name: 'Black Hat Pentesting', path: '/black-hat-pentesting', description: 'Ethical hacking tools', level: 20 }
      ]
    },
    { 
      id: 'development',
      name: 'Web Development', 
      path: '/development', 
      icon: Code, 
      color: 'text-blue-400',
      hoverColor: 'hover:text-blue-400',
      level: 12,
      xp: 8900,
      maxXp: 12000,
      unlocked: true,
      children: [
        { name: 'Frontend Development', path: '/frontend-development', description: 'React, Vue, Angular mastery' },
        { name: 'Backend Development', path: '/backend-development', description: 'Node.js, Python, APIs' },
        { name: 'Cloud Solutions', path: '/cloud-solutions', description: 'AWS, Azure, GCP deployment' },
        { name: 'Performance Optimization', path: '/performance-optimization', description: 'Speed & efficiency boost' },
        { name: 'Custom Solutions', path: '/custom-solutions', description: 'Tailored development' }
      ]
    },
    { 
      id: 'innovation',
      name: 'Digital Innovation', 
      path: '/innovation', 
      icon: Lightbulb, 
      color: 'text-yellow-400',
      hoverColor: 'hover:text-yellow-400',
      level: 8,
      xp: 4500,
      maxXp: 8000,
      unlocked: true,
      children: [
        { name: 'AI Research Lab', path: '/innovation/ai-lab', description: 'Cutting-edge AI experiments' },
        { name: 'Blockchain Tech', path: '/innovation/blockchain', description: 'Decentralized solutions' },
        { name: 'IoT Security', path: '/innovation/iot-security', description: 'Connected device protection' },
        { name: 'Quantum Computing', path: '/innovation/quantum', description: 'Next-gen computing power' }
      ]
    },
    { 
      id: 'tools',
      name: 'Tools Hub', 
      path: '/tools', 
      icon: Wrench, 
      color: 'text-purple-400',
      hoverColor: 'hover:text-purple-400',
      level: 18,
      xp: 14200,
      maxXp: 18000,
      unlocked: true,
      children: [
        { name: 'Cyber Arsenal', path: '/arsenal', description: 'Advanced hacking toolkit' },
        { name: 'Network Scanner', path: '/tools/network-scanner', description: 'Deep network analysis' },
        { name: 'Code Analyzer', path: '/tools/code-analyzer', description: 'Static code security' },
        { name: 'Exploit Framework', path: '/tools/exploit-framework', description: 'Penetration testing suite' }
      ]
    },
    { 
      id: 'killer-edge',
      name: 'Killer Edge', 
      path: '/killer-edge', 
      icon: Crown, 
      color: 'text-pink-400',
      hoverColor: 'hover:text-pink-400',
      level: 25,
      xp: 19800,
      maxXp: 25000,
      unlocked: false,
      children: [
        { name: 'Elite Operations', path: '/killer-edge/elite', description: 'Top-tier hacking missions', level: 25 },
        { name: 'Zero-Click Exploits', path: '/killer-edge/zero-click', description: 'Advanced attack vectors', level: 30 }
      ]
    },
    { 
      id: 'contact',
      name: 'Contact', 
      path: '/contact', 
      icon: User, 
      color: 'text-orange-400',
      hoverColor: 'hover:text-orange-400'
    }
  ];

  const authenticatedItems: NavCategory[] = [
    { 
      id: 'dashboard',
      name: 'Dashboard', 
      path: '/dashboard', 
      icon: LayoutDashboard, 
      color: 'text-cyan-400',
      hoverColor: 'hover:text-cyan-400'
    },
    { 
      id: 'profile',
      name: 'Profile', 
      path: '/profile', 
      icon: User, 
      color: 'text-green-400',
      hoverColor: 'hover:text-green-400'
    },
    { 
      id: 'premium',
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

  const isCategoryActive = (category: NavCategory) => {
    if (isActivePath(category.path)) return true;
    if (category.children) {
      return category.children.some(child => isActivePath(child.path));
    }
    return false;
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setIsMenuOpen(false);
    setExpandedCategory(null);
  };

  const handleCategoryToggle = (categoryId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const category = navigationCategories.find(cat => cat.id === categoryId);
    
    if (category?.children && category.children.length > 0) {
      setExpandedCategory(expandedCategory === categoryId ? null : categoryId);
    } else {
      handleNavigation(category?.path || '/');
    }
  };

  const renderNavButton = (category: NavCategory, isMobile = false) => {
    const Icon = category.icon;
    const isActive = isCategoryActive(category);
    const hasChildren = category.children && category.children.length > 0;
    const isExpanded = expandedCategory === category.id;
    const progressPercentage = category.maxXp ? (category.xp || 0) / category.maxXp * 100 : 0;

    return (
      <div key={category.id} className="relative">
        <Button
          variant="ghost"
          size={isMobile ? "default" : "sm"}
          onClick={(e) => hasChildren ? handleCategoryToggle(category.id, e) : handleNavigation(category.path)}
          className={`
            relative px-3 py-2 text-sm font-medium transition-all duration-300 group
            ${isActive 
              ? `${category.color} bg-primary/10 border border-primary/20` 
              : `text-muted-foreground ${category.hoverColor} hover:bg-primary/5`
            }
            ${!category.unlocked && category.unlocked !== undefined ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 hover:shadow-lg hover:shadow-primary/20'}
            ${isMobile ? 'w-full justify-start' : ''}
            overflow-hidden backdrop-blur-sm
          `}
          disabled={!category.unlocked && category.unlocked !== undefined}
        >
          {/* Holographic effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
          
          <div className="relative z-10 flex items-center w-full">
            <div className="relative">
              {category.unlocked === false ? <Lock className="h-4 w-4 mr-2" /> : <Icon className="h-4 w-4 mr-2" />}
              {category.level && (
                <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-black">
                  {category.level}
                </div>
              )}
            </div>
            <span>{category.name}</span>
            {category.xp && !isMobile && (
              <div className="ml-auto flex items-center space-x-1 text-xs">
                <Star className="h-3 w-3" />
                <span>{category.xp}</span>
              </div>
            )}
            {hasChildren && (
              <ChevronDown className={`h-4 w-4 ml-2 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
            )}
          </div>
          
          {/* Progress bar */}
          {category.maxXp && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-black/50 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary/50 to-primary transition-all duration-1000"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          )}
          
          {isActive && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary animate-pulse" />
          )}
        </Button>

        {/* Dropdown Menu */}
        {hasChildren && isExpanded && (
          <div className={`
            absolute top-full left-0 mt-2 w-80 bg-background/95 backdrop-blur-md border border-primary/30 
            rounded-lg shadow-2xl shadow-primary/20 z-50 overflow-hidden
            transform transition-all duration-500 ease-out origin-top
            ${isMobile ? 'relative w-full mt-1' : ''}
          `}>
            {/* Header */}
            <div className="p-4 border-b border-primary/20 bg-gradient-to-r from-primary/10 to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Icon className="h-4 w-4" />
                  <h3 className="font-mono font-bold text-primary">{category.name}</h3>
                </div>
                {category.level && (
                  <div className="text-xs text-primary/70">
                    Level {category.level} • {category.xp}/{category.maxXp} XP
                  </div>
                )}
              </div>
              
              {category.maxXp && (
                <div className="mt-2 w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-1000"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              )}
            </div>

            {/* Children */}
            <div className="p-2 space-y-1">
              {category.children?.map((child, index) => (
                <button
                  key={child.path}
                  onClick={() => handleNavigation(child.path)}
                  className="w-full text-left p-3 rounded-lg transition-all duration-300 hover:bg-primary/10 hover:border-primary/30 border border-transparent group"
                  disabled={child.level && category.level && child.level > category.level}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="font-mono text-sm font-medium text-primary group-hover:text-foreground transition-colors">
                          {child.name}
                        </h4>
                        {child.level && (
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            child.level && category.level && child.level > category.level
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-primary/20 text-primary'
                          }`}>
                            LVL {child.level}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 group-hover:text-muted-foreground/80 transition-colors">
                        {child.description}
                      </p>
                    </div>
                    
                    {child.level && category.level && child.level > category.level && (
                      <Lock className="h-4 w-4 text-red-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
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
            <div className="relative">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center font-bold text-background text-sm transform group-hover:scale-110 transition-transform duration-300">
                E
              </div>
              <div className="absolute inset-0 bg-primary rounded-lg blur-sm opacity-0 group-hover:opacity-50 transition-opacity duration-300"></div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-primary neon-text group-hover:animate-pulse ml-2">
              ETERNYX
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center space-x-1">
            {navigationCategories.map((category) => renderNavButton(category))}

            {/* Authenticated Items */}
            {isAuthenticated && (
              <>
                <div className="w-px h-6 bg-border mx-2" />
                {authenticatedItems.map((item) => renderNavButton(item))}
              </>
            )}
          </div>

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center space-x-3">
            <Button variant="ghost" size="sm" className="text-primary hover:text-foreground">
              <Search className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="text-primary hover:text-foreground relative">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            </Button>
            {!isAuthenticated ? (
              <CombinedAuthButton />
            ) : (
              <UserProfile />
            )}
          </div>

          {/* Mobile Menu Button and Auth */}
          <div className="lg:hidden flex items-center space-x-2">
            {!isAuthenticated ? (
              <CombinedAuthButton className="mr-1" />
            ) : (
              <UserProfile className="mr-1" />
            )}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-primary hover:bg-primary/10"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="lg:hidden border-t border-primary/20 bg-background/95 backdrop-blur-md">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {/* Main Navigation Items */}
              {navigationCategories.map((category) => (
                <div key={category.id}>
                  {renderNavButton(category, true)}
                </div>
              ))}

              {/* Authenticated Items */}
              {isAuthenticated && (
                <>
                  <div className="border-t border-primary/20 my-2" />
                  {authenticatedItems.map((item) => (
                    <div key={item.id}>
                      {renderNavButton(item, true)}
                    </div>
                  ))}
                </>
              )}

              {/* Mobile Actions */}
              <div className="border-t border-primary/20 my-2 pt-2 flex space-x-2">
                <Button variant="ghost" size="sm" className="text-primary hover:text-foreground flex-1">
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
                <Button variant="ghost" size="sm" className="text-primary hover:text-foreground relative">
                  <Bell className="h-4 w-4" />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Scanning line effect */}
      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary to-transparent animate-scan opacity-50" />
    </nav>
  );
};

export default UnifiedNavigation;

