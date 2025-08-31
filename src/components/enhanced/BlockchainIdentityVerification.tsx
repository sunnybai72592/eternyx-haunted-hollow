import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, 
  Fingerprint, 
  Key, 
  CheckCircle, 
  XCircle,
  Clock,
  Zap,
  Link,
  QrCode,
  Wallet,
  Eye,
  Copy,
  RefreshCw,
  AlertTriangle,
  Diamond
} from 'lucide-react';

interface BlockchainIdentity {
  id: string;
  walletAddress: string;
  verificationLevel: 'unverified' | 'basic' | 'enhanced' | 'elite';
  reputation: number;
  transactionCount: number;
  lastActivity: Date;
  verificationBadges: string[];
}

interface VerificationStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  required: boolean;
}

export const BlockchainIdentityVerification = () => {
  const [activeTab, setActiveTab] = useState('identity');
  const [walletAddress, setWalletAddress] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionProgress, setConnectionProgress] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationProgress, setVerificationProgress] = useState(0);

  const [identity, setIdentity] = useState<BlockchainIdentity | null>(null);
  const [verificationSteps, setVerificationSteps] = useState<VerificationStep[]>([
    {
      id: 'wallet-connection',
      name: 'Wallet Connection',
      description: 'Connect your Web3 wallet to the ETERNYX network',
      status: 'pending',
      required: true
    },
    {
      id: 'signature-verification',
      name: 'Digital Signature',
      description: 'Sign a verification message with your private key',
      status: 'pending',
      required: true
    },
    {
      id: 'reputation-check',
      name: 'Reputation Analysis',
      description: 'Analyze on-chain activity and reputation metrics',
      status: 'pending',
      required: false
    },
    {
      id: 'kyc-verification',
      name: 'Identity Verification',
      description: 'Optional enhanced verification for premium features',
      status: 'pending',
      required: false
    }
  ]);

  const connectWallet = async () => {
    setIsConnecting(true);
    setConnectionProgress(0);

    // Simulate wallet connection process
    const interval = setInterval(() => {
      setConnectionProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsConnecting(false);
          
          // Mock successful connection
          const mockIdentity: BlockchainIdentity = {
            id: 'blockchain-user-1',
            walletAddress: '0x742d35Cc6634C0532925a3b8D4C2C4e4C4e4C4e4',
            verificationLevel: 'basic',
            reputation: 847,
            transactionCount: 156,
            lastActivity: new Date(),
            verificationBadges: ['Early Adopter', 'Security Researcher', 'Bug Bounty Hunter']
          };
          setIdentity(mockIdentity);
          setWalletAddress(mockIdentity.walletAddress);
          
          // Update verification steps
          setVerificationSteps(prev => prev.map(step => 
            step.id === 'wallet-connection' 
              ? { ...step, status: 'completed' }
              : step
          ));
          
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  const startVerification = async () => {
    setIsVerifying(true);
    setVerificationProgress(0);

    // Simulate verification process
    const interval = setInterval(() => {
      setVerificationProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsVerifying(false);
          
          // Update verification steps
          setVerificationSteps(prev => prev.map(step => ({
            ...step,
            status: step.required ? 'completed' : 'completed'
          })));
          
          // Update identity verification level
          if (identity) {
            setIdentity({
              ...identity,
              verificationLevel: 'enhanced',
              verificationBadges: [...identity.verificationBadges, 'Verified Elite']
            });
          }
          
          return 100;
        }
        return prev + 3;
      });
    }, 150);
  };

  const getVerificationLevelColor = (level: string) => {
    switch (level) {
      case 'unverified': return 'text-red-400 border-red-400/50';
      case 'basic': return 'text-yellow-400 border-yellow-400/50';
      case 'enhanced': return 'text-blue-400 border-blue-400/50';
      case 'elite': return 'text-purple-400 border-purple-400/50';
      default: return 'text-gray-400 border-gray-400/50';
    }
  };

  const getStepStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-400" />;
      case 'in-progress': return <RefreshCw className="h-4 w-4 text-blue-400 animate-spin" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-primary mb-2 glitch" data-text="BLOCKCHAIN IDENTITY">
          BLOCKCHAIN IDENTITY
        </h2>
        <p className="text-muted-foreground">
          Decentralized identity verification for the digital underground
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 bg-card/50 border border-primary/20">
          <TabsTrigger value="identity" className="data-[state=active]:bg-primary/20">
            <Fingerprint className="h-4 w-4 mr-2" />
            Identity
          </TabsTrigger>
          <TabsTrigger value="verification" className="data-[state=active]:bg-primary/20">
            <Shield className="h-4 w-4 mr-2" />
            Verification
          </TabsTrigger>
          <TabsTrigger value="reputation" className="data-[state=active]:bg-primary/20">
            <Diamond className="h-4 w-4 mr-2" />
            Reputation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="identity" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Wallet Connection */}
            <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
              <h3 className="text-xl font-bold text-primary mb-4">Wallet Connection</h3>
              
              {!identity ? (
                <div className="space-y-4">
                  <div className="text-center py-8">
                    <Wallet className="h-16 w-16 text-primary mx-auto mb-4 animate-pulse" />
                    <p className="text-muted-foreground mb-4">
                      Connect your Web3 wallet to access blockchain features
                    </p>
                  </div>

                  <div className="space-y-3">
                    <Button
                      onClick={connectWallet}
                      disabled={isConnecting}
                      className="w-full bg-primary hover:bg-primary/80 neon-border"
                    >
                      <Wallet className="h-4 w-4 mr-2" />
                      {isConnecting ? 'Connecting...' : 'Connect MetaMask'}
                    </Button>
                    
                    <Button variant="outline" className="w-full border-blue-400/50 text-blue-400">
                      <QrCode className="h-4 w-4 mr-2" />
                      WalletConnect
                    </Button>
                    
                    <Button variant="outline" className="w-full border-purple-400/50 text-purple-400">
                      <Link className="h-4 w-4 mr-2" />
                      Coinbase Wallet
                    </Button>
                  </div>

                  {isConnecting && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Establishing connection...</span>
                        <span>{connectionProgress}%</span>
                      </div>
                      <Progress value={connectionProgress} className="h-2" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Wallet Address:</span>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs">{identity.walletAddress.slice(0, 6)}...{identity.walletAddress.slice(-4)}</span>
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(identity.walletAddress)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Verification Level:</span>
                    <Badge variant="outline" className={getVerificationLevelColor(identity.verificationLevel)}>
                      {identity.verificationLevel.toUpperCase()}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Reputation Score:</span>
                    <span className="font-bold text-primary">{identity.reputation}/1000</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Transactions:</span>
                    <span className="text-blue-400">{identity.transactionCount}</span>
                  </div>
                </div>
              )}
            </Card>

            {/* Verification Badges */}
            {identity && (
              <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
                <h3 className="text-xl font-bold text-primary mb-4">Verification Badges</h3>
                
                <div className="space-y-3">
                  {identity.verificationBadges.map((badge, index) => (
                    <div key={index} className="flex items-center space-x-3 p-3 bg-background/50 rounded border border-primary/20">
                      <Diamond className="h-5 w-5 text-yellow-400 animate-pulse" />
                      <span className="font-medium">{badge}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded border border-purple-400/20">
                  <div className="flex items-center space-x-2 mb-2">
                    <Shield className="h-4 w-4 text-purple-400" />
                    <span className="text-sm font-bold text-purple-400">Elite Status Available</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Complete enhanced verification to unlock elite features and maximum reputation.
                  </p>
                  <Button size="sm" className="bg-purple-500 hover:bg-purple-600 text-white">
                    <Zap className="h-3 w-3 mr-1" />
                    Upgrade to Elite
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="verification" className="space-y-6">
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
            <h3 className="text-xl font-bold text-primary mb-4">Verification Process</h3>
            
            <div className="space-y-4">
              {verificationSteps.map((step, index) => (
                <div key={step.id} className="flex items-center space-x-4 p-4 bg-background/50 rounded border border-primary/20">
                  <div className="flex-shrink-0">
                    {getStepStatusIcon(step.status)}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-medium">{step.name}</span>
                      {step.required && (
                        <Badge variant="outline" className="text-red-400 border-red-400/50 text-xs">
                          REQUIRED
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </div>
                  
                  <div className="flex-shrink-0">
                    {step.status === 'pending' && step.required && (
                      <Button size="sm" variant="outline">
                        Start
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {identity && verificationSteps.every(step => step.status === 'completed' || !step.required) && (
              <div className="mt-6">
                <Button
                  onClick={startVerification}
                  disabled={isVerifying}
                  className="w-full bg-primary hover:bg-primary/80 neon-border"
                >
                  <Shield className="h-4 w-4 mr-2" />
                  {isVerifying ? 'Verifying...' : 'Complete Verification'}
                </Button>

                {isVerifying && (
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Blockchain verification...</span>
                      <span>{verificationProgress}%</span>
                    </div>
                    <Progress value={verificationProgress} className="h-2" />
                  </div>
                )}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="reputation" className="space-y-6">
          {identity ? (
            <div className="grid md:grid-cols-2 gap-6">
              {/* Reputation Score */}
              <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
                <h3 className="text-xl font-bold text-primary mb-4">Reputation Metrics</h3>
                
                <div className="text-center mb-6">
                  <div className="relative inline-block">
                    <div className="w-32 h-32 rounded-full border-4 border-primary/20 flex items-center justify-center">
                      <div className="text-3xl font-bold text-primary">{identity.reputation}</div>
                    </div>
                    <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin"></div>
                  </div>
                  <p className="text-muted-foreground mt-2">Reputation Score</p>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Transaction History:</span>
                    <span className="text-blue-400">{identity.transactionCount} txns</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Account Age:</span>
                    <span className="text-green-400">247 days</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Security Score:</span>
                    <span className="text-purple-400">A+ (98/100)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Last Activity:</span>
                    <span className="text-yellow-400">2 hours ago</span>
                  </div>
                </div>
              </Card>

              {/* Activity Timeline */}
              <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
                <h3 className="text-xl font-bold text-primary mb-4">Recent Activity</h3>
                
                <div className="space-y-3">
                  <div className="flex items-center space-x-3 p-3 bg-background/50 rounded border border-green-400/20">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Vulnerability Report Submitted</div>
                      <div className="text-xs text-muted-foreground">+50 reputation points</div>
                    </div>
                    <div className="text-xs text-muted-foreground">2h ago</div>
                  </div>
                  
                  <div className="flex items-center space-x-3 p-3 bg-background/50 rounded border border-blue-400/20">
                    <Shield className="h-4 w-4 text-blue-400" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Security Challenge Completed</div>
                      <div className="text-xs text-muted-foreground">SQL Injection Lab</div>
                    </div>
                    <div className="text-xs text-muted-foreground">1d ago</div>
                  </div>
                  
                  <div className="flex items-center space-x-3 p-3 bg-background/50 rounded border border-purple-400/20">
                    <Diamond className="h-4 w-4 text-purple-400" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Elite Badge Earned</div>
                      <div className="text-xs text-muted-foreground">Bug Bounty Hunter</div>
                    </div>
                    <div className="text-xs text-muted-foreground">3d ago</div>
                  </div>
                  
                  <div className="flex items-center space-x-3 p-3 bg-background/50 rounded border border-yellow-400/20">
                    <Key className="h-4 w-4 text-yellow-400" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Quantum Key Generated</div>
                      <div className="text-xs text-muted-foreground">Kyber-1024 algorithm</div>
                    </div>
                    <div className="text-xs text-muted-foreground">5d ago</div>
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <div className="text-center py-12">
              <Fingerprint className="h-16 w-16 text-primary mx-auto mb-4 animate-pulse" />
              <h3 className="text-xl font-bold text-primary mb-2">Connect Wallet First</h3>
              <p className="text-muted-foreground">
                Connect your blockchain wallet to view reputation metrics and activity.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }
};

