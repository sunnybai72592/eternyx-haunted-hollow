import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { 
  Lock, 
  Unlock, 
  Key, 
  Shield, 
  Zap, 
  Download,
  Upload,
  Copy,
  Eye,
  EyeOff,
  Diamond,
  Atom,
  Binary,
  Fingerprint
} from 'lucide-react';

interface EncryptionKey {
  id: string;
  name: string;
  algorithm: string;
  keySize: number;
  isQuantumResistant: boolean;
  createdAt: Date;
  expiresAt: Date;
}

interface EncryptionResult {
  encrypted: string;
  keyUsed: string;
  algorithm: string;
  timestamp: Date;
}

export const QuantumEncryptionUtility = () => {
  const [activeTab, setActiveTab] = useState('encrypt');
  const [plaintext, setPlaintext] = useState('');
  const [ciphertext, setCiphertext] = useState('');
  const [selectedAlgorithm, setSelectedAlgorithm] = useState('kyber-1024');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [showPlaintext, setShowPlaintext] = useState(false);
  const [encryptionResult, setEncryptionResult] = useState<EncryptionResult | null>(null);

  const [keys] = useState<EncryptionKey[]>([
    {
      id: '1',
      name: 'Primary Quantum Key',
      algorithm: 'Kyber-1024',
      keySize: 1024,
      isQuantumResistant: true,
      createdAt: new Date(Date.now() - 86400000),
      expiresAt: new Date(Date.now() + 86400000 * 30)
    },
    {
      id: '2',
      name: 'Backup RSA Key',
      algorithm: 'RSA-4096',
      keySize: 4096,
      isQuantumResistant: false,
      createdAt: new Date(Date.now() - 86400000 * 7),
      expiresAt: new Date(Date.now() + 86400000 * 365)
    },
    {
      id: '3',
      name: 'Emergency Dilithium Key',
      algorithm: 'Dilithium-5',
      keySize: 2048,
      isQuantumResistant: true,
      createdAt: new Date(Date.now() - 86400000 * 2),
      expiresAt: new Date(Date.now() + 86400000 * 90)
    }
  ]);

  const quantumAlgorithms = [
    { value: 'kyber-1024', label: 'Kyber-1024 (Post-Quantum)', quantum: true },
    { value: 'dilithium-5', label: 'Dilithium-5 (Digital Signatures)', quantum: true },
    { value: 'falcon-1024', label: 'FALCON-1024 (Compact)', quantum: true },
    { value: 'sphincs-256', label: 'SPHINCS+-256 (Stateless)', quantum: true },
    { value: 'rsa-4096', label: 'RSA-4096 (Legacy)', quantum: false },
    { value: 'aes-256', label: 'AES-256-GCM (Symmetric)', quantum: false }
  ];

  const handleEncrypt = async () => {
    if (!plaintext.trim()) return;
    
    setIsProcessing(true);
    setProcessingProgress(0);

    // Simulate quantum encryption process
    const interval = setInterval(() => {
      setProcessingProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsProcessing(false);
          
          // Generate mock encrypted result
          const mockEncrypted = btoa(plaintext).split('').reverse().join('') + '_QUANTUM_ENCRYPTED';
          setCiphertext(mockEncrypted);
          
          setEncryptionResult({
            encrypted: mockEncrypted,
            keyUsed: selectedAlgorithm,
            algorithm: quantumAlgorithms.find(a => a.value === selectedAlgorithm)?.label || selectedAlgorithm,
            timestamp: new Date()
          });
          
          return 100;
        }
        return prev + 5;
      });
    }, 150);
  };

  const handleDecrypt = async () => {
    if (!ciphertext.trim()) return;
    
    setIsProcessing(true);
    setProcessingProgress(0);

    // Simulate quantum decryption process
    const interval = setInterval(() => {
      setProcessingProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsProcessing(false);
          
          // Mock decryption (reverse of encryption)
          try {
            const decoded = atob(ciphertext.replace('_QUANTUM_ENCRYPTED', '').split('').reverse().join(''));
            setPlaintext(decoded);
          } catch {
            setPlaintext('Decryption failed - invalid ciphertext or key');
          }
          
          return 100;
        }
        return prev + 4;
      });
    }, 120);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getAlgorithmBadge = (algorithm: string) => {
    const algo = quantumAlgorithms.find(a => a.value === algorithm);
    return (
      <Badge 
        variant="outline" 
        className={algo?.quantum ? 'text-purple-400 border-purple-400/50' : 'text-orange-400 border-orange-400/50'}
      >
        {algo?.quantum ? (
          <>
            <Atom className="h-3 w-3 mr-1" />
            QUANTUM-SAFE
          </>
        ) : (
          <>
            <Binary className="h-3 w-3 mr-1" />
            CLASSICAL
          </>
        )}
      </Badge>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-primary mb-2 glitch" data-text="QUANTUM ENCRYPTION">
          QUANTUM ENCRYPTION
        </h2>
        <p className="text-muted-foreground">
          Post-quantum cryptography for future-proof security
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 bg-card/50 border border-primary/20">
          <TabsTrigger value="encrypt" className="data-[state=active]:bg-primary/20">
            <Lock className="h-4 w-4 mr-2" />
            Encrypt
          </TabsTrigger>
          <TabsTrigger value="keys" className="data-[state=active]:bg-primary/20">
            <Key className="h-4 w-4 mr-2" />
            Key Management
          </TabsTrigger>
          <TabsTrigger value="analysis" className="data-[state=active]:bg-primary/20">
            <Diamond className="h-4 w-4 mr-2" />
            Crypto Analysis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="encrypt" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Encryption Panel */}
            <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
              <h3 className="text-xl font-bold text-primary mb-4">Data Encryption</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-primary mb-2">Algorithm</label>
                  <Select value={selectedAlgorithm} onValueChange={setSelectedAlgorithm}>
                    <SelectTrigger className="bg-background/50 border-primary/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-primary/20">
                      {quantumAlgorithms.map((algo) => (
                        <SelectItem key={algo.value} value={algo.value}>
                          <div className="flex items-center space-x-2">
                            <span>{algo.label}</span>
                            {algo.quantum && <Atom className="h-3 w-3 text-purple-400" />}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="mt-2">
                    {getAlgorithmBadge(selectedAlgorithm)}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-primary mb-2">Plaintext Data</label>
                  <div className="relative">
                    <Textarea
                      value={plaintext}
                      onChange={(e) => setPlaintext(e.target.value)}
                      placeholder="Enter sensitive data to encrypt..."
                      className="bg-background/50 border-primary/30 min-h-32 pr-10"
                      type={showPlaintext ? 'text' : 'password'}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => setShowPlaintext(!showPlaintext)}
                    >
                      {showPlaintext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <Button
                    onClick={handleEncrypt}
                    disabled={isProcessing || !plaintext.trim()}
                    className="bg-primary hover:bg-primary/80 neon-border flex-1"
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    Encrypt
                  </Button>
                  <Button
                    onClick={handleDecrypt}
                    disabled={isProcessing || !ciphertext.trim()}
                    variant="outline"
                    className="border-purple-400/50 text-purple-400 flex-1"
                  >
                    <Unlock className="h-4 w-4 mr-2" />
                    Decrypt
                  </Button>
                </div>

                {isProcessing && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Quantum processing...</span>
                      <span>{processingProgress}%</span>
                    </div>
                    <Progress value={processingProgress} className="h-2" />
                  </div>
                )}
              </div>
            </Card>

            {/* Results Panel */}
            <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
              <h3 className="text-xl font-bold text-primary mb-4">Encrypted Output</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-primary mb-2">Ciphertext</label>
                  <div className="relative">
                    <Textarea
                      value={ciphertext}
                      onChange={(e) => setCiphertext(e.target.value)}
                      placeholder="Encrypted data will appear here..."
                      className="bg-background/50 border-primary/30 min-h-32 font-mono text-xs"
                      readOnly={!ciphertext || isProcessing}
                    />
                    {ciphertext && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => copyToClipboard(ciphertext)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {encryptionResult && (
                  <div className="bg-background/50 rounded-lg p-4 border border-primary/20">
                    <h4 className="text-sm font-bold text-primary mb-3">Encryption Details</h4>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Algorithm:</span>
                        <span className="font-mono">{encryptionResult.algorithm}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Key Used:</span>
                        <span className="font-mono">{encryptionResult.keyUsed}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Timestamp:</span>
                        <span className="font-mono">{encryptionResult.timestamp.toISOString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Data Size:</span>
                        <span className="font-mono">{encryptionResult.encrypted.length} bytes</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex space-x-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    <Upload className="h-4 w-4 mr-2" />
                    Import
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="keys" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Key Generation */}
            <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
              <h3 className="text-xl font-bold text-primary mb-4">Generate New Key</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-primary mb-2">Key Name</label>
                  <Input
                    placeholder="Enter key identifier..."
                    className="bg-background/50 border-primary/30"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-primary mb-2">Algorithm</label>
                  <Select defaultValue="kyber-1024">
                    <SelectTrigger className="bg-background/50 border-primary/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-primary/20">
                      {quantumAlgorithms.map((algo) => (
                        <SelectItem key={algo.value} value={algo.value}>
                          <div className="flex items-center space-x-2">
                            <span>{algo.label}</span>
                            {algo.quantum && <Atom className="h-3 w-3 text-purple-400" />}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-primary mb-2">Key Size</label>
                  <Select defaultValue="1024">
                    <SelectTrigger className="bg-background/50 border-primary/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-primary/20">
                      <SelectItem value="512">512 bits</SelectItem>
                      <SelectItem value="1024">1024 bits</SelectItem>
                      <SelectItem value="2048">2048 bits</SelectItem>
                      <SelectItem value="4096">4096 bits</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button className="w-full bg-primary hover:bg-primary/80 neon-border">
                  <Key className="h-4 w-4 mr-2" />
                  Generate Quantum Key
                </Button>
              </div>
            </Card>

            {/* Key Management */}
            <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
              <h3 className="text-xl font-bold text-primary mb-4">Key Vault</h3>
              
              <div className="space-y-3">
                {keys.map((key) => (
                  <Card key={key.id} className="p-4 bg-background/30 border border-primary/20">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <Fingerprint className="h-4 w-4 text-primary" />
                        <span className="font-medium">{key.name}</span>
                      </div>
                      <Badge 
                        variant="outline" 
                        className={key.isQuantumResistant ? 'text-purple-400 border-purple-400/50' : 'text-orange-400 border-orange-400/50'}
                      >
                        {key.isQuantumResistant ? (
                          <>
                            <Atom className="h-3 w-3 mr-1" />
                            QUANTUM-SAFE
                          </>
                        ) : (
                          <>
                            <Binary className="h-3 w-3 mr-1" />
                            CLASSICAL
                          </>
                        )}
                      </Badge>
                    </div>
                    
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>Algorithm: {key.algorithm}</div>
                      <div>Size: {key.keySize} bits</div>
                      <div>Created: {key.createdAt.toLocaleDateString()}</div>
                      <div>Expires: {key.expiresAt.toLocaleDateString()}</div>
                    </div>

                    <div className="flex space-x-2 mt-3">
                      <Button size="sm" variant="outline" className="text-xs flex-1">
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs flex-1">
                        <Download className="h-3 w-3 mr-1" />
                        Export
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs text-red-400 border-red-400/50">
                        <Zap className="h-3 w-3" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-6">
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-6">
            <h3 className="text-xl font-bold text-primary mb-4">Cryptographic Analysis</h3>
            
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-background/50 rounded border border-green-400/20">
                <Shield className="h-8 w-8 text-green-400 mx-auto mb-2 animate-pulse" />
                <div className="text-2xl font-bold text-green-400">98.7%</div>
                <div className="text-xs text-muted-foreground">Quantum Resistance</div>
              </div>
              
              <div className="text-center p-4 bg-background/50 rounded border border-blue-400/20">
                <Zap className="h-8 w-8 text-blue-400 mx-auto mb-2 animate-pulse" />
                <div className="text-2xl font-bold text-blue-400">2.3ms</div>
                <div className="text-xs text-muted-foreground">Encryption Speed</div>
              </div>
              
              <div className="text-center p-4 bg-background/50 rounded border border-purple-400/20">
                <Diamond className="h-8 w-8 text-purple-400 mx-auto mb-2 animate-pulse" />
                <div className="text-2xl font-bold text-purple-400">256-bit</div>
                <div className="text-xs text-muted-foreground">Security Level</div>
              </div>
            </div>

            <div className="mt-6 bg-background/50 rounded-lg p-4 border border-primary/20">
              <h4 className="text-sm font-bold text-primary mb-3">Security Assessment</h4>
              <div className="space-y-2 text-xs font-mono">
                <div className="text-green-400">✓ Post-quantum algorithms implemented</div>
                <div className="text-green-400">✓ Key rotation schedule active</div>
                <div className="text-green-400">✓ Forward secrecy enabled</div>
                <div className="text-yellow-400">⚠ Legacy RSA keys detected (recommend migration)</div>
                <div className="text-blue-400">ℹ Next key rotation in 23 days</div>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

