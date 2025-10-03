import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TypingText } from '@/components/TypingText';
import { MobileViewport } from '@/components/MobileViewport';
import {
  Shield, Code, Lightbulb, Skull, AlertTriangle, Gem, Eye, Wifi, Database, Cloud, Zap, Brain, Rocket, Cpu, Globe, Smartphone, Server
} from 'lucide-react';

interface ServiceCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  link: string;
  color: string;
}

const ServiceCard: React.FC<ServiceCardProps> = ({ title, description, icon, link, color }) => {
  const navigate = useNavigate();
  return (
    <Card 
      className={`bg-card/50 border border-gray-700 hover:border-${color}-500 transition-colors duration-300 cursor-pointer`}
      onClick={() => navigate(link)}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-2xl font-bold text-foreground">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  );
};

const ServicesHub: React.FC = () => {
  const navigate = useNavigate();

  const cybersecurityServices = [
    {
      title: "Black Hat Pentesting",
      description: "Advanced penetration testing using cutting-edge techniques. We think like attackers to protect your systems from real threats.",
      icon: <Skull className="h-8 w-8 text-green-500" />,
      link: "/black-hat-pentesting",
      color: "green",
    },
    {
      title: "Zero-Day Protection",
      description: "Stay ahead of unknown threats with our proprietary detection systems and real-time threat intelligence feeds.",
      icon: <AlertTriangle className="h-8 w-8 text-yellow-500" />,
      link: "/zero-day-protection",
      color: "yellow",
    },
    {
      title: "Quantum-Ready Encryption",
      description: "Future-proof your data with quantum-resistant encryption algorithms and next-generation security protocols.",
      icon: <Gem className="h-8 w-8 text-purple-500" />,
      link: "/quantum-encryption",
      color: "purple",
    },
    {
      title: "AI-Powered Security",
      description: "Machine learning algorithms that adapt to new threats in real-time, providing predictive security measures.",
      icon: <Eye className="h-8 w-8 text-blue-500" />,
      link: "/ai-powered-security",
      color: "blue",
    },
    {
      title: "Elite Development Team",
      description: "Access to our top-tier developers for mission-critical applications that require the highest security standards.",
      icon: <Code className="h-8 w-8 text-cyan-500" />,
      link: "/elite-development-team",
      color: "cyan",
    },
    {
      title: "24/7 Threat Monitoring",
      description: "Round-the-clock security operations center monitoring your infrastructure with instant threat response.",
      icon: <Wifi className="h-8 w-8 text-red-500" />,
      link: "/threat-monitoring",
      color: "red",
    },
  ];

  const webDevelopmentServices = [
    {
      title: "Frontend Development",
      description: "Modern React, Vue, and Angular applications with responsive design and optimal performance.",
      icon: <Globe className="h-6 w-6 text-blue-400" />,
      link: "/frontend-development",
      color: "blue",
    },
    {
      title: "Backend Development",
      description: "Scalable APIs and microservices using Node.js, Python, and cloud-native architectures.",
      icon: <Database className="h-6 w-6 text-green-400" />,
      link: "/backend-development",
      color: "green",
    },
    {
      title: "Mobile Development",
      description: "Cross-platform mobile apps using React Native and Flutter for iOS and Android.",
      icon: <Smartphone className="h-6 w-6 text-purple-400" />,
      link: "/mobile-development",
      color: "purple",
    },
    {
      title: "Cloud Solutions",
      description: "AWS, Azure, and GCP deployment with containerization and serverless architectures.",
      icon: <Cloud className="h-6 w-6 text-cyan-400" />,
      link: "/cloud-solutions",
      color: "cyan",
    },
    {
      title: "Performance Optimization",
      description: "Speed optimization, SEO enhancement, and performance monitoring for web applications.",
      icon: <Zap className="h-6 w-6 text-yellow-400" />,
      link: "/performance-optimization",
      color: "yellow",
    },
    {
      title: "Custom Solutions",
      description: "Tailored development solutions for unique business requirements and complex challenges.",
      icon: <Code className="h-6 w-6 text-red-400" />,
      link: "/custom-solutions",
      color: "red",
    },
  ];

  const digitalInnovationServices = [
    {
      title: "Artificial Intelligence",
      description: "Advanced AI solutions including machine learning, natural language processing, and computer vision.",
      icon: <Brain className="h-6 w-6 text-yellow-400" />,
      link: "https://openai.com", // External link example
      color: "yellow",
    },
    {
      title: "IoT Solutions",
      description: "Internet of Things implementations for smart homes, cities, and industrial automation.",
      icon: <Cpu className="h-6 w-6 text-purple-400" />,
      link: "https://www.ibm.com/internet-of-things",
      color: "purple",
    },
    {
      title: "AR/VR Development",
      description: "Immersive augmented and virtual reality experiences for training, entertainment, and business.",
      icon: <Eye className="h-6 w-6 text-blue-400" />,
      link: "https://www.oculus.com",
      color: "blue",
    },
    {
      title: "Blockchain Technology",
      description: "Decentralized applications, smart contracts, and cryptocurrency solutions for modern businesses.",
      icon: <Rocket className="h-6 w-6 text-green-400" />,
      link: "https://ethereum.org",
      color: "green",
    },
    {
      title: "Edge Computing",
      description: "Low-latency computing solutions bringing processing power closer to data sources.",
      icon: <Zap className="h-6 w-6 text-red-400" />,
      link: "https://aws.amazon.com/edge/",
      color: "red",
    },
    {
      title: "Innovation Consulting",
      description: "Strategic guidance for digital transformation and emerging technology adoption.",
      icon: <Lightbulb className="h-6 w-6 text-cyan-400" />,
      link: "mailto:consulting@eternyx.com?subject=Innovation Consulting Inquiry",
      color: "cyan",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      
      <main className="pt-20 sm:pt-24">
        {/* Hero Section */}
        <section className="py-12 sm:py-16 md:py-20 px-4 text-center bg-gradient-to-b from-gray-950/20 to-background pt-20 sm:pt-24">
          <div className="max-w-4xl mx-auto responsive-container">
            <h1 className="text-5xl md:text-7xl font-bold mb-6 text-foreground glitch" data-text="ETERNYX SERVICES">
              ETERNYX SERVICES
            </h1>
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-muted-foreground">
              YOUR DIGITAL FRONTIER
            </h2>
            <div className="text-xl mb-8 h-8">
              <TypingText 
                text="Unleashing the power of advanced technology for unparalleled security and innovation."
                speed={80}
                className="text-muted-foreground"
              />
            </div>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From impenetrable cybersecurity to groundbreaking digital innovation, Eternyx provides the tools and expertise to dominate the digital era.
            </p>
          </div>
        </section>

        {/* Cybersecurity Services */}
        <section className="py-16 px-4 max-w-7xl mx-auto">
          <h3 className="text-4xl font-bold text-cyber-cyan neon-text mb-8 text-center">Cybersecurity Arsenal</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {cybersecurityServices.map((card, index) => (
              <ServiceCard key={index} {...card} />
            ))}
          </div>
        </section>

        {/* Web Development Services */}
        <section className="py-16 px-4 max-w-7xl mx-auto">
          <h3 className="text-4xl font-bold text-cyber-blue neon-text mb-8 text-center">Full Stack Development</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {webDevelopmentServices.map((card, index) => (
              <ServiceCard key={index} {...card} />
            ))}
          </div>
        </section>

        {/* Digital Innovation Services */}
        <section className="py-16 px-4 max-w-7xl mx-auto">
          <h3 className="text-4xl font-bold text-cyber-yellow neon-text mb-8 text-center">Digital Innovation Lab</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {digitalInnovationServices.map((card, index) => (
              <ServiceCard key={index} {...card} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default ServicesHub;

