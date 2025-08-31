import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TypingText } from "@/components/TypingText";
import {
  ArrowLeft,
  Skull,
  AlertTriangle,
  Gem,
  Eye,
  Code,
  Wifi,
} from "lucide-react";

const Services = () => {
  const navigate = useNavigate();

  const serviceCards = [
    {
      title: "Black Hat Pentesting",
      description: "Advanced penetration testing using cutting-edge techniques. We think like attackers to protect your systems from real threats.",
      icon: <Skull className="h-8 w-8 text-green-500" />,
      link: "/black-hat-pentesting",
    },
    {
      title: "Zero-Day Protection",
      description: "Stay ahead of unknown threats with our proprietary detection systems and real-time threat intelligence feeds.",
      icon: <AlertTriangle className="h-8 w-8 text-yellow-500" />,
      link: "/zero-day-protection",
    },
    {
      title: "Quantum-Ready Encryption",
      description: "Future-proof your data with quantum-resistant encryption algorithms and next-generation security protocols.",
      icon: <Gem className="h-8 w-8 text-purple-500" />,
      link: "/quantum-encryption",
    },
    {
      title: "AI-Powered Security",
      description: "Machine learning algorithms that adapt to new threats in real-time, providing predictive security measures.",
      icon: <Eye className="h-8 w-8 text-blue-500" />,
      link: "/ai-powered-security",
    },
    {
      title: "Elite Development Team",
      description: "Access to our top-tier developers for mission-critical applications that require the highest security standards.",
      icon: <Code className="h-8 w-8 text-cyan-500" />,
      link: "/elite-development-team",
    },
    {
      title: "24/7 Threat Monitoring",
      description: "Round-the-clock security operations center monitoring your infrastructure with instant threat response.",
      icon: <Wifi className="h-8 w-8 text-red-500" />,
      link: "/threat-monitoring",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-gray-700 bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="text-muted-foreground hover:text-foreground hover:bg-gray-800/50"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Main
          </Button>
          <h1 className="text-xl font-bold text-foreground">Our Services</h1>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 text-center bg-gradient-to-b from-gray-950/20 to-background">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-foreground glitch" data-text="CYBERSECURITY">
            CYBERSECURITY
          </h1>
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-muted-foreground">
            SOLUTIONS
          </h2>
          <div className="text-xl mb-8 h-8">
            <TypingText 
              text="Comprehensive protection for your digital frontier."
              speed={80}
              className="text-muted-foreground"
            />
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Explore our suite of advanced cybersecurity services designed to safeguard your assets 
            in the ever-evolving digital landscape.
          </p>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-16 px-4 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {serviceCards.map((card, index) => (
          <Card 
            key={index} 
            className="bg-card/50 border border-gray-700 hover:border-green-500 transition-colors duration-300 cursor-pointer"
            onClick={() => navigate(card.link)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-2xl font-bold text-foreground">
                {card.title}
              </CardTitle>
              {card.icon}
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                {card.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
};

export default Services;

