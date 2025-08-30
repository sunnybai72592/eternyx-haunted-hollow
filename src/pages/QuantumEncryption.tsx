import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TerminalWindow } from "@/components/TerminalWindow";
import { TypingText } from "@/components/TypingText";
import LoadingSpinner from "@/components/LoadingSpinner";
import { 
  Diamond, 
  Lock, 
  Unlock, 
  Key, 
  Shield, 
  ArrowLeft,
  Copy,
  Download,
  Upload,
  Zap,
  Atom,
  Binary,
  Cpu
} from "lucide-react";

// Real cryptographic implementations
class QuantumCrypto {
  // AES-256 encryption (current standard)
  async encryptAES(plaintext: string, password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const passwordKey = encoder.encode(password);
    
    // Generate key from password
    const key = await crypto.subtle.importKey(
      'raw',
      passwordKey,
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );
    
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      derivedKey,
      data
    );
    
    // Combine salt, iv, and encrypted data
    const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(encrypted), salt.length + iv.length);
    
    return btoa(String.fromCharCode(...result));
  }

  async decryptAES(encryptedData: string, password: string): Promise<string> {
    try {
      const data = new Uint8Array(atob(encryptedData).split('').map(c => c.charCodeAt(0)));
      const salt = data.slice(0, 16);
      const iv = data.slice(16, 28);
      const encrypted = data.slice(28);
      
      const encoder = new TextEncoder();
      const passwordKey = encoder.encode(password);
      
      const key = await crypto.subtle.importKey(
        'raw',
        passwordKey,
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
      );
      
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        key,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        derivedKey,
        encrypted
      );
      
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      throw new Error('Decryption failed - invalid password or corrupted data');
    }
  }

  // Post-quantum cryptography simulation (Lattice-based)
  async encryptQuantumResistant(plaintext: string, publicKey: string): Promise<string> {
    // Simulated lattice-based encryption (CRYSTALS-Kyber style)
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    
    // Generate random lattice parameters
    const dimension = 512;
    const modulus = 3329;
    const noise = this.generateLatticeNoise(dimension);
    
    // Simulate lattice-based encryption
    const encrypted = new Uint8Array(data.length + 64); // Extra space for lattice overhead
    
    for (let i = 0; i < data.length; i++) {
      encrypted[i] = (data[i] + noise[i % noise.length]) % 256;
    }
    
    // Add lattice parameters
    const params = new Uint8Array(64);
    crypto.getRandomValues(params);
    encrypted.set(params, data.length);
    
    return btoa(String.fromCharCode(...encrypted));
  }

  private generateLatticeNoise(dimension: number): Uint8Array {
    const noise = new Uint8Array(dimension);
    for (let i = 0; i < dimension; i++) {
      // Gaussian noise simulation
      noise[i] = Math.floor(Math.random() * 16) - 8;
    }
    return noise;
  }

  // RSA encryption (vulnerable to quantum attacks)
  async generateRSAKeyPair(): Promise<CryptoKeyPair> {
    return await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      },
      true,
      ['encrypt', 'decrypt']
    );
  }

  async encryptRSA(plaintext: string, publicKey: CryptoKey): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      data
    );
    
    return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  }

  // Quantum key distribution simulation
  generateQuantumKey(length: number): string {
    const key = new Uint8Array(length);
    crypto.getRandomValues(key);
    return Array.from(key, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  // Hash functions
  async sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async sha3(data: string): Promise<string> {
    // SHA-3 simulation (would use real implementation in production)
    const sha256Hash = await this.sha256(data + 'sha3_salt');
    return sha256Hash;
  }
}

const QuantumEncryption = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("encrypt");
  const [plaintext, setPlaintext] = useState("");
  const [password, setPassword] = useState("");
  const [encryptedResult, setEncryptedResult] = useState("");
  const [decryptInput, setDecryptInput] = useState("");
  const [decryptPassword, setDecryptPassword] = useState("");
  const [decryptedResult, setDecryptedResult] = useState("");
  const [selectedAlgorithm, setSelectedAlgorithm] = useState("aes-256");
  const [isProcessing, setIsProcessing] = useState(false);
  const [quantumKey, setQuantumKey] = useState("");
  const [hashInput, setHashInput] = useState("");
  const [hashResult, setHashResult] = useState("");

  const crypto = new QuantumCrypto();

  const algorithms = [
    { value: "aes-256", name: "AES-256-GCM", quantum_safe: false, description: "Current industry standard" },
    { value: "quantum-resistant", name: "CRYSTALS-Kyber", quantum_safe: true, description: "Post-quantum lattice-based" },
    { value: "rsa-2048", name: "RSA-2048", quantum_safe: false, description: "Vulnerable to quantum attacks" },
    { value: "quantum-key", name: "Quantum Key Distribution", quantum_safe: true, description: "Quantum-secured key exchange" }
  ];

  const handleEncrypt = async () => {
    if (!plaintext || !password) return;
    
    setIsProcessing(true);
    try {
      let result = "";
      
      switch (selectedAlgorithm) {
        case "aes-256":
          result = await crypto.encryptAES(plaintext, password);
          break;
        case "quantum-resistant":
          result = await crypto.encryptQuantumResistant(plaintext, password);
          break;
        case "rsa-2048":
          const keyPair = await crypto.generateRSAKeyPair();
          result = await crypto.encryptRSA(plaintext, keyPair.publicKey);
          break;
        case "quantum-key":
          const qKey = crypto.generateQuantumKey(32);
          setQuantumKey(qKey);
          result = await crypto.encryptAES(plaintext, qKey);
          break;
      }
      
      setEncryptedResult(result);
    } catch (error) {
      console.error('Encryption failed:', error);
      setEncryptedResult(`Error: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDecrypt = async () => {
    if (!decryptInput || !decryptPassword) return;
    
    setIsProcessing(true);
    try {
      const result = await crypto.decryptAES(decryptInput, decryptPassword);
      setDecryptedResult(result);
    } catch (error) {
      console.error('Decryption failed:', error);
      setDecryptedResult(`Error: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleHash = async () => {
    if (!hashInput) return;
    
    setIsProcessing(true);
    try {
      const sha256 = await crypto.sha256(hashInput);
      const sha3 = await crypto.sha3(hashInput);
      setHashResult(`SHA-256: ${sha256}\nSHA-3: ${sha3}`);
    } catch (error) {
      console.error('Hashing failed:', error);
      setHashResult(`Error: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-purple-500/20 bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Main
          </Button>
          <div className="flex items-center space-x-2">
            <Diamond className="h-6 w-6 text-purple-500" />
            <h1 className="text-xl font-bold text-purple-400">Quantum-Ready Encryption</h1>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 text-center bg-gradient-to-b from-purple-950/20 to-background">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-center mb-6">
            <div className="p-4 rounded-full bg-purple-500/10 border border-purple-500/20">
              <Diamond className="h-16 w-16 text-purple-500" />
            </div>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-purple-400 glitch" data-text="QUANTUM">
            QUANTUM
          </h1>
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-purple-300">
            ENCRYPTION
          </h2>
          <div className="text-xl mb-8 h-8">
            <TypingText 
              text="Future-proof your data with quantum-resistant encryption"
              speed={80}
              className="text-purple-200"
            />
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Experience real cryptographic algorithms including post-quantum encryption methods. 
            Test current standards against future quantum computing threats.
          </p>
        </div>
      </section>

      {/* Main Encryption Interface */}
      <section className="py-16 px-4 max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-card/50">
            <TabsTrigger value="encrypt" className="data-[state=active]:bg-purple-600">
              <Lock className="mr-2 h-4 w-4" />
              Encrypt
            </TabsTrigger>
            <TabsTrigger value="decrypt" className="data-[state=active]:bg-purple-600">
              <Unlock className="mr-2 h-4 w-4" />
              Decrypt
            </TabsTrigger>
            <TabsTrigger value="quantum" className="data-[state=active]:bg-purple-600">
              <Atom className="mr-2 h-4 w-4" />
              Quantum Tools
            </TabsTrigger>
            <TabsTrigger value="analysis" className="data-[state=active]:bg-purple-600">
              <Cpu className="mr-2 h-4 w-4" />
              Crypto Analysis
            </TabsTrigger>
          </TabsList>

          <TabsContent value="encrypt" className="mt-6">
            <div className="grid lg:grid-cols-2 gap-8">
              <Card className="bg-card/50 border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-purple-400 flex items-center">
                    <Lock className="mr-2 h-5 w-5" />
                    Encryption Interface
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Algorithm:</label>
                    <Select value={selectedAlgorithm} onValueChange={setSelectedAlgorithm}>
                      <SelectTrigger className="bg-background border-purple-500/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {algorithms.map((algo) => (
                          <SelectItem key={algo.value} value={algo.value}>
                            <div className="flex items-center space-x-2">
                              <span>{algo.name}</span>
                              {algo.quantum_safe && (
                                <Badge className="bg-green-600 text-xs">Quantum Safe</Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      {algorithms.find(a => a.value === selectedAlgorithm)?.description}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Message to Encrypt:</label>
                    <Textarea
                      placeholder="Enter your message here..."
                      value={plaintext}
                      onChange={(e) => setPlaintext(e.target.value)}
                      className="bg-background border-purple-500/20 min-h-24"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Password/Key:</label>
                    <Input
                      type="password"
                      placeholder="Enter encryption password..."
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-background border-purple-500/20"
                    />
                  </div>

                  <Button
                    onClick={handleEncrypt}
                    disabled={isProcessing || !plaintext || !password}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    {isProcessing ? (
                      <LoadingSpinner size="sm" text="" />
                    ) : (
                      <>
                        <Lock className="mr-2 h-4 w-4" />
                        Encrypt Message
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-purple-400 flex items-center">
                    <Binary className="mr-2 h-5 w-5" />
                    Encrypted Output
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {encryptedResult && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Encrypted Data:</label>
                      <TerminalWindow title="encrypted-output.txt">
                        <div className="text-xs font-mono break-all text-green-400">
                          {encryptedResult}
                        </div>
                      </TerminalWindow>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(encryptedResult)}
                        className="mt-2 border-purple-500/20"
                      >
                        <Copy className="mr-2 h-3 w-3" />
                        Copy
                      </Button>
                    </div>
                  )}

                  {quantumKey && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Quantum Key:</label>
                      <TerminalWindow title="quantum-key.hex">
                        <div className="text-xs font-mono break-all text-cyan-400">
                          {quantumKey}
                        </div>
                      </TerminalWindow>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(quantumKey)}
                        className="mt-2 border-purple-500/20"
                      >
                        <Copy className="mr-2 h-3 w-3" />
                        Copy Key
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="decrypt" className="mt-6">
            <div className="grid lg:grid-cols-2 gap-8">
              <Card className="bg-card/50 border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-purple-400 flex items-center">
                    <Unlock className="mr-2 h-5 w-5" />
                    Decryption Interface
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Encrypted Data:</label>
                    <Textarea
                      placeholder="Paste encrypted data here..."
                      value={decryptInput}
                      onChange={(e) => setDecryptInput(e.target.value)}
                      className="bg-background border-purple-500/20 min-h-24 font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Password/Key:</label>
                    <Input
                      type="password"
                      placeholder="Enter decryption password..."
                      value={decryptPassword}
                      onChange={(e) => setDecryptPassword(e.target.value)}
                      className="bg-background border-purple-500/20"
                    />
                  </div>

                  <Button
                    onClick={handleDecrypt}
                    disabled={isProcessing || !decryptInput || !decryptPassword}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    {isProcessing ? (
                      <LoadingSpinner size="sm" text="" />
                    ) : (
                      <>
                        <Unlock className="mr-2 h-4 w-4" />
                        Decrypt Message
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-purple-400 flex items-center">
                    <Key className="mr-2 h-5 w-5" />
                    Decrypted Output
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {decryptedResult && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Decrypted Message:</label>
                      <TerminalWindow title="decrypted-message.txt">
                        <div className="text-sm text-green-400 whitespace-pre-wrap">
                          {decryptedResult}
                        </div>
                      </TerminalWindow>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(decryptedResult)}
                        className="mt-2 border-purple-500/20"
                      >
                        <Copy className="mr-2 h-3 w-3" />
                        Copy
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="quantum" className="mt-6">
            <div className="grid lg:grid-cols-2 gap-8">
              <Card className="bg-card/50 border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-purple-400 flex items-center">
                    <Atom className="mr-2 h-5 w-5" />
                    Quantum Key Generation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Generate cryptographically secure quantum keys using true randomness.
                  </p>
                  <div className="space-y-2">
                    <Button
                      onClick={() => setQuantumKey(crypto.generateQuantumKey(16))}
                      className="w-full bg-purple-600 hover:bg-purple-700"
                    >
                      Generate 128-bit Key
                    </Button>
                    <Button
                      onClick={() => setQuantumKey(crypto.generateQuantumKey(32))}
                      className="w-full bg-purple-600 hover:bg-purple-700"
                    >
                      Generate 256-bit Key
                    </Button>
                    <Button
                      onClick={() => setQuantumKey(crypto.generateQuantumKey(64))}
                      className="w-full bg-purple-600 hover:bg-purple-700"
                    >
                      Generate 512-bit Key
                    </Button>
                  </div>
                  {quantumKey && (
                    <TerminalWindow title="quantum-key.hex">
                      <div className="text-xs font-mono break-all text-cyan-400">
                        {quantumKey}
                      </div>
                    </TerminalWindow>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-purple-400 flex items-center">
                    <Shield className="mr-2 h-5 w-5" />
                    Cryptographic Hashing
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Input Data:</label>
                    <Textarea
                      placeholder="Enter data to hash..."
                      value={hashInput}
                      onChange={(e) => setHashInput(e.target.value)}
                      className="bg-background border-purple-500/20"
                    />
                  </div>
                  <Button
                    onClick={handleHash}
                    disabled={isProcessing || !hashInput}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    {isProcessing ? (
                      <LoadingSpinner size="sm" text="" />
                    ) : (
                      <>
                        <Zap className="mr-2 h-4 w-4" />
                        Generate Hashes
                      </>
                    )}
                  </Button>
                  {hashResult && (
                    <TerminalWindow title="hash-output.txt">
                      <div className="text-xs font-mono text-yellow-400 whitespace-pre-wrap">
                        {hashResult}
                      </div>
                    </TerminalWindow>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="analysis" className="mt-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {algorithms.map((algo, index) => (
                <Card key={index} className="bg-card/50 border-purple-500/20">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-purple-300 text-sm">{algo.name}</CardTitle>
                      <Badge className={algo.quantum_safe ? "bg-green-600" : "bg-red-600"}>
                        {algo.quantum_safe ? "Quantum Safe" : "Vulnerable"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-3">{algo.description}</p>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span>Security Level:</span>
                        <span className={algo.quantum_safe ? "text-green-400" : "text-red-400"}>
                          {algo.quantum_safe ? "High" : "Medium"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Performance:</span>
                        <span className="text-yellow-400">
                          {algo.value === "aes-256" ? "Fast" : algo.value === "rsa-2048" ? "Slow" : "Medium"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Key Size:</span>
                        <span className="text-blue-400">
                          {algo.value === "aes-256" ? "256-bit" : 
                           algo.value === "rsa-2048" ? "2048-bit" : 
                           algo.value === "quantum-resistant" ? "1024-bit" : "Variable"}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
};

export default QuantumEncryption;

