import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  BookOpen, 
  Search, 
  Filter, 
  Star,
  Eye,
  Clock,
  Users,
  MessageSquare,
  Play,
  Code,
  Terminal,
  Shield,
  Lock,
  Globe,
  Brain,
  Target,
  Zap,
  TrendingUp,
  Calendar,
  Tag,
  User,
  Heart,
  Share,
  Bookmark,
  Download
} from 'lucide-react';

interface Article {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  publishedAt: Date;
  updatedAt: Date;
  category: string;
  tags: string[];
  readTime: number;
  views: number;
  likes: number;
  comments: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  featured: boolean;
}

interface Tutorial {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  duration: number; // minutes
  steps: TutorialStep[];
  prerequisites: string[];
  tools: string[];
  completions: number;
  rating: number;
  interactive: boolean;
}

interface TutorialStep {
  id: string;
  title: string;
  content: string;
  code?: string;
  expectedOutput?: string;
  hints: string[];
  completed: boolean;
}

interface CaseStudy {
  id: string;
  title: string;
  summary: string;
  industry: string;
  attackVector: string;
  impact: string;
  timeline: string;
  lessons: string[];
  preventionMeasures: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  readTime: number;
}

export default function KnowledgeHub() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('articles');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [articles, setArticles] = useState<Article[]>([]);
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [caseStudies, setCaseStudies] = useState<CaseStudy[]>([]);

  useEffect(() => {
    // Initialize knowledge base content
    setArticles([
      {
        id: '1',
        title: 'The Evolution of Quantum-Resistant Cryptography',
        excerpt: 'Exploring the future of encryption in the post-quantum era and its implications for cybersecurity.',
        content: 'Full article content...',
        author: 'Dr. Cipher',
        publishedAt: new Date(Date.now() - 86400000),
        updatedAt: new Date(Date.now() - 86400000),
        category: 'Cryptography',
        tags: ['quantum', 'encryption', 'post-quantum', 'security'],
        readTime: 12,
        views: 2847,
        likes: 156,
        comments: 23,
        difficulty: 'advanced',
        featured: true
      },
      {
        id: '2',
        title: 'Advanced Persistent Threats: Detection and Mitigation',
        excerpt: 'A comprehensive guide to identifying and defending against sophisticated APT campaigns.',
        content: 'Full article content...',
        author: 'Shadow Analyst',
        publishedAt: new Date(Date.now() - 172800000),
        updatedAt: new Date(Date.now() - 172800000),
        category: 'Threat Intelligence',
        tags: ['apt', 'detection', 'mitigation', 'enterprise'],
        readTime: 18,
        views: 1923,
        likes: 89,
        comments: 34,
        difficulty: 'expert',
        featured: false
      },
      {
        id: '3',
        title: 'Building Secure APIs in the Modern Era',
        excerpt: 'Best practices for developing APIs that can withstand contemporary attack vectors.',
        content: 'Full article content...',
        author: 'Code Guardian',
        publishedAt: new Date(Date.now() - 259200000),
        updatedAt: new Date(Date.now() - 259200000),
        category: 'Development',
        tags: ['api', 'security', 'development', 'best-practices'],
        readTime: 8,
        views: 3456,
        likes: 234,
        comments: 67,
        difficulty: 'intermediate',
        featured: true
      }
    ]);

    setTutorials([
      {
        id: '1',
        title: 'SQL Injection Fundamentals',
        description: 'Learn the basics of SQL injection attacks and how to exploit vulnerable applications.',
        category: 'Web Security',
        difficulty: 'beginner',
        duration: 45,
        steps: [
          {
            id: '1',
            title: 'Understanding SQL Injection',
            content: 'SQL injection is a code injection technique...',
            completed: false,
            hints: ['Look for input fields that interact with databases']
          },
          {
            id: '2',
            title: 'Identifying Vulnerable Parameters',
            content: 'Learn to identify potentially vulnerable input points...',
            code: "' OR 1=1 --",
            expectedOutput: 'Login bypass successful',
            completed: false,
            hints: ['Try single quotes to break SQL syntax']
          }
        ],
        prerequisites: ['Basic SQL knowledge', 'Understanding of web applications'],
        tools: ['Burp Suite', 'SQLMap', 'Browser Developer Tools'],
        completions: 1247,
        rating: 4.8,
        interactive: true
      },
      {
        id: '2',
        title: 'Network Penetration Testing',
        description: 'Comprehensive guide to network reconnaissance and exploitation techniques.',
        category: 'Network Security',
        difficulty: 'advanced',
        duration: 120,
        steps: [
          {
            id: '1',
            title: 'Network Discovery',
            content: 'Use Nmap to discover live hosts and services...',
            code: 'nmap -sS -O -A target_network/24',
            completed: false,
            hints: ['Start with a ping sweep to identify live hosts']
          }
        ],
        prerequisites: ['Linux command line', 'TCP/IP networking', 'Basic penetration testing'],
        tools: ['Nmap', 'Metasploit', 'Wireshark', 'Burp Suite'],
        completions: 456,
        rating: 4.9,
        interactive: true
      }
    ]);

    setCaseStudies([
      {
        id: '1',
        title: 'The SolarWinds Supply Chain Attack',
        summary: 'Analysis of one of the most sophisticated supply chain attacks in history.',
        industry: 'Technology',
        attackVector: 'Supply Chain Compromise',
        impact: '$100M+ in damages, 18,000+ organizations affected',
        timeline: 'March 2020 - December 2020',
        lessons: [
          'Supply chain security is critical for enterprise defense',
          'Code signing alone is insufficient for supply chain protection',
          'Network segmentation can limit lateral movement',
          'Threat hunting capabilities are essential for early detection'
        ],
        preventionMeasures: [
          'Implement software bill of materials (SBOM)',
          'Deploy runtime application self-protection (RASP)',
          'Establish vendor security assessment programs',
          'Enable comprehensive logging and monitoring'
        ],
        difficulty: 'expert',
        readTime: 25
      },
      {
        id: '2',
        title: 'Equifax Data Breach: A Preventable Disaster',
        summary: 'How a known vulnerability led to one of the largest data breaches in history.',
        industry: 'Financial Services',
        attackVector: 'Unpatched Web Application Vulnerability',
        impact: '147M+ personal records compromised, $700M+ in costs',
        timeline: 'May 2017 - July 2017',
        lessons: [
          'Patch management is critical for security',
          'Asset inventory and vulnerability management are essential',
          'Incident response planning must include communication strategies',
          'Regular security assessments can prevent major breaches'
        ],
        preventionMeasures: [
          'Implement automated patch management',
          'Deploy web application firewalls (WAF)',
          'Establish vulnerability disclosure programs',
          'Enable real-time security monitoring'
        ],
        difficulty: 'intermediate',
        readTime: 15
      }
    ]);
  }, []);

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'text-green-400 border-green-400/50';
      case 'intermediate': return 'text-yellow-400 border-yellow-400/50';
      case 'advanced': return 'text-orange-400 border-orange-400/50';
      case 'expert': return 'text-red-400 border-red-400/50';
      default: return 'text-blue-400 border-blue-400/50';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'cryptography': return <Lock className="h-4 w-4" />;
      case 'threat intelligence': return <Eye className="h-4 w-4" />;
      case 'development': return <Code className="h-4 w-4" />;
      case 'web security': return <Globe className="h-4 w-4" />;
      case 'network security': return <Shield className="h-4 w-4" />;
      default: return <BookOpen className="h-4 w-4" />;
    }
  };

  const filteredArticles = articles.filter(article => {
    const matchesSearch = article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         article.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         article.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || article.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ['all', ...Array.from(new Set(articles.map(a => a.category)))];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-primary/20 bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-primary glitch mb-2" data-text="KNOWLEDGE HUB">
                KNOWLEDGE HUB
              </h1>
              <p className="text-muted-foreground">
                Cyberpunk intelligence archive and learning center
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant="outline" className="text-green-400 border-green-400/50">
                <BookOpen className="h-3 w-3 mr-1" />
                {articles.length} ARTICLES
              </Badge>
              <Badge variant="outline" className="text-blue-400 border-blue-400/50">
                <Play className="h-3 w-3 mr-1" />
                {tutorials.length} TUTORIALS
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Search and Filters */}
        <div className="mb-8 space-y-4">
          <div className="flex space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search the digital archives..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-card/50 border-primary/20"
              />
            </div>
            <Button variant="outline" className="border-primary/20">
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
          </div>
          
          <div className="flex space-x-2 overflow-x-auto">
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className={selectedCategory === category ? "bg-primary text-primary-foreground" : "border-primary/20"}
              >
                {category === 'all' ? 'All Categories' : category}
              </Button>
            ))}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-card/50 border border-primary/20">
            <TabsTrigger value="articles" className="data-[state=active]:bg-primary/20">
              <BookOpen className="h-4 w-4 mr-2" />
              Articles
            </TabsTrigger>
            <TabsTrigger value="tutorials" className="data-[state=active]:bg-primary/20">
              <Play className="h-4 w-4 mr-2" />
              Tutorials
            </TabsTrigger>
            <TabsTrigger value="case-studies" className="data-[state=active]:bg-primary/20">
              <Target className="h-4 w-4 mr-2" />
              Case Studies
            </TabsTrigger>
            <TabsTrigger value="community" className="data-[state=active]:bg-primary/20">
              <Users className="h-4 w-4 mr-2" />
              Community
            </TabsTrigger>
          </TabsList>

          <TabsContent value="articles" className="space-y-6">
            {/* Featured Articles */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {articles.filter(a => a.featured).slice(0, 2).map((article) => (
                <Card key={article.id} className="p-6 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-400/20 neon-border">
                  <div className="flex items-start justify-between mb-4">
                    <Badge variant="outline" className="text-yellow-400 border-yellow-400/50">
                      <Star className="h-3 w-3 mr-1" />
                      FEATURED
                    </Badge>
                    <Badge variant="outline" className={getDifficultyColor(article.difficulty)}>
                      {article.difficulty.toUpperCase()}
                    </Badge>
                  </div>
                  
                  <h3 className="text-xl font-bold text-primary mb-2">{article.title}</h3>
                  <p className="text-muted-foreground mb-4">{article.excerpt}</p>
                  
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <User className="h-3 w-3" />
                        <span>{article.author}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Clock className="h-3 w-3" />
                        <span>{article.readTime}m read</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Eye className="h-3 w-3" />
                        <span>{article.views.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2">
                    <Button size="sm" className="bg-primary hover:bg-primary/80">
                      <BookOpen className="h-3 w-3 mr-1" />
                      Read Article
                    </Button>
                    <Button size="sm" variant="outline" className="border-primary/20">
                      <Bookmark className="h-3 w-3 mr-1" />
                      Save
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            {/* Articles Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredArticles.filter(a => !a.featured).map((article) => (
                <Card key={article.id} className="p-6 bg-card/50 backdrop-blur-sm border-primary/20 neon-border hover:scale-105 transition-all duration-300 cursor-pointer">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      {getCategoryIcon(article.category)}
                      <span className="text-xs text-blue-400">{article.category}</span>
                    </div>
                    <Badge variant="outline" className={getDifficultyColor(article.difficulty)}>
                      {article.difficulty.charAt(0).toUpperCase()}
                    </Badge>
                  </div>
                  
                  <h3 className="text-lg font-bold text-primary mb-2">{article.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{article.excerpt}</p>
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                    <span>{article.author}</span>
                    <span>{article.readTime}m read</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 text-xs">
                      <div className="flex items-center space-x-1">
                        <Eye className="h-3 w-3" />
                        <span>{article.views}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Heart className="h-3 w-3" />
                        <span>{article.likes}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <MessageSquare className="h-3 w-3" />
                        <span>{article.comments}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="tutorials" className="space-y-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tutorials.map((tutorial) => (
                <Card key={tutorial.id} className="p-6 bg-card/50 backdrop-blur-sm border-primary/20 neon-border hover:scale-105 transition-all duration-300 cursor-pointer">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="outline" className={getDifficultyColor(tutorial.difficulty)}>
                      {tutorial.difficulty.toUpperCase()}
                    </Badge>
                    {tutorial.interactive && (
                      <Badge variant="outline" className="text-purple-400 border-purple-400/50">
                        <Zap className="h-3 w-3 mr-1" />
                        INTERACTIVE
                      </Badge>
                    )}
                  </div>
                  
                  <h3 className="text-lg font-bold text-primary mb-2">{tutorial.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{tutorial.description}</p>
                  
                  <div className="space-y-2 text-xs mb-4">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duration:</span>
                      <span className="text-blue-400">{tutorial.duration}m</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Completions:</span>
                      <span className="text-green-400">{tutorial.completions}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rating:</span>
                      <div className="flex items-center space-x-1">
                        <Star className="h-3 w-3 text-yellow-400 fill-current" />
                        <span className="text-yellow-400">{tutorial.rating}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2 mb-4">
                    <div className="text-xs text-muted-foreground">Prerequisites:</div>
                    <div className="flex flex-wrap gap-1">
                      {tutorial.prerequisites.slice(0, 2).map((prereq, index) => (
                        <Badge key={index} variant="outline" className="text-xs text-muted-foreground border-muted-foreground/30">
                          {prereq}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  <Button size="sm" className="w-full bg-primary hover:bg-primary/80">
                    <Play className="h-3 w-3 mr-1" />
                    Start Tutorial
                  </Button>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="case-studies" className="space-y-6">
            <div className="space-y-6">
              {caseStudies.map((caseStudy) => (
                <Card key={caseStudy.id} className="p-6 bg-card/50 backdrop-blur-sm border-primary/20 neon-border">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-primary mb-2">{caseStudy.title}</h3>
                      <p className="text-muted-foreground">{caseStudy.summary}</p>
                    </div>
                    <Badge variant="outline" className={getDifficultyColor(caseStudy.difficulty)}>
                      {caseStudy.difficulty.toUpperCase()}
                    </Badge>
                  </div>
                  
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="p-3 bg-background/50 rounded border border-blue-400/20">
                      <div className="text-xs text-muted-foreground mb-1">Industry</div>
                      <div className="text-sm font-medium text-blue-400">{caseStudy.industry}</div>
                    </div>
                    <div className="p-3 bg-background/50 rounded border border-red-400/20">
                      <div className="text-xs text-muted-foreground mb-1">Attack Vector</div>
                      <div className="text-sm font-medium text-red-400">{caseStudy.attackVector}</div>
                    </div>
                    <div className="p-3 bg-background/50 rounded border border-orange-400/20">
                      <div className="text-xs text-muted-foreground mb-1">Impact</div>
                      <div className="text-sm font-medium text-orange-400">{caseStudy.impact}</div>
                    </div>
                    <div className="p-3 bg-background/50 rounded border border-purple-400/20">
                      <div className="text-xs text-muted-foreground mb-1">Timeline</div>
                      <div className="text-sm font-medium text-purple-400">{caseStudy.timeline}</div>
                    </div>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-bold text-primary mb-3 text-sm">Key Lessons</h4>
                      <ul className="space-y-2">
                        {caseStudy.lessons.map((lesson, index) => (
                          <li key={index} className="text-xs text-muted-foreground flex items-start space-x-2">
                            <Target className="h-3 w-3 mt-0.5 text-yellow-400 flex-shrink-0" />
                            <span>{lesson}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    <div>
                      <h4 className="font-bold text-primary mb-3 text-sm">Prevention Measures</h4>
                      <ul className="space-y-2">
                        {caseStudy.preventionMeasures.map((measure, index) => (
                          <li key={index} className="text-xs text-muted-foreground flex items-start space-x-2">
                            <Shield className="h-3 w-3 mt-0.5 text-green-400 flex-shrink-0" />
                            <span>{measure}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  
                  <div className="mt-6 flex items-center justify-between">
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <Clock className="h-3 w-3" />
                        <span>{caseStudy.readTime}m read</span>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Button size="sm" className="bg-primary hover:bg-primary/80">
                        <BookOpen className="h-3 w-3 mr-1" />
                        Read Full Case
                      </Button>
                      <Button size="sm" variant="outline" className="border-primary/20">
                        <Download className="h-3 w-3 mr-1" />
                        Export PDF
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="community" className="space-y-6">
            {/* Community Stats */}
            <div className="grid md:grid-cols-4 gap-6 mb-8">
              <Card className="p-4 bg-card/50 backdrop-blur-sm border-green-400/20 text-center">
                <Users className="h-8 w-8 text-green-400 mx-auto mb-2 animate-pulse" />
                <div className="text-2xl font-bold text-green-400">12,847</div>
                <div className="text-xs text-muted-foreground">Active Members</div>
              </Card>
              
              <Card className="p-4 bg-card/50 backdrop-blur-sm border-blue-400/20 text-center">
                <MessageSquare className="h-8 w-8 text-blue-400 mx-auto mb-2 animate-pulse" />
                <div className="text-2xl font-bold text-blue-400">3,456</div>
                <div className="text-xs text-muted-foreground">Discussions</div>
              </Card>
              
              <Card className="p-4 bg-card/50 backdrop-blur-sm border-purple-400/20 text-center">
                <Brain className="h-8 w-8 text-purple-400 mx-auto mb-2 animate-pulse" />
                <div className="text-2xl font-bold text-purple-400">89</div>
                <div className="text-xs text-muted-foreground">Expert Contributors</div>
              </Card>
              
              <Card className="p-4 bg-card/50 backdrop-blur-sm border-orange-400/20 text-center">
                <TrendingUp className="h-8 w-8 text-orange-400 mx-auto mb-2 animate-pulse" />
                <div className="text-2xl font-bold text-orange-400">24/7</div>
                <div className="text-xs text-muted-foreground">Active Support</div>
              </Card>
            </div>

            {/* Recent Discussions */}
            <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
              <h3 className="text-xl font-bold text-primary mb-4">Recent Discussions</h3>
              
              <div className="space-y-4">
                <div className="flex items-start space-x-4 p-4 bg-background/50 rounded border border-primary/20">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center">
                    <User className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-primary mb-1">Zero-day in popular framework discovered</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Has anyone analyzed the new CVE-2024-XXXX? Looking for exploitation techniques and mitigation strategies.
                    </p>
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <span>by CyberPhantom</span>
                      <span>2 hours ago</span>
                      <div className="flex items-center space-x-1">
                        <MessageSquare className="h-3 w-3" />
                        <span>23 replies</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4 p-4 bg-background/50 rounded border border-primary/20">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-green-500 to-blue-500 flex items-center justify-center">
                    <User className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-primary mb-1">Quantum cryptography implementation guide</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Sharing my experience implementing post-quantum cryptography in production environments.
                    </p>
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <span>by QuantumHacker</span>
                      <span>5 hours ago</span>
                      <div className="flex items-center space-x-1">
                        <MessageSquare className="h-3 w-3" />
                        <span>45 replies</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-start space-x-4 p-4 bg-background/50 rounded border border-primary/20">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-red-500 to-orange-500 flex items-center justify-center">
                    <User className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-primary mb-1">Advanced persistent threat hunting techniques</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Discussion on the latest APT hunting methodologies and tools for enterprise environments.
                    </p>
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <span>by ThreatHunter</span>
                      <span>1 day ago</span>
                      <div className="flex items-center space-x-1">
                        <MessageSquare className="h-3 w-3" />
                        <span>67 replies</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-6">
                <Button className="w-full bg-primary hover:bg-primary/80 neon-border">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Join Community Discussions
                </Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

