import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Trophy, 
  Target, 
  Zap, 
  Crown, 
  Star,
  Medal,
  Award,
  Flame,
  Skull,
  Shield,
  Code,
  Terminal,
  Globe,
  Lock,
  Eye,
  Brain,
  Users,
  Clock,
  CheckCircle,
  Play,
  Pause,
  RotateCcw
} from 'lucide-react';

interface Challenge {
  id: string;
  title: string;
  description: string;
  category: 'web' | 'crypto' | 'forensics' | 'reverse' | 'pwn' | 'misc';
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'elite';
  points: number;
  timeLimit: number; // minutes
  attempts: number;
  maxAttempts: number;
  completed: boolean;
  completionTime?: number;
  hints: string[];
  tags: string[];
  solvers: number;
  successRate: number;
}

interface UserProgress {
  totalPoints: number;
  rank: number;
  level: number;
  completedChallenges: number;
  streakDays: number;
  badges: string[];
  achievements: Achievement[];
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  unlockedAt?: Date;
  progress: number;
  maxProgress: number;
}

interface Leaderboard {
  rank: number;
  username: string;
  points: number;
  level: number;
  completedChallenges: number;
  isCurrentUser?: boolean;
}

export const GamifiedChallenges = () => {
  const [activeTab, setActiveTab] = useState('challenges');
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [userProgress, setUserProgress] = useState<UserProgress | null>(null);
  const [leaderboard, setLeaderboard] = useState<Leaderboard[]>([]);
  const [isAttempting, setIsAttempting] = useState(false);
  const [attemptProgress, setAttemptProgress] = useState(0);

  useEffect(() => {
    // Initialize challenges data
    setChallenges([
      {
        id: 'sql-injection-basic',
        title: 'SQL Injection: The Basics',
        description: 'Exploit a vulnerable login form using SQL injection techniques',
        category: 'web',
        difficulty: 'beginner',
        points: 100,
        timeLimit: 30,
        attempts: 0,
        maxAttempts: 5,
        completed: false,
        hints: [
          'Try using single quotes to break the SQL query',
          'Look for error messages that reveal database structure',
          'Use UNION SELECT to extract data from other tables'
        ],
        tags: ['sql', 'injection', 'web', 'authentication'],
        solvers: 1247,
        successRate: 78.3
      },
      {
        id: 'crypto-rsa-weak',
        title: 'Weak RSA Implementation',
        description: 'Break a poorly implemented RSA encryption scheme',
        category: 'crypto',
        difficulty: 'intermediate',
        points: 250,
        timeLimit: 60,
        attempts: 1,
        maxAttempts: 3,
        completed: false,
        hints: [
          'Check if the public exponent is unusually small',
          'Look for common modulus attacks',
          'Consider factorization of small primes'
        ],
        tags: ['rsa', 'cryptography', 'factorization', 'math'],
        solvers: 456,
        successRate: 45.2
      },
      {
        id: 'forensics-memory-dump',
        title: 'Memory Forensics Investigation',
        description: 'Analyze a memory dump to find evidence of malware infection',
        category: 'forensics',
        difficulty: 'advanced',
        points: 400,
        timeLimit: 120,
        attempts: 0,
        maxAttempts: 2,
        completed: true,
        completionTime: 87,
        hints: [
          'Use volatility framework for memory analysis',
          'Look for suspicious processes and network connections',
          'Check for code injection and rootkit indicators'
        ],
        tags: ['memory', 'forensics', 'malware', 'volatility'],
        solvers: 189,
        successRate: 23.7
      },
      {
        id: 'reverse-malware',
        title: 'Malware Reverse Engineering',
        description: 'Reverse engineer a sophisticated malware sample',
        category: 'reverse',
        difficulty: 'expert',
        points: 600,
        timeLimit: 180,
        attempts: 0,
        maxAttempts: 1,
        completed: false,
        hints: [
          'Start with static analysis using disassemblers',
          'Look for anti-analysis techniques',
          'Use dynamic analysis in a sandboxed environment'
        ],
        tags: ['reverse', 'malware', 'assembly', 'debugging'],
        solvers: 67,
        successRate: 12.4
      },
      {
        id: 'pwn-buffer-overflow',
        title: 'Buffer Overflow Exploitation',
        description: 'Exploit a buffer overflow vulnerability to gain shell access',
        category: 'pwn',
        difficulty: 'elite',
        points: 1000,
        timeLimit: 240,
        attempts: 0,
        maxAttempts: 1,
        completed: false,
        hints: [
          'Identify the exact offset to overwrite return address',
          'Bypass stack canaries and ASLR protections',
          'Craft a reliable ROP chain for exploitation'
        ],
        tags: ['buffer-overflow', 'exploitation', 'rop', 'shellcode'],
        solvers: 23,
        successRate: 4.8
      }
    ]);

    setUserProgress({
      totalPoints: 750,
      rank: 42,
      level: 7,
      completedChallenges: 3,
      streakDays: 12,
      badges: ['First Blood', 'Crypto Master', 'Forensics Expert'],
      achievements: [
        {
          id: 'first-challenge',
          name: 'First Steps',
          description: 'Complete your first challenge',
          icon: <Target className="h-4 w-4" />,
          unlockedAt: new Date(Date.now() - 86400000 * 5),
          progress: 1,
          maxProgress: 1
        },
        {
          id: 'streak-week',
          name: 'Weekly Warrior',
          description: 'Maintain a 7-day solving streak',
          icon: <Flame className="h-4 w-4" />,
          unlockedAt: new Date(Date.now() - 86400000 * 2),
          progress: 7,
          maxProgress: 7
        },
        {
          id: 'crypto-specialist',
          name: 'Crypto Specialist',
          description: 'Complete 5 cryptography challenges',
          icon: <Lock className="h-4 w-4" />,
          progress: 3,
          maxProgress: 5
        }
      ]
    });

    setLeaderboard([
      { rank: 1, username: 'CyberPhantom', points: 15420, level: 25, completedChallenges: 89 },
      { rank: 2, username: 'QuantumHacker', points: 14230, level: 24, completedChallenges: 82 },
      { rank: 3, username: 'NeonGhost', points: 13890, level: 23, completedChallenges: 78 },
      { rank: 4, username: 'ShadowBreaker', points: 12750, level: 22, completedChallenges: 71 },
      { rank: 5, username: 'EliteOperator', points: 11980, level: 21, completedChallenges: 67 },
      { rank: 42, username: 'You', points: 750, level: 7, completedChallenges: 3, isCurrentUser: true }
    ]);
  }, []);

  const startChallenge = async (challenge: Challenge) => {
    setSelectedChallenge(challenge);
    setIsAttempting(true);
    setAttemptProgress(0);

    // Simulate challenge attempt
    const interval = setInterval(() => {
      setAttemptProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsAttempting(false);
          
          // Mock completion
          const success = Math.random() > 0.3;
          if (success) {
            setChallenges(prev => prev.map(c => 
              c.id === challenge.id 
                ? { ...c, completed: true, completionTime: Math.floor(Math.random() * challenge.timeLimit) }
                : c
            ));
            
            if (userProgress) {
              setUserProgress({
                ...userProgress,
                totalPoints: userProgress.totalPoints + challenge.points,
                completedChallenges: userProgress.completedChallenges + 1
              });
            }
          }
          
          return 100;
        }
        return prev + 2;
      });
    }, 100);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'text-green-400 border-green-400/50';
      case 'intermediate': return 'text-yellow-400 border-yellow-400/50';
      case 'advanced': return 'text-orange-400 border-orange-400/50';
      case 'expert': return 'text-red-400 border-red-400/50';
      case 'elite': return 'text-purple-400 border-purple-400/50';
      default: return 'text-blue-400 border-blue-400/50';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'web': return <Globe className="h-4 w-4" />;
      case 'crypto': return <Lock className="h-4 w-4" />;
      case 'forensics': return <Eye className="h-4 w-4" />;
      case 'reverse': return <Code className="h-4 w-4" />;
      case 'pwn': return <Terminal className="h-4 w-4" />;
      case 'misc': return <Brain className="h-4 w-4" />;
      default: return <Target className="h-4 w-4" />;
    }
  };

  const getLevelProgress = (level: number) => {
    const pointsForCurrentLevel = level * 1000;
    const pointsForNextLevel = (level + 1) * 1000;
    const currentLevelPoints = userProgress?.totalPoints || 0;
    const progressInLevel = currentLevelPoints - pointsForCurrentLevel;
    const pointsNeededForNext = pointsForNextLevel - pointsForCurrentLevel;
    return (progressInLevel / pointsNeededForNext) * 100;
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-primary mb-2 glitch" data-text="HACKING CHALLENGES">
          HACKING CHALLENGES
        </h2>
        <p className="text-muted-foreground">
          Gamified cybersecurity training and skill validation
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 bg-card/50 border border-primary/20">
          <TabsTrigger value="challenges" className="data-[state=active]:bg-primary/20">
            <Target className="h-4 w-4 mr-2" />
            Challenges
          </TabsTrigger>
          <TabsTrigger value="progress" className="data-[state=active]:bg-primary/20">
            <Trophy className="h-4 w-4 mr-2" />
            Progress
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="data-[state=active]:bg-primary/20">
            <Crown className="h-4 w-4 mr-2" />
            Leaderboard
          </TabsTrigger>
          <TabsTrigger value="achievements" className="data-[state=active]:bg-primary/20">
            <Award className="h-4 w-4 mr-2" />
            Achievements
          </TabsTrigger>
        </TabsList>

        <TabsContent value="challenges" className="space-y-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {challenges.map((challenge) => (
              <Card
                key={challenge.id}
                className={`p-6 bg-card/50 backdrop-blur-sm border-primary/20 neon-border cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/20 ${
                  challenge.completed ? 'border-green-400/50' : ''
                }`}
                onClick={() => setSelectedChallenge(challenge)}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    {getCategoryIcon(challenge.category)}
                    <Badge variant="outline" className={getDifficultyColor(challenge.difficulty)}>
                      {challenge.difficulty.toUpperCase()}
                    </Badge>
                  </div>
                  {challenge.completed && (
                    <CheckCircle className="h-5 w-5 text-green-400" />
                  )}
                </div>
                
                <h3 className="text-lg font-bold text-primary mb-2">{challenge.title}</h3>
                <p className="text-sm text-muted-foreground mb-4">{challenge.description}</p>
                
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Points:</span>
                    <span className="text-yellow-400 font-bold">{challenge.points}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Time Limit:</span>
                    <span className="text-blue-400">{challenge.timeLimit}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Success Rate:</span>
                    <span className="text-green-400">{challenge.successRate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Solvers:</span>
                    <span className="text-purple-400">{challenge.solvers}</span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-1">
                  {challenge.tags.slice(0, 3).map((tag, index) => (
                    <Badge key={index} variant="outline" className="text-xs text-muted-foreground border-muted-foreground/30">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          {/* Challenge Details Modal */}
          {selectedChallenge && (
            <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-primary mb-2">{selectedChallenge.title}</h3>
                  <p className="text-muted-foreground mb-4">{selectedChallenge.description}</p>
                  
                  <div className="flex items-center space-x-4">
                    <Badge variant="outline" className={getDifficultyColor(selectedChallenge.difficulty)}>
                      {selectedChallenge.difficulty.toUpperCase()}
                    </Badge>
                    <Badge variant="outline" className="text-yellow-400 border-yellow-400/50">
                      {selectedChallenge.points} POINTS
                    </Badge>
                    <Badge variant="outline" className="text-blue-400 border-blue-400/50">
                      {selectedChallenge.timeLimit}M LIMIT
                    </Badge>
                  </div>
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedChallenge(null)}
                  className="text-muted-foreground"
                >
                  ×
                </Button>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-bold text-primary mb-3">Challenge Details</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Category:</span>
                      <span className="text-blue-400">{selectedChallenge.category.toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Attempts:</span>
                      <span className="text-yellow-400">{selectedChallenge.attempts}/{selectedChallenge.maxAttempts}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Success Rate:</span>
                      <span className="text-green-400">{selectedChallenge.successRate}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Solvers:</span>
                      <span className="text-purple-400">{selectedChallenge.solvers}</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-bold text-primary mb-3">Available Hints</h4>
                  <div className="space-y-2">
                    {selectedChallenge.hints.map((hint, index) => (
                      <div key={index} className="p-2 bg-background/50 rounded border border-primary/20 text-xs text-muted-foreground">
                        <span className="text-yellow-400 font-bold">Hint {index + 1}:</span> {hint}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6">
                {!selectedChallenge.completed && selectedChallenge.attempts < selectedChallenge.maxAttempts ? (
                  <Button
                    onClick={() => startChallenge(selectedChallenge)}
                    disabled={isAttempting}
                    className="bg-primary hover:bg-primary/80 neon-border"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    {isAttempting ? 'Attempting...' : 'Start Challenge'}
                  </Button>
                ) : selectedChallenge.completed ? (
                  <div className="flex items-center space-x-4">
                    <Badge className="bg-green-500/20 text-green-400 border-green-400/50">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      COMPLETED
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Solved in {selectedChallenge.completionTime}m
                    </span>
                  </div>
                ) : (
                  <Badge className="bg-red-500/20 text-red-400 border-red-400/50">
                    <Skull className="h-3 w-3 mr-1" />
                    MAX ATTEMPTS REACHED
                  </Badge>
                )}

                {isAttempting && (
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Challenge progress...</span>
                      <span>{Math.round(attemptProgress)}%</span>
                    </div>
                    <Progress value={attemptProgress} className="h-2" />
                  </div>
                )}
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="progress" className="space-y-6">
          {userProgress && (
            <div className="grid md:grid-cols-2 gap-6">
              {/* User Stats */}
              <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
                <h3 className="text-xl font-bold text-primary mb-4">Your Progress</h3>
                
                <div className="text-center mb-6">
                  <div className="relative inline-block">
                    <div className="w-24 h-24 rounded-full border-4 border-primary/20 flex items-center justify-center">
                      <div className="text-2xl font-bold text-primary">{userProgress.level}</div>
                    </div>
                    <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin"></div>
                  </div>
                  <p className="text-muted-foreground mt-2">Level {userProgress.level}</p>
                  <div className="mt-2">
                    <Progress value={getLevelProgress(userProgress.level)} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">
                      {Math.round(getLevelProgress(userProgress.level))}% to next level
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total Points:</span>
                    <span className="text-yellow-400 font-bold">{userProgress.totalPoints.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Global Rank:</span>
                    <span className="text-purple-400 font-bold">#{userProgress.rank}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Challenges Solved:</span>
                    <span className="text-green-400 font-bold">{userProgress.completedChallenges}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Current Streak:</span>
                    <span className="text-orange-400 font-bold">{userProgress.streakDays} days</span>
                  </div>
                </div>
              </Card>

              {/* Badges */}
              <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
                <h3 className="text-xl font-bold text-primary mb-4">Earned Badges</h3>
                
                <div className="space-y-3">
                  {userProgress.badges.map((badge, index) => (
                    <div key={index} className="flex items-center space-x-3 p-3 bg-background/50 rounded border border-yellow-400/20">
                      <Medal className="h-5 w-5 text-yellow-400 animate-pulse" />
                      <span className="font-medium">{badge}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded border border-purple-400/20">
                  <div className="flex items-center space-x-2 mb-2">
                    <Crown className="h-4 w-4 text-purple-400" />
                    <span className="text-sm font-bold text-purple-400">Next Badge: Elite Hacker</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Complete 5 expert-level challenges to unlock this prestigious badge.
                  </p>
                  <Progress value={20} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">1/5 challenges completed</p>
                </div>
              </Card>
            </div>
          )}

          {/* Achievements */}
          {userProgress && (
            <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
              <h3 className="text-xl font-bold text-primary mb-4">Achievements</h3>
              
              <div className="grid md:grid-cols-3 gap-4">
                {userProgress.achievements.map((achievement) => (
                  <Card key={achievement.id} className={`p-4 border ${
                    achievement.unlockedAt ? 'border-green-400/50 bg-green-500/10' : 'border-gray-400/50 bg-gray-500/10'
                  }`}>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className={achievement.unlockedAt ? 'text-green-400' : 'text-gray-400'}>
                        {achievement.icon}
                      </div>
                      <div>
                        <h4 className="font-bold text-primary text-sm">{achievement.name}</h4>
                        <p className="text-xs text-muted-foreground">{achievement.description}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span>Progress</span>
                        <span>{achievement.progress}/{achievement.maxProgress}</span>
                      </div>
                      <Progress value={(achievement.progress / achievement.maxProgress) * 100} className="h-1" />
                    </div>
                    
                    {achievement.unlockedAt && (
                      <div className="text-xs text-green-400 mt-2">
                        Unlocked {achievement.unlockedAt.toLocaleDateString()}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="leaderboard" className="space-y-6">
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
            <h3 className="text-xl font-bold text-primary mb-4 flex items-center">
              <Crown className="h-5 w-5 mr-2" />
              Global Leaderboard
            </h3>
            
            <div className="space-y-2">
              {leaderboard.map((entry) => (
                <div
                  key={entry.rank}
                  className={`flex items-center space-x-4 p-4 rounded border transition-all duration-300 ${
                    entry.isCurrentUser 
                      ? 'border-primary bg-primary/10 neon-border' 
                      : 'border-primary/20 bg-background/30'
                  }`}
                >
                  <div className="flex-shrink-0 w-8 text-center">
                    {entry.rank <= 3 ? (
                      <Crown className={`h-5 w-5 mx-auto ${
                        entry.rank === 1 ? 'text-yellow-400' :
                        entry.rank === 2 ? 'text-gray-300' :
                        'text-orange-400'
                      }`} />
                    ) : (
                      <span className="text-muted-foreground font-bold">#{entry.rank}</span>
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <div className="font-bold text-primary">{entry.username}</div>
                    <div className="text-xs text-muted-foreground">
                      Level {entry.level} • {entry.completedChallenges} challenges
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-lg font-bold text-yellow-400">
                      {entry.points.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">points</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="achievements" className="space-y-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Sample achievements */}
            <Card className="p-6 bg-card/50 backdrop-blur-sm border-green-400/20 neon-border">
              <div className="text-center">
                <Trophy className="h-12 w-12 text-yellow-400 mx-auto mb-3 animate-pulse" />
                <h3 className="font-bold text-primary mb-2">Challenge Master</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Complete 50 challenges across all categories
                </p>
                <Progress value={60} className="h-2 mb-2" />
                <p className="text-xs text-muted-foreground">30/50 completed</p>
              </div>
            </Card>
            
            <Card className="p-6 bg-card/50 backdrop-blur-sm border-purple-400/20 neon-border">
              <div className="text-center">
                <Flame className="h-12 w-12 text-orange-400 mx-auto mb-3 animate-pulse" />
                <h3 className="font-bold text-primary mb-2">Streak Legend</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Maintain a 30-day solving streak
                </p>
                <Progress value={40} className="h-2 mb-2" />
                <p className="text-xs text-muted-foreground">12/30 days</p>
              </div>
            </Card>
            
            <Card className="p-6 bg-card/50 backdrop-blur-sm border-blue-400/20 neon-border">
              <div className="text-center">
                <Brain className="h-12 w-12 text-blue-400 mx-auto mb-3 animate-pulse" />
                <h3 className="font-bold text-primary mb-2">AI Collaborator</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Use AI assistant to solve 10 challenges
                </p>
                <Progress value={30} className="h-2 mb-2" />
                <p className="text-xs text-muted-foreground">3/10 completed</p>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

