import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronUp, Shield, Code, Wrench, Zap, Crown, Lock, Star } from 'lucide-react';

interface NavCategory {
  id: string;
  title: string;
  icon: React.ReactNode;
  level: number;
  xp: number;
  maxXp: number;
  unlocked: boolean;
  routes: {
    name: string;
    path: string;
    description: string;
    level?: number;
  }[];
  color: string;
  glowColor: string;
}

const navCategories: NavCategory[] = [
  {
    id: 'cybersecurity',
    title: 'Cybersecurity',
    icon: <Shield className="h-5 w-5" />,
    level: 15,
    xp: 12750,
    maxXp: 15000,
    unlocked: true,
    color: 'cyber-cyan',
    glowColor: 'cyan',
    routes: [
      { name: 'Threat Monitoring', path: '/threat-monitoring', description: 'Real-time threat detection' },
      { name: 'Zero-Day Protection', path: '/zero-day-protection', description: 'Advanced vulnerability shields' },
      { name: 'Quantum Encryption', path: '/quantum-encryption', description: 'Unbreakable data protection' },
      { name: 'AI Security', path: '/ai-powered-security', description: 'Machine learning defense' },
      { name: 'Black Hat Pentesting', path: '/black-hat-pentesting', description: 'Ethical hacking tools', level: 20 }
    ]
  },
  {
    id: 'webdev',
    title: 'Web Development',
    icon: <Code className="h-5 w-5" />,
    level: 12,
    xp: 8900,
    maxXp: 12000,
    unlocked: true,
    color: 'cyber-green',
    glowColor: 'green',
    routes: [
      { name: 'Frontend Development', path: '/frontend-development', description: 'React, Vue, Angular mastery' },
      { name: 'Backend Development', path: '/backend-development', description: 'Node.js, Python, APIs' },
      { name: 'Cloud Solutions', path: '/cloud-solutions', description: 'AWS, Azure, GCP deployment' },
      { name: 'Performance Optimization', path: '/performance-optimization', description: 'Speed & efficiency boost' },
      { name: 'Custom Solutions', path: '/custom-solutions', description: 'Tailored development' }
    ]
  },
  {
    id: 'toolshub',
    title: 'Tools Hub',
    icon: <Wrench className="h-5 w-5" />,
    level: 18,
    xp: 14200,
    maxXp: 18000,
    unlocked: true,
    color: 'cyber-orange',
    glowColor: 'orange',
    routes: [
      { name: 'Cyber Arsenal', path: '/arsenal', description: 'Advanced hacking toolkit' },
      { name: 'Network Scanner', path: '/tools/network-scanner', description: 'Deep network analysis' },
      { name: 'Code Analyzer', path: '/tools/code-analyzer', description: 'Static code security' },
      { name: 'Exploit Framework', path: '/tools/exploit-framework', description: 'Penetration testing suite' },
      { name: 'Data Forensics', path: '/tools/data-forensics', description: 'Digital investigation tools' }
    ]
  },
  {
    id: 'innovation',
    title: 'Digital Innovation',
    icon: <Zap className="h-5 w-5" />,
    level: 8,
    xp: 4500,
    maxXp: 8000,
    unlocked: true,
    color: 'cyber-pink',
    glowColor: 'pink',
    routes: [
      { name: 'AI Research Lab', path: '/innovation/ai-lab', description: 'Cutting-edge AI experiments' },
      { name: 'Blockchain Tech', path: '/innovation/blockchain', description: 'Decentralized solutions' },
      { name: 'IoT Security', path: '/innovation/iot-security', description: 'Connected device protection' },
      { name: 'Quantum Computing', path: '/innovation/quantum', description: 'Next-gen computing power' },
      { name: 'Neural Networks', path: '/innovation/neural', description: 'Deep learning systems', level: 15 }
    ]
  },
  {
    id: 'killeredge',
    title: 'Killer Edge',
    icon: <Crown className="h-5 w-5" />,
    level: 25,
    xp: 19800,
    maxXp: 25000,
    unlocked: false,
    color: 'cyber-purple',
    glowColor: 'purple',
    routes: [
      { name: 'Elite Operations', path: '/killer-edge/elite', description: 'Top-tier hacking missions', level: 25 },
      { name: 'Zero-Click Exploits', path: '/killer-edge/zero-click', description: 'Advanced attack vectors', level: 30 },
      { name: 'Nation-State Tools', path: '/killer-edge/nation-state', description: 'Government-grade arsenal', level: 35 },
      { name: 'Quantum Hacking', path: '/killer-edge/quantum-hack', description: 'Future-proof attacks', level: 40 },
      { name: 'Digital Warfare', path: '/killer-edge/warfare', description: 'Cyber battlefield tactics', level: 50 }
    ]
  }
];

interface CyberNavButtonProps {
  category: NavCategory;
  isExpanded: boolean;
  onToggle: () => void;
  isActive: boolean;
}

const CyberNavButton: React.FC<CyberNavButtonProps> = ({ category, isExpanded, onToggle, isActive }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number }>>([]);
  
  const progressPercentage = (category.xp / category.maxXp) * 100;

  const generateParticles = () => {
    const newParticles = Array.from({ length: 8 }, (_, i) => ({
      id: Date.now() + i,
      x: Math.random() * 100,
      y: Math.random() * 100
    }));
    setParticles(newParticles);
    setTimeout(() => setParticles([]), 1000);
  };

  useEffect(() => {
    if (isHovered) {
      generateParticles();
    }
  }, [isHovered]);

  return (
    <div className="relative group">
      {/* Main Button */}
      <button
        onClick={onToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`
          relative overflow-hidden px-4 py-2 rounded-lg border transition-all duration-500 ease-out
          ${isActive 
            ? `bg-${category.color}/20 border-${category.color} text-${category.color} shadow-lg shadow-${category.color}/30` 
            : `bg-black/40 border-${category.color}/30 text-${category.color}/70 hover:bg-${category.color}/10 hover:border-${category.color} hover:text-${category.color}`
          }
          ${!category.unlocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          transform hover:scale-105 hover:-translate-y-1
          backdrop-blur-sm
        `}
        disabled={!category.unlocked}
      >
        {/* Holographic Background Effect */}
        <div className={`
          absolute inset-0 bg-gradient-to-r from-transparent via-${category.color}/10 to-transparent
          transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000
        `} />
        
        {/* Scan Lines */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className={`absolute w-full h-px bg-${category.color}/30 animate-scan`}
              style={{
                top: `${25 + i * 25}%`,
                animationDelay: `${i * 0.3}s`,
                animationDuration: '2s'
              }}
            />
          ))}
        </div>

        {/* Particle Effects */}
        {particles.map(particle => (
          <div
            key={particle.id}
            className={`absolute w-1 h-1 bg-${category.color} rounded-full animate-ping`}
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              animationDuration: '1s'
            }}
          />
        ))}

        {/* Button Content */}
        <div className="relative z-10 flex items-center space-x-2">
          <div className={`relative ${!category.unlocked ? 'filter grayscale' : ''}`}>
            {category.unlocked ? category.icon : <Lock className="h-5 w-5" />}
            
            {/* Level Badge */}
            <div className={`
              absolute -top-2 -right-2 w-4 h-4 rounded-full bg-${category.color} 
              flex items-center justify-center text-xs font-bold text-black
              ${isHovered ? 'animate-pulse' : ''}
            `}>
              {category.level}
            </div>
          </div>
          
          <span className="font-mono text-sm font-medium">{category.title}</span>
          
          {/* XP Display */}
          <div className="hidden lg:flex items-center space-x-1 text-xs">
            <Star className="h-3 w-3" />
            <span>{category.xp}</span>
          </div>
          
          {/* Expand/Collapse Icon */}
          <div className={`transform transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>

        {/* Progress Bar */}
        <div className="absolute bottom-0 left-0 w-full h-1 bg-black/50 overflow-hidden">
          <div 
            className={`h-full bg-gradient-to-r from-${category.color}/50 to-${category.color} transition-all duration-1000 relative`}
            style={{ width: `${progressPercentage}%` }}
          >
            <div className="absolute inset-0 bg-white/20 animate-pulse" />
          </div>
        </div>

        {/* Glow Effect */}
        <div className={`
          absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500
          shadow-lg shadow-${category.color}/50 blur-sm -z-10
        `} />
      </button>

      {/* Dropdown Menu */}
      <div className={`
        absolute top-full left-0 mt-2 w-80 bg-black/95 backdrop-blur-md border border-${category.color}/30 
        rounded-lg shadow-2xl shadow-${category.color}/20 z-50 overflow-hidden
        transform transition-all duration-500 ease-out origin-top
        ${isExpanded ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0 pointer-events-none'}
      `}>
        {/* Header */}
        <div className={`p-4 border-b border-${category.color}/20 bg-gradient-to-r from-${category.color}/10 to-transparent`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {category.icon}
              <h3 className={`font-mono font-bold text-${category.color}`}>{category.title}</h3>
            </div>
            <div className={`text-xs text-${category.color}/70`}>
              Level {category.level} • {category.xp}/{category.maxXp} XP
            </div>
          </div>
          
          {/* Category Progress Bar */}
          <div className="mt-2 w-full h-2 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className={`h-full bg-gradient-to-r from-${category.color}/70 to-${category.color} transition-all duration-1000 relative`}
              style={{ width: `${progressPercentage}%` }}
            >
              <div className="absolute inset-0 bg-white/30 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Routes */}
        <div className="p-2 space-y-1">
          {category.routes.map((route, index) => (
            <Link
              key={route.path}
              to={route.path}
              className={`
                block p-3 rounded-lg transition-all duration-300 group/item
                hover:bg-${category.color}/10 hover:border-${category.color}/30 border border-transparent
                ${route.level && route.level > category.level ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h4 className={`font-mono text-sm font-medium text-${category.color} group-hover/item:text-white transition-colors`}>
                      {route.name}
                    </h4>
                    {route.level && (
                      <span className={`
                        text-xs px-2 py-1 rounded-full bg-${category.color}/20 text-${category.color}
                        ${route.level > category.level ? 'bg-red-500/20 text-red-400' : ''}
                      `}>
                        LVL {route.level}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1 group-hover/item:text-gray-300 transition-colors">
                    {route.description}
                  </p>
                </div>
                
                {route.level && route.level > category.level && (
                  <Lock className="h-4 w-4 text-red-400" />
                )}
              </div>
              
              {/* Hover Effect Line */}
              <div className={`
                w-0 h-px bg-gradient-to-r from-${category.color} to-transparent mt-2
                group-hover/item:w-full transition-all duration-500
              `} />
            </Link>
          ))}
        </div>

        {/* Footer */}
        <div className={`p-3 border-t border-${category.color}/20 bg-gradient-to-r from-transparent to-${category.color}/5`}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">
              {category.routes.filter(r => !r.level || r.level <= category.level).length} / {category.routes.length} unlocked
            </span>
            <span className={`text-${category.color}/70`}>
              Next unlock: {category.routes.find(r => r.level && r.level > category.level)?.level || 'MAX'} LVL
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const CyberNavBar: React.FC = () => {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const location = useLocation();

  const handleToggle = (categoryId: string) => {
    setExpandedCategory(expandedCategory === categoryId ? null : categoryId);
  };

  const isActive = (category: NavCategory) => {
    return category.routes.some(route => location.pathname === route.path);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setExpandedCategory(null);
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <nav className="relative z-40 bg-black/80 backdrop-blur-md border-b border-cyber-cyan/30">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-center space-x-1 py-3 overflow-x-auto">
          {navCategories.map((category) => (
            <div key={category.id} onClick={(e) => e.stopPropagation()}>
              <CyberNavButton
                category={category}
                isExpanded={expandedCategory === category.id}
                onToggle={() => handleToggle(category.id)}
                isActive={isActive(category)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Background Particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(10)].map((_, i) => (
          <div
            key={i}
            className="absolute w-px h-px bg-cyber-cyan/30 animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${3 + Math.random() * 2}s`
            }}
          />
        ))}
      </div>
    </nav>
  );
};

export default CyberNavBar;

