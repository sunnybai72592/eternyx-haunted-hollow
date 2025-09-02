import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Trophy, Target, Zap, Star, Award, Crown, Gamepad2, 
  Shield, Lock, Eye, Brain, Crosshair, Flag, Timer,
  Users, TrendingUp, Medal, Gift, CheckCircle
} from 'lucide-react';

interface Challenge {
  id: string;
  title: string;
  description: string;
  category: 'web-security' | 'network' | 'cryptography' | 'forensics' | 'reverse-engineering';
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  points: number;
  timeLimit: string;
  participants: number;
  completed: boolean;
  locked: boolean;
  prerequisites?: string[];
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  unlocked: boolean;
  progress: number;
  maxProgress: number;
}

interface LeaderboardEntry {
  rank: number;
  username: string;
  points: number;
  challengesCompleted: number;
  streak: number;
}

const GamifiedChallenges: React.FC = () => {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userStats, setUserStats] = useState({
    totalPoints: 1250,
    rank: 42,
    challengesCompleted: 15,
    currentStreak: 7,
    level: 8
  });
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Simulate loading data
    setTimeout(() => {
      setChallenges([
        {
          id: '1',
          title: 'SQL Injection Master',
          description: 'Exploit SQL injection vulnerabilities in a simulated e-commerce application',
          category: 'web-security',
          difficulty: 'intermediate',
          points: 150,
          timeLimit: '45 minutes',
          participants: 234,
          completed: true,
          locked: false
        },
        {
          id: '2',
          title: 'Network Reconnaissance',
          description: 'Perform network discovery and enumeration on a target network',
          category: 'network',
          difficulty: 'beginner',
          points: 100,
          timeLimit: '30 minutes',
          participants: 567,
          completed: true,
          locked: false
        },
        {
          id: '3',
          title: 'Cryptographic Cipher Break',
          description: 'Decrypt a series of encrypted messages using various cryptographic techniques',
          category: 'cryptography',
          difficulty: 'advanced',
          points: 300,
          timeLimit: '90 minutes',
          participants: 89,
          completed: false,
          locked: false
        },
        {
          id: '4',
          title: 'Digital Forensics Investigation',
          description: 'Analyze digital evidence to solve a cybercrime case',
          category: 'forensics',
          difficulty: 'expert',
          points: 500,
          timeLimit: '120 minutes',
          participants: 45,
          completed: false,
          locked: false
        },
        {
          id: '5',
          title: 'Malware Reverse Engineering',
          description: 'Analyze and reverse engineer a malware sample to understand its behavior',
          category: 'reverse-engineering',
          difficulty: 'expert',
          points: 450,
          timeLimit: '150 minutes',
          participants: 23,
          completed: false,
          locked: true,
          prerequisites: ['3', '4']
        }
      ]);

      setAchievements([
        {
          id: '1',
          name: 'First Blood',
          description: 'Complete your first challenge',
          icon: React.createElement(Target),
          unlocked: true,
          progress: 1,
          maxProgress: 1
        },
        {
          id: '2',
          name: 'Web Warrior',
          description: 'Complete 5 web security challenges',
          icon: React.createElement(Shield),
          unlocked: true,
          progress: 5,
          maxProgress: 5
        },
        {
          id: '3',
          name: 'Speed Demon',
          description: 'Complete a challenge in under 10 minutes',
          icon: React.createElement(Zap),
          unlocked: false,
          progress: 0,
          maxProgress: 1
        },
        {
          id: '4',
          name: 'Crypto Master',
          description: 'Complete 3 cryptography challenges',
          icon: React.createElement(Lock),
          unlocked: false,
          progress: 1,
          maxProgress: 3
        },
        {
          id: '5',
          name: 'Elite Hacker',
          description: 'Reach the top 10 on the leaderboard',
          icon: React.createElement(Crown),
          unlocked: false,
          progress: 42,
          maxProgress: 10
        }
      ]);

      setLeaderboard([
        { rank: 1, username: 'CyberNinja', points: 2850, challengesCompleted: 28, streak: 15 },
        { rank: 2, username: 'H4ckM4st3r', points: 2720, challengesCompleted: 25, streak: 12 },
        { rank: 3, username: 'SecurityGuru', points: 2650, challengesCompleted: 24, streak: 8 },
        { rank: 4, username: 'EthicalHacker', points: 2480, challengesCompleted: 22, streak: 10 },
        { rank: 5, username: 'PentestPro', points: 2350, challengesCompleted: 21, streak: 6 },
        { rank: 42, username: 'You', points: 1250, challengesCompleted: 15, streak: 7 }
      ]);

      setIsLoading(false);
    }, 1500);
  }, []);

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'bg-green-500';
      case 'intermediate': return 'bg-yellow-500';
      case 'advanced': return 'bg-orange-500';
      case 'expert': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'web-security': return <Shield className="w-4 h-4" />;
      case 'network': return <Eye className="w-4 h-4" />;
      case 'cryptography': return <Lock className="w-4 h-4" />;
      case 'forensics': return <Target className="w-4 h-4" />;
      case 'reverse-engineering': return <Brain className="w-4 h-4" />;
      default: return <Gamepad2 className="w-4 h-4" />;
    }
  };

  const startChallenge = (challenge: Challenge) => {
    if (challenge.locked) {
      toast({
        title: "Challenge Locked",
        description: "Complete prerequisite challenges to unlock this challenge.",
      });
      return;
    }

    setSelectedChallenge(challenge);
    toast({
      title: "Challenge Started",
      description: `Starting ${challenge.title}. Good luck!`,
    });
  };

  const getLevelProgress = () => {
    const pointsForCurrentLevel = (userStats.level - 1) * 200;
    const pointsForNextLevel = userStats.level * 200;
    const progress = ((userStats.totalPoints - pointsForCurrentLevel) / (pointsForNextLevel - pointsForCurrentLevel)) * 100;
    return Math.min(progress, 100);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Gamepad2 className="w-8 h-8 animate-bounce text-green-400 mx-auto mb-4" />
          <p className="text-green-400">Loading Challenges...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* User Stats Header */}
      <Card className="bg-black/40 border-green-500/30 hover-glow">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-green-400">
            <Trophy className="w-6 h-6" />
            Gamified Security Challenges
          </CardTitle>
          <p className="text-gray-300 text-sm">
            Master cybersecurity through hands-on challenges and compete with ethical hackers worldwide
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">{userStats.totalPoints}</div>
              <div className="text-sm text-gray-300">Total Points</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">#{userStats.rank}</div>
              <div className="text-sm text-gray-300">Global Rank</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">{userStats.challengesCompleted}</div>
              <div className="text-sm text-gray-300">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-400">{userStats.currentStreak}</div>
              <div className="text-sm text-gray-300">Day Streak</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-400">Level {userStats.level}</div>
              <div className="text-sm text-gray-300">
                <Progress value={getLevelProgress()} className="h-1 mt-1" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs defaultValue="challenges" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 bg-black/40 border border-green-500/30">
          <TabsTrigger value="challenges" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400">
            <Target className="w-4 h-4 mr-2" />
            Challenges
          </TabsTrigger>
          <TabsTrigger value="achievements" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400">
            <Award className="w-4 h-4 mr-2" />
            Achievements
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400">
            <Trophy className="w-4 h-4 mr-2" />
            Leaderboard
          </TabsTrigger>
        </TabsList>

        {/* Challenges Tab */}
        <TabsContent value="challenges" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {challenges.map((challenge) => (
              <Card 
                key={challenge.id} 
                className={`bg-black/40 border-green-500/30 hover-glow ${challenge.locked ? 'opacity-50' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(challenge.category)}
                      <h3 className="font-semibold text-green-100">{challenge.title}</h3>
                      {challenge.completed && <CheckCircle className="w-4 h-4 text-green-400" />}
                      {challenge.locked && <Lock className="w-4 h-4 text-gray-400" />}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`${getDifficultyColor(challenge.difficulty)} text-white text-xs`}>
                        {challenge.difficulty.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="text-xs border-green-500/30 text-green-400">
                        {challenge.points} pts
                      </Badge>
                    </div>
                  </div>
                  
                  <p className="text-gray-300 text-sm mb-4">{challenge.description}</p>
                  
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-4">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <Timer className="w-3 h-3" />
                        {challenge.timeLimit}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {challenge.participants} participants
                      </span>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={() => startChallenge(challenge)}
                    disabled={challenge.locked}
                    className={`w-full ${challenge.completed ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'} text-white font-semibold`}
                  >
                    {challenge.completed ? 'Completed' : challenge.locked ? 'Locked' : 'Start Challenge'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Achievements Tab */}
        <TabsContent value="achievements" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {achievements.map((achievement) => (
              <Card 
                key={achievement.id} 
                className={`bg-black/40 border-green-500/30 hover-glow ${achievement.unlocked ? 'border-yellow-500/50' : ''}`}
              >
                <CardContent className="p-4 text-center">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${
                    achievement.unlocked ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {achievement.icon}
                  </div>
                  
                  <h3 className={`font-semibold mb-2 ${achievement.unlocked ? 'text-yellow-400' : 'text-gray-400'}`}>
                    {achievement.name}
                  </h3>
                  
                  <p className="text-gray-300 text-sm mb-3">{achievement.description}</p>
                  
                  <div className="space-y-2">
                    <Progress 
                      value={(achievement.progress / achievement.maxProgress) * 100} 
                      className="h-2" 
                    />
                    <p className="text-xs text-gray-400">
                      {achievement.progress}/{achievement.maxProgress}
                    </p>
                  </div>
                  
                  {achievement.unlocked && (
                    <Badge className="bg-yellow-500 text-black text-xs mt-2">
                      UNLOCKED
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard" className="space-y-4">
          <Card className="bg-black/40 border-green-500/30 hover-glow">
            <CardHeader>
              <CardTitle className="text-green-400 flex items-center gap-2">
                <Trophy className="w-5 h-5" />
                Global Leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {leaderboard.map((entry) => (
                  <div 
                    key={entry.rank}
                    className={`flex items-center justify-between p-3 border rounded-lg ${
                      entry.username === 'You' 
                        ? 'border-green-500/50 bg-green-500/10' 
                        : 'border-green-500/20 bg-black/20'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                        entry.rank <= 3 ? 'bg-yellow-500 text-black' : 'bg-gray-500/20 text-gray-300'
                      }`}>
                        {entry.rank <= 3 ? <Crown className="w-4 h-4" /> : entry.rank}
                      </div>
                      <div>
                        <div className={`font-semibold ${entry.username === 'You' ? 'text-green-400' : 'text-green-100'}`}>
                          {entry.username}
                        </div>
                        <div className="text-sm text-gray-400">
                          {entry.challengesCompleted} challenges • {entry.streak} day streak
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-green-400">{entry.points}</div>
                      <div className="text-sm text-gray-400">points</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GamifiedChallenges;

