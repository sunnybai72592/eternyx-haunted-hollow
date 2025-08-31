import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TerminalWindow } from "@/components/TerminalWindow";
import { TypingText } from "@/components/TypingText";
import { 
  Diamond, 
  ArrowLeft,
  Lock,
  Unlock,
  Key,
  Brain,
  Zap,
  Shield,
  Clock
} from "lucide-react";

const QuantumEncryption = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("encrypt");
  const [plainText, setPlainText] = useState("");
  const [encryptedText, setEncryptedText] = useState("");
  const [decryptedText, setDecryptedText] = useState("");
  const [algorithm, setAlgorithm] = useState("kyber");

  const handleEncrypt = async () => {
    // In a real application, this would be an API call to a backend service
    // that performs the encryption using a cryptographic library.
    // For this demo, we will simulate the encryption.
    const simulatedEncryptedText = `[ENCRYPTED_WITH_${algorithm.toUpperCase()}]_${btoa(plainText)}`;
    setEncryptedText(simulatedEncryptedText);
  };

  const handleDecrypt = async () => {
    // In a real application, this would be an API call to a backend service
    // that performs the decryption using a cryptographic library.
    // For this demo, we will simulate the decryption.
    if (encryptedText.startsWith(`[ENCRYPTED_WITH_${algorithm.toUpperCase()}]_`)) {
      const base64Text = encryptedText.replace(`[ENCRYPTED_WITH_${algorithm.toUpperCase()}]_`, "");
      try {
        const simulatedDecryptedText = atob(base64Text);
        setDecryptedText(simulatedDecryptedText);
      } catch (e) {
        setDecryptedText("Error: Invalid encrypted text.");
      }
    } else {
      setDecryptedText("Error: Encrypted text does not match the selected algorithm.");
    }
  };

  const quantumAttackSimulation = [
    "[QUANTUM_SIM] Initializing quantum attack on AES-256...",
    "[QUANTUM_SIM] Applying Shor's algorithm...",
    "[QUANTUM_SIM] Factoring large numbers...",
    "[QUANTUM_SIM] Estimated time to break: 10^12 years (classical) -> 8 hours (quantum)",
    "[QUANTUM_SIM] Attack successful. Key compromised.",
    "",
    "[QUANTUM_SIM] Initializing quantum attack on CRYSTALS-Kyber...",
    "[QUANTUM_SIM] Applying quantum algorithms...",
    "[QUANTUM_SIM] Lattice-based cryptography resistant to quantum attacks.",
    "[QUANTUM_SIM] Attack failed. Key remains secure."
  ];

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
          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-purple-400 glitch" data-text="QUANTUM-READY">
            QUANTUM-READY
          </h1>
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-purple-300">
            ENCRYPTION
          </h2>
          <div className="text-xl mb-8 h-8">
            <TypingText 
              text="Future-proof your data with quantum-resistant encryption algorithms"
              speed={80}
              className="text-purple-200"
            />
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            As quantum computing emerges, classical encryption methods are becoming vulnerable. 
            Our quantum-ready solutions ensure your data remains secure for decades to come.
          </p>
        </div>
      </section>

      {/* Encryption Interface */}
      <section className="py-16 px-4 max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-card/50">
            <TabsTrigger value="encrypt" className="data-[state=active]:bg-purple-600">
              <Lock className="mr-2 h-4 w-4" />
              Encrypt/Decrypt
            </TabsTrigger>
            <TabsTrigger value="algorithms" className="data-[state=active]:bg-purple-600">
              <Brain className="mr-2 h-4 w-4" />
              Algorithms
            </TabsTrigger>
            <TabsTrigger value="simulation" className="data-[state=active]:bg-purple-600">
              <Zap className="mr-2 h-4 w-4" />
              Quantum Attack Simulation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="encrypt" className="mt-6">
            <div className="grid lg:grid-cols-2 gap-8">
              <Card className="bg-card/50 border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-purple-400 flex items-center">
                    <Key className="mr-2 h-5 w-5" />
                    Encryption Tool
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Algorithm:</label>
                      <select
                        value={algorithm}
                        onChange={(e) => setAlgorithm(e.target.value)}
                        className="w-full p-3 bg-background border border-purple-500/20 rounded-md text-foreground"
                      >
                        <option value="kyber">CRYSTALS-Kyber (Post-Quantum)</option>
                        <option value="dilithium">CRYSTALS-Dilithium (Post-Quantum)</option>
                        <option value="aes">AES-256 (Classical)</option>
                        <option value="rsa">RSA-2048 (Classical)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Plain Text:</label>
                      <Textarea
                        value={plainText}
                        onChange={(e) => setPlainText(e.target.value)}
                        placeholder="Enter your message here..."
                        className="bg-background border-purple-500/20 min-h-32"
                      />
                    </div>
                    <Button onClick={handleEncrypt} className="w-full bg-purple-600 hover:bg-purple-700">
                      <Lock className="mr-2 h-4 w-4" />
                      Encrypt
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-purple-400 flex items-center">
                    <Unlock className="mr-2 h-5 w-5" />
                    Decryption Tool
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Encrypted Text:</label>
                      <Textarea
                        value={encryptedText}
                        onChange={(e) => setEncryptedText(e.target.value)}
                        placeholder="Enter your encrypted message here..."
                        className="bg-background border-purple-500/20 min-h-32"
                      />
                    </div>
                    <Button onClick={handleDecrypt} className="w-full bg-purple-600 hover:bg-purple-700">
                      <Unlock className="mr-2 h-4 w-4" />
                      Decrypt
                    </Button>
                    {decryptedText && (
                      <div className="mt-4 p-4 bg-background/50 rounded-md border border-purple-500/20">
                        <h4 className="font-semibold text-purple-300 mb-2">Decrypted Text:</h4>
                        <p className="text-sm text-muted-foreground break-all">{decryptedText}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="algorithms" className="mt-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="bg-card/50 border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-purple-400 flex items-center">
                    <Shield className="mr-2 h-5 w-5" />
                    Post-Quantum Cryptography (PQC)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    PQC algorithms are designed to be secure against attacks from both classical and quantum computers. 
                    They are based on mathematical problems that are believed to be difficult for even quantum computers to solve.
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-sm">
                    <li>**CRYSTALS-Kyber:** A key-encapsulation mechanism (KEM) based on lattice-based cryptography.</li>
                    <li>**CRYSTALS-Dilithium:** A digital signature algorithm also based on lattice-based cryptography.</li>
                    <li>**SPHINCS+:** A stateless hash-based signature scheme.</li>
                    <li>**Falcon:** A lattice-based digital signature algorithm.</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-purple-500/20">
                <CardHeader>
                  <CardTitle className="text-purple-400 flex items-center">
                    <Clock className="mr-2 h-5 w-5" />
                    Classical Cryptography
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    Classical algorithms like AES and RSA are still secure against today's computers, but they are vulnerable 
                    to attacks from future quantum computers.
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-sm">
                    <li>**AES (Advanced Encryption Standard):** A symmetric-key algorithm used for encrypting data.</li>
                    <li>**RSA (Rivest-Shamir-Adleman):** An asymmetric-key algorithm used for secure data transmission.</li>
                    <li>**ECC (Elliptic-Curve Cryptography):** An asymmetric-key algorithm that provides similar security to RSA with smaller key sizes.</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="simulation" className="mt-6">
            <TerminalWindow title="quantum-attack-simulation.log">
              <div className="space-y-1 text-sm max-h-96 overflow-y-auto">
                {quantumAttackSimulation.map((line, index) => (
                  <div key={index} className="text-purple-400">{line}</div>
                ))}
              </div>
            </TerminalWindow>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
};

export default QuantumEncryption;

