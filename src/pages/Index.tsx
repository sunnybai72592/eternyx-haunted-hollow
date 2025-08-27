import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TypingText } from "@/components/TypingText";
import { CyberCard } from "@/components/CyberCard";
import { TerminalWindow } from "@/components/TerminalWindow";
import cyberHeroBg from "@/assets/cyber-hero-bg.jpg";
import { Code, Shield, Zap, Terminal, Mail, User, MessageSquare } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form submitted:", formData);
    // Here you would typically send the data to your backend
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <section 
        className="relative min-h-screen flex items-center justify-center bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${cyberHeroBg})` }}
      >
        <div className="absolute inset-0 bg-background/80"></div>
        
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <h1 
            className="text-8xl md:text-9xl font-bold mb-6 glitch neon-text"
            data-text="ETERNYX"
          >
            ETERNYX
          </h1>
          
          <div className="text-xl md:text-2xl mb-8 h-12">
            <TypingText 
              text="Full Stack Development • Cybersecurity • Digital Innovation"
              speed={80}
              className="text-cyber-blue"
            />
          </div>
          
          <Button 
            size="lg" 
            onClick={() => navigate("/hacked")}
            className="bg-primary hover:bg-primary/80 text-primary-foreground neon-border animate-pulse-glow"
          >
            <Terminal className="mr-2 h-5 w-5" />
            Initialize Connection
          </Button>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-20 px-4 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-primary">
            <TypingText text="./services" speed={120} />
          </h2>
          <p className="text-muted-foreground text-lg">
            Advanced digital solutions powered by cutting-edge technology
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <CyberCard
            title="Full Stack Development"
            description="Complete web applications built with modern frameworks. From responsive frontends to scalable backends, we architect solutions that perform."
            icon={<Code />}
          />
          
          <CyberCard
            title="Cybersecurity"
            description="Protect your digital assets with enterprise-grade security measures. Penetration testing, vulnerability assessments, and security audits."
            icon={<Shield />}
          />
          
          <CyberCard
            title="Performance Optimization"
            description="Lightning-fast applications that scale. Database optimization, caching strategies, and infrastructure that handles growth."
            icon={<Zap />}
          />
        </div>
      </section>

      {/* Tech Stack Section */}
      <section className="py-20 px-4 max-w-4xl mx-auto">
        <TerminalWindow title="tech-stack.sh" className="mb-8">
          <div className="space-y-2">
            <div className="text-cyber-green">$ cat tech_stack.txt</div>
            <div className="text-foreground">
              <div>Frontend: React • TypeScript • Next.js • Tailwind CSS</div>
              <div>Backend: Node.js • Python • PostgreSQL • Redis</div>
              <div>Cloud: AWS • Docker • Kubernetes • Terraform</div>
              <div>Security: OWASP • Pentesting • Encryption • Zero Trust</div>
            </div>
            <div className="text-cyber-green typing-cursor">$ _</div>
          </div>
        </TerminalWindow>
      </section>

      {/* Contact Section */}
      <section className="py-20 px-4 max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-primary">
            <TypingText text="./contact" speed={120} />
          </h2>
          <p className="text-muted-foreground text-lg">
            Ready to build something extraordinary?
          </p>
        </div>

        <TerminalWindow title="contact-form.exe">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-cyber-green mb-2">
                  <User className="inline mr-2 h-4 w-4" />
                  Name:
                </label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="bg-background border-border text-foreground"
                  placeholder="Enter your name..."
                />
              </div>
              
              <div>
                <label className="block text-cyber-green mb-2">
                  <Mail className="inline mr-2 h-4 w-4" />
                  Email:
                </label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="bg-background border-border text-foreground"
                  placeholder="your@email.com"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-cyber-green mb-2">
                <MessageSquare className="inline mr-2 h-4 w-4" />
                Message:
              </label>
              <Textarea
                value={formData.message}
                onChange={(e) => setFormData({...formData, message: e.target.value})}
                className="bg-background border-border text-foreground min-h-32"
                placeholder="Describe your project requirements..."
              />
            </div>
            
            <Button 
              type="submit"
              className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border"
            >
              <Terminal className="mr-2 h-5 w-5" />
              Execute Connection
            </Button>
          </form>
        </TerminalWindow>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 text-center border-t border-border">
        <p className="text-muted-foreground">
          © 2024 ETERNYX • <span className="text-cyber-green">System Online</span>
        </p>
      </footer>
    </div>
  );
};

export default Index;
