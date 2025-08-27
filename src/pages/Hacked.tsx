import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TypingText } from "@/components/TypingText";
import { CyberCard } from "@/components/CyberCard";
import { TerminalWindow } from "@/components/TerminalWindow";
import { useNavigate } from "react-router-dom";
import { 
  Skull, 
  Eye, 
  Lock, 
  Unlock, 
  Database, 
  Server, 
  Wifi, 
  AlertTriangle,
  Crown,
  Gem,
  Zap
} from "lucide-react";

const Hacked = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [showContent, setShowContent] = useState(false);

  const hackingSequence = [
    "Initializing connection...",
    "Scanning network topology...",
    "Found 47 active nodes",
    "Bypassing firewall protocols...",
    "Injecting payload...",
    "Escalating privileges...",
    "ROOT ACCESS GRANTED",
    "Welcome to the INNER CIRCLE..."
  ];

  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentStep < hackingSequence.length - 1) {
        setCurrentStep(prev => prev + 1);
      } else {
        setTimeout(() => setShowContent(true), 2000);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [currentStep, hackingSequence.length]);

  if (!showContent) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="w-full max-w-4xl px-4">
          <TerminalWindow title="BREACH_PROTOCOL.exe" className="animate-pulse-glow">
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-red-500 mb-4">
                <Skull className="h-5 w-5 animate-pulse" />
                <span className="text-lg font-bold">UNAUTHORIZED ACCESS DETECTED</span>
                <Skull className="h-5 w-5 animate-pulse" />
              </div>
              
              {hackingSequence.slice(0, currentStep + 1).map((line, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <span className="text-cyber-green">$</span>
                  {index === currentStep ? (
                    <TypingText 
                      text={line} 
                      speed={50}
                      className={index === hackingSequence.length - 1 ? "text-red-500 font-bold text-xl" : "text-foreground"}
                    />
                  ) : (
                    <span className={index === hackingSequence.length - 1 ? "text-red-500 font-bold" : "text-foreground"}>
                      {line}
                    </span>
                  )}
                </div>
              ))}
              
              <div className="mt-6 flex justify-center">
                <div className="flex space-x-1">
                  {[...Array(10)].map((_, i) => (
                    <div
                      key={i}
                      className="w-2 h-8 bg-cyber-green animate-pulse"
                      style={{ animationDelay: `${i * 0.1}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </TerminalWindow>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hacked Header */}
      <div className="bg-red-500/10 border-b-2 border-red-500 py-4">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Eye className="h-8 w-8 text-red-500 animate-pulse" />
            <div>
              <h1 className="text-2xl font-bold text-red-500 glitch" data-text="SYSTEM COMPROMISED">
                SYSTEM COMPROMISED
              </h1>
              <p className="text-sm text-red-400">You've accessed the INNER CIRCLE</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            onClick={() => navigate("/")}
            className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
          >
            <Lock className="mr-2 h-4 w-4" />
            Secure Exit
          </Button>
        </div>
      </div>

      {/* Welcome Section */}
      <section className="py-16 px-4 max-w-6xl mx-auto text-center">
        <div className="mb-12">
          <h2 className="text-6xl font-bold mb-6">
            <span className="text-red-500 glitch" data-text="CONGRATULATIONS">CONGRATULATIONS</span>
          </h2>
          <div className="text-xl text-cyber-green mb-6">
            <TypingText 
              text="You've unlocked exclusive access to our premium services..."
              speed={60}
            />
          </div>
          <p className="text-muted-foreground text-lg max-w-3xl mx-auto">
            Welcome to the INNER CIRCLE - where we provide our most advanced cybersecurity 
            and development solutions. Consider this your VIP access to premium services.
          </p>
        </div>
      </section>

      {/* Exclusive Services */}
      <section className="py-16 px-4 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h3 className="text-4xl font-bold mb-4 text-red-500">
            <Crown className="inline mr-3 h-10 w-10" />
            PREMIUM ACCESS GRANTED
          </h3>
          <p className="text-muted-foreground">Exclusive services for the elite</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <CyberCard
            title="Black Hat Pentesting"
            description="Advanced penetration testing using cutting-edge techniques. We think like attackers to protect your systems from real threats."
            icon={<Skull className="text-red-500" />}
            className="border-red-500/30"
          />
          
          <CyberCard
            title="Zero-Day Protection"
            description="Stay ahead of unknown threats with our proprietary detection systems and real-time threat intelligence feeds."
            icon={<AlertTriangle className="text-yellow-500" />}
            className="border-yellow-500/30"
          />
          
          <CyberCard
            title="Quantum-Ready Encryption"
            description="Future-proof your data with quantum-resistant encryption algorithms and next-generation security protocols."
            icon={<Gem className="text-purple-500" />}
            className="border-purple-500/30"
          />
          
          <CyberCard
            title="AI-Powered Security"
            description="Machine learning algorithms that adapt to new threats in real-time, providing predictive security measures."
            icon={<Eye className="text-cyber-blue" />}
            className="border-blue-500/30"
          />
          
          <CyberCard
            title="Elite Development Team"
            description="Access to our top-tier developers for mission-critical applications that require the highest security standards."
            icon={<Server className="text-cyber-green" />}
            className="border-green-500/30"
          />
          
          <CyberCard
            title="24/7 Threat Monitoring"
            description="Round-the-clock security operations center monitoring your infrastructure with instant threat response."
            icon={<Wifi className="text-red-500" />}
            className="border-red-500/30"
          />
        </div>
      </section>

      {/* System Status */}
      <section className="py-16 px-4 max-w-4xl mx-auto">
        <TerminalWindow title="system-status.sh" className="mb-8">
          <div className="space-y-2">
            <div className="text-cyber-green">$ ./status_check.sh</div>
            <div className="text-foreground space-y-1">
              <div className="flex justify-between">
                <span>Security Level:</span>
                <span className="text-red-500 font-bold">MAXIMUM</span>
              </div>
              <div className="flex justify-between">
                <span>Access Level:</span>
                <span className="text-cyber-green font-bold">ROOT</span>
              </div>
              <div className="flex justify-between">
                <span>Threat Detection:</span>
                <span className="text-cyber-blue font-bold">ACTIVE</span>
              </div>
              <div className="flex justify-between">
                <span>Premium Status:</span>
                <span className="text-purple-500 font-bold">ENABLED</span>
              </div>
            </div>
            <div className="mt-4 p-4 border border-red-500/30 bg-red-500/5 rounded">
              <div className="flex items-center space-x-2 text-red-500">
                <Unlock className="h-5 w-5" />
                <span className="font-bold">SPECIAL OFFER UNLOCKED</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                50% OFF on all premium services for the next 48 hours
              </p>
            </div>
            <div className="text-cyber-green typing-cursor">$ _</div>
          </div>
        </TerminalWindow>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 text-center bg-red-500/5 border-y border-red-500/20">
        <div className="max-w-4xl mx-auto">
          <h3 className="text-3xl font-bold mb-6 text-red-500">
            Ready to Join the Elite?
          </h3>
          <p className="text-muted-foreground mb-8 text-lg">
            Your system breach was just a test. Now experience what real premium cybersecurity looks like.
          </p>
          <div className="space-x-4">
            <Button 
              size="lg" 
              className="bg-red-500 hover:bg-red-600 text-white neon-border animate-pulse-glow"
            >
              <Zap className="mr-2 h-5 w-5" />
              Claim Premium Access
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              onClick={() => navigate("/")}
              className="border-cyber-green text-cyber-green hover:bg-cyber-green hover:text-black"
            >
              Return to Surface
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 text-center border-t border-red-500/20">
        <p className="text-muted-foreground">
          © 2024 ETERNYX INNER CIRCLE • <span className="text-red-500">BREACH PROTOCOL ACTIVE</span>
        </p>
      </footer>
    </div>
  );
};

export default Hacked;