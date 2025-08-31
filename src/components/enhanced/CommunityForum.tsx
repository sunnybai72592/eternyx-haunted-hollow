import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  MessageSquare, 
  Users, 
  Pin, 
  Star,
  ThumbsUp,
  ThumbsDown,
  Reply,
  Flag,
  Search,
  Filter,
  Plus,
  Eye,
  Clock,
  Crown,
  Shield,
  Zap,
  Target,
  Brain,
  Code,
  Lock,
  Globe,
  User,
  MoreVertical,
  Edit,
  Trash,
  Share
} from 'lucide-react';

interface ForumPost {
  id: string;
  title: string;
  content: string;
  author: {
    id: string;
    username: string;
    avatar?: string;
    reputation: number;
    tier: 'free' | 'premium' | 'elite';
    badges: string[];
  };
  category: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  views: number;
  replies: number;
  likes: number;
  dislikes: number;
  isPinned: boolean;
  isLocked: boolean;
  isSolved: boolean;
}

interface ForumReply {
  id: string;
  postId: string;
  content: string;
  author: {
    id: string;
    username: string;
    avatar?: string;
    reputation: number;
    tier: 'free' | 'premium' | 'elite';
    badges: string[];
  };
  createdAt: Date;
  updatedAt: Date;
  likes: number;
  dislikes: number;
  isAccepted: boolean;
}

interface ForumCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  postCount: number;
  color: string;
  requiredTier?: 'free' | 'premium' | 'elite';
}

export const CommunityForum = () => {
  const [activeTab, setActiveTab] = useState('discussions');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [newPost, setNewPost] = useState({ title: '', content: '', category: '', tags: '' });

  useEffect(() => {
    // Initialize forum categories
    setCategories([
      {
        id: 'general',
        name: 'General Discussion',
        description: 'General cybersecurity topics and discussions',
        icon: <MessageSquare className="h-5 w-5" />,
        postCount: 1247,
        color: 'text-blue-400 border-blue-400/50'
      },
      {
        id: 'vulnerabilities',
        name: 'Vulnerability Research',
        description: 'Zero-days, CVEs, and vulnerability analysis',
        icon: <Target className="h-5 w-5" />,
        postCount: 856,
        color: 'text-red-400 border-red-400/50'
      },
      {
        id: 'tools',
        name: 'Tools & Techniques',
        description: 'Security tools, scripts, and methodologies',
        icon: <Code className="h-5 w-5" />,
        postCount: 634,
        color: 'text-green-400 border-green-400/50'
      },
      {
        id: 'cryptography',
        name: 'Cryptography',
        description: 'Encryption, hashing, and cryptographic protocols',
        icon: <Lock className="h-5 w-5" />,
        postCount: 423,
        color: 'text-purple-400 border-purple-400/50'
      },
      {
        id: 'threat-intel',
        name: 'Threat Intelligence',
        description: 'APTs, malware analysis, and threat hunting',
        icon: <Brain className="h-5 w-5" />,
        postCount: 789,
        color: 'text-orange-400 border-orange-400/50',
        requiredTier: 'premium'
      },
      {
        id: 'elite-lounge',
        name: 'Elite Lounge',
        description: 'Exclusive discussions for elite members',
        icon: <Crown className="h-5 w-5" />,
        postCount: 156,
        color: 'text-yellow-400 border-yellow-400/50',
        requiredTier: 'elite'
      }
    ]);

    // Initialize forum posts
    setPosts([
      {
        id: '1',
        title: 'New zero-day in popular web framework - CVE-2024-XXXX',
        content: 'Discovered a critical RCE vulnerability in the latest version of [Framework]. The vulnerability allows unauthenticated remote code execution through a deserialization flaw...',
        author: {
          id: '1',
          username: 'CyberPhantom',
          reputation: 15420,
          tier: 'elite',
          badges: ['Bug Hunter', 'Elite Researcher', 'CVE Author']
        },
        category: 'vulnerabilities',
        tags: ['zero-day', 'rce', 'web', 'critical'],
        createdAt: new Date(Date.now() - 3600000),
        updatedAt: new Date(Date.now() - 3600000),
        views: 2847,
        replies: 23,
        likes: 156,
        dislikes: 3,
        isPinned: true,
        isLocked: false,
        isSolved: false
      },
      {
        id: '2',
        title: 'Quantum-resistant cryptography implementation guide',
        content: 'After months of research and testing, I\'ve successfully implemented post-quantum cryptography in a production environment. Here\'s what I learned...',
        author: {
          id: '2',
          username: 'QuantumHacker',
          reputation: 12340,
          tier: 'elite',
          badges: ['Crypto Expert', 'Elite Member', 'Tutorial Master']
        },
        category: 'cryptography',
        tags: ['quantum', 'cryptography', 'implementation', 'guide'],
        createdAt: new Date(Date.now() - 7200000),
        updatedAt: new Date(Date.now() - 7200000),
        views: 1923,
        replies: 45,
        likes: 234,
        dislikes: 8,
        isPinned: false,
        isLocked: false,
        isSolved: true
      },
      {
        id: '3',
        title: 'Advanced APT hunting techniques using machine learning',
        content: 'Sharing my experience building ML models for APT detection. The approach combines behavioral analysis with network traffic patterns...',
        author: {
          id: '3',
          username: 'ThreatHunter',
          reputation: 8750,
          tier: 'premium',
          badges: ['Threat Hunter', 'ML Expert', 'Premium Member']
        },
        category: 'threat-intel',
        tags: ['apt', 'machine-learning', 'threat-hunting', 'detection'],
        createdAt: new Date(Date.now() - 86400000),
        updatedAt: new Date(Date.now() - 86400000),
        views: 1456,
        replies: 67,
        likes: 189,
        dislikes: 12,
        isPinned: false,
        isLocked: false,
        isSolved: false
      }
    ]);
  }, []);

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'free': return 'text-blue-400 border-blue-400/50';
      case 'premium': return 'text-purple-400 border-purple-400/50';
      case 'elite': return 'text-orange-400 border-orange-400/50';
      default: return 'text-gray-400 border-gray-400/50';
    }
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'free': return <User className="h-3 w-3" />;
      case 'premium': return <Shield className="h-3 w-3" />;
      case 'elite': return <Crown className="h-3 w-3" />;
      default: return <User className="h-3 w-3" />;
    }
  };

  const filteredPosts = posts.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         post.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         post.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || post.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleCreatePost = () => {
    if (!newPost.title || !newPost.content) return;

    const post: ForumPost = {
      id: Date.now().toString(),
      title: newPost.title,
      content: newPost.content,
      author: {
        id: 'current-user',
        username: 'You',
        reputation: 750,
        tier: 'premium',
        badges: ['New Member']
      },
      category: newPost.category || 'general',
      tags: newPost.tags.split(',').map(tag => tag.trim()).filter(Boolean),
      createdAt: new Date(),
      updatedAt: new Date(),
      views: 0,
      replies: 0,
      likes: 0,
      dislikes: 0,
      isPinned: false,
      isLocked: false,
      isSolved: false
    };

    setPosts([post, ...posts]);
    setNewPost({ title: '', content: '', category: '', tags: '' });
    setIsCreatingPost(false);
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-primary mb-2 glitch" data-text="COMMUNITY FORUM">
              COMMUNITY FORUM
            </h2>
            <p className="text-muted-foreground">
              Connect with elite hackers and security researchers
            </p>
          </div>
          <Button
            onClick={() => setIsCreatingPost(true)}
            className="bg-primary hover:bg-primary/80 neon-border"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Discussion
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 bg-card/50 border border-primary/20">
          <TabsTrigger value="discussions" className="data-[state=active]:bg-primary/20">
            <MessageSquare className="h-4 w-4 mr-2" />
            Discussions
          </TabsTrigger>
          <TabsTrigger value="categories" className="data-[state=active]:bg-primary/20">
            <Filter className="h-4 w-4 mr-2" />
            Categories
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="data-[state=active]:bg-primary/20">
            <Crown className="h-4 w-4 mr-2" />
            Leaderboard
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discussions" className="space-y-6">
          {/* Search and Filters */}
          <div className="flex space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search discussions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-card/50 border-primary/20"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 bg-card/50 border border-primary/20 rounded text-sm"
            >
              <option value="all">All Categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {/* Create Post Modal */}
          {isCreatingPost && (
            <Card className="p-6 bg-card/50 backdrop-blur-sm border-primary/20 neon-border">
              <h3 className="text-xl font-bold text-primary mb-4">Create New Discussion</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-primary mb-2 block">Title</label>
                  <Input
                    placeholder="Enter discussion title..."
                    value={newPost.title}
                    onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                    className="bg-background/50 border-primary/20"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-primary mb-2 block">Category</label>
                  <select
                    value={newPost.category}
                    onChange={(e) => setNewPost({ ...newPost, category: e.target.value })}
                    className="w-full px-3 py-2 bg-background/50 border border-primary/20 rounded text-sm"
                  >
                    <option value="">Select category...</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-primary mb-2 block">Content</label>
                  <Textarea
                    placeholder="Write your discussion content..."
                    value={newPost.content}
                    onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                    className="min-h-32 bg-background/50 border-primary/20"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-primary mb-2 block">Tags (comma-separated)</label>
                  <Input
                    placeholder="vulnerability, zero-day, web..."
                    value={newPost.tags}
                    onChange={(e) => setNewPost({ ...newPost, tags: e.target.value })}
                    className="bg-background/50 border-primary/20"
                  />
                </div>
                
                <div className="flex space-x-2">
                  <Button
                    onClick={handleCreatePost}
                    className="bg-primary hover:bg-primary/80"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Create Discussion
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsCreatingPost(false)}
                    className="border-primary/20"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Forum Posts */}
          <div className="space-y-4">
            {filteredPosts.map((post) => (
              <Card key={post.id} className="p-6 bg-card/50 backdrop-blur-sm border-primary/20 neon-border hover:scale-[1.02] transition-all duration-300">
                <div className="flex items-start space-x-4">
                  {/* Author Avatar */}
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center">
                      <User className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  
                  {/* Post Content */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        {post.isPinned && <Pin className="h-4 w-4 text-yellow-400" />}
                        {post.isSolved && <Star className="h-4 w-4 text-green-400" />}
                        <h3 className="text-lg font-bold text-primary">{post.title}</h3>
                      </div>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <p className="text-muted-foreground mb-3 line-clamp-2">{post.content}</p>
                    
                    {/* Tags */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {post.tags.map((tag, index) => (
                        <Badge key={index} variant="outline" className="text-xs text-blue-400 border-blue-400/30">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    
                    {/* Author Info */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline" className={getTierColor(post.author.tier)}>
                            {getTierIcon(post.author.tier)}
                            <span className="ml-1">{post.author.username}</span>
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {post.author.reputation.toLocaleString()} rep
                          </span>
                        </div>
                        
                        <div className="flex space-x-1">
                          {post.author.badges.slice(0, 2).map((badge, index) => (
                            <Badge key={index} variant="outline" className="text-xs text-yellow-400 border-yellow-400/30">
                              {badge}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                        <div className="flex items-center space-x-1">
                          <Eye className="h-3 w-3" />
                          <span>{post.views}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <MessageSquare className="h-3 w-3" />
                          <span>{post.replies}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <ThumbsUp className="h-3 w-3" />
                          <span>{post.likes}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>{post.createdAt.toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex space-x-2">
                    <Button size="sm" variant="outline" className="border-green-400/50 text-green-400">
                      <ThumbsUp className="h-3 w-3 mr-1" />
                      Like
                    </Button>
                    <Button size="sm" variant="outline" className="border-blue-400/50 text-blue-400">
                      <Reply className="h-3 w-3 mr-1" />
                      Reply
                    </Button>
                    <Button size="sm" variant="outline" className="border-purple-400/50 text-purple-400">
                      <Share className="h-3 w-3 mr-1" />
                      Share
                    </Button>
                  </div>
                  
                  <div className="flex space-x-2">
                    <Button size="sm" variant="ghost" className="text-muted-foreground">
                      <Flag className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="categories" className="space-y-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((category) => (
              <Card key={category.id} className="p-6 bg-card/50 backdrop-blur-sm border-primary/20 neon-border hover:scale-105 transition-all duration-300 cursor-pointer">
                <div className="flex items-center space-x-3 mb-4">
                  <div className={category.color.split(' ')[0]}>
                    {category.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-primary">{category.name}</h3>
                    {category.requiredTier && (
                      <Badge variant="outline" className={getTierColor(category.requiredTier)}>
                        {category.requiredTier.toUpperCase()} ONLY
                      </Badge>
                    )}
                  </div>
                </div>
                
                <p className="text-sm text-muted-foreground mb-4">{category.description}</p>
                
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-primary font-bold">{category.postCount}</span>
                    <span className="text-muted-foreground"> discussions</span>
                  </div>
                  <Button size="sm" variant="outline" className={category.color}>
                    Browse
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="leaderboard" className="space-y-6">
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
            <h3 className="text-xl font-bold text-primary mb-4 flex items-center">
              <Crown className="h-5 w-5 mr-2" />
              Top Contributors
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center space-x-4 p-4 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 rounded border border-yellow-400/20">
                <div className="flex-shrink-0">
                  <Crown className="h-8 w-8 text-yellow-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-bold text-primary">CyberPhantom</span>
                    <Badge variant="outline" className="text-orange-400 border-orange-400/50">
                      <Crown className="h-3 w-3 mr-1" />
                      ELITE
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    15,420 reputation • 89 posts • 234 solutions
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-yellow-400">#1</div>
                </div>
              </div>
              
              <div className="flex items-center space-x-4 p-4 bg-background/50 rounded border border-primary/20">
                <div className="flex-shrink-0">
                  <Shield className="h-8 w-8 text-gray-300" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-bold text-primary">QuantumHacker</span>
                    <Badge variant="outline" className="text-orange-400 border-orange-400/50">
                      <Crown className="h-3 w-3 mr-1" />
                      ELITE
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    12,340 reputation • 67 posts • 189 solutions
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-300">#2</div>
                </div>
              </div>
              
              <div className="flex items-center space-x-4 p-4 bg-background/50 rounded border border-primary/20">
                <div className="flex-shrink-0">
                  <Target className="h-8 w-8 text-orange-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-bold text-primary">ThreatHunter</span>
                    <Badge variant="outline" className="text-purple-400 border-purple-400/50">
                      <Shield className="h-3 w-3 mr-1" />
                      PREMIUM
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    8,750 reputation • 45 posts • 123 solutions
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-orange-400">#3</div>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

