import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Skull,
  AlertTriangle,
  Gem,
  Eye,
  Code,
  Wifi,
  Shield,
  CheckCircle,
  ArrowRight,
  Zap,
  Globe,
  Lock,
  Server,
  Cloud,
  Smartphone,
  Database
} from "lucide-react";

const Services = () => {
  const navigate = useNavigate();

  const services = [
    {
      id: "pentesting",
      title: "Black Hat Pentesting",
      description: "Advanced penetration testing using cutting-edge techniques to identify vulnerabilities before attackers do.",
      icon: <Skull className="h-8 w-8" />,
      color: "green",
      link: "/black-hat-pentesting",
      features: [
        "Network & Infrastructure Testing",
        "Web Application Security",
        "Mobile App Penetration Testing",
        "Social Engineering Assessments",
        "Wireless Security Audits",
        "Physical Security Testing"
      ],
      pricing: "Starting at $5,000",
      duration: "1-4 weeks",
    },
    {
      id: "zero-day",
      title: "Zero-Day Protection",
      description: "Stay ahead of unknown threats with proprietary detection systems and real-time threat intelligence.",
      icon: <AlertTriangle className="h-8 w-8" />,
      color: "yellow",
      link: "/zero-day-protection",
      features: [
        "Real-time Threat Detection",
        "Behavioral Analysis",
        "Automated Patch Management",
        "Threat Intelligence Integration",
        "Incident Response Planning",
        "24/7 Security Monitoring"
      ],
      pricing: "Starting at $8,000/month",
      duration: "Ongoing",
    },
    {
      id: "quantum",
      title: "Quantum-Ready Encryption",
      description: "Future-proof your data with quantum-resistant encryption algorithms and next-generation security protocols.",
      icon: <Gem className="h-8 w-8" />,
      color: "purple",
      link: "/quantum-encryption",
      features: [
        "Post-Quantum Cryptography",
        "Lattice-based Encryption",
        "Code-based Cryptosystems",
        "Multivariate Polynomial Schemes",
        "Hash-based Signatures",
        "Migration Planning"
      ],
      pricing: "Custom Quote",
      duration: "2-6 months",
    },
    {
      id: "ai-security",
      title: "AI-Powered Security",
      description: "Machine learning algorithms that adapt to new threats in real-time, providing predictive security measures.",
      icon: <Eye className="h-8 w-8" />,
      color: "blue",
      link: "/ai-powered-security",
      features: [
        "Anomaly Detection",
        "Predictive Analytics",
        "Automated Threat Hunting",
        "Behavioral Biometrics",
        "Advanced Pattern Recognition",
        "Self-Learning Systems"
      ],
      pricing: "Starting at $12,000/month",
      duration: "Ongoing",
    },
    {
      id: "development",
      title: "Elite Development Team",
      description: "Access top-tier developers for mission-critical applications requiring the highest security standards.",
      icon: <Code className="h-8 w-8" />,
      color: "cyan",
      link: "/elite-development-team",
      features: [
        "Full-Stack Development",
        "DevSecOps Integration",
        "Secure Code Review",
        "CI/CD Pipeline Setup",
        "Microservices Architecture",
        "Cloud-Native Applications"
      ],
      pricing: "Starting at $15,000/month",
      duration: "3-12 months",
    },
    {
      id: "monitoring",
      title: "24/7 Threat Monitoring",
      description: "Round-the-clock security operations center monitoring your infrastructure with instant threat response.",
      icon: <Wifi className="h-8 w-8" />,
      color: "red",
      link: "/threat-monitoring",
      features: [
        "Real-time SIEM Integration",
        "Incident Response Team",
        "Security Analytics Dashboard",
        "Automated Alert Triage",
        "Compliance Reporting",
        "Threat Intelligence Feeds"
      ],
      pricing: "Starting at $10,000/month",
      duration: "Ongoing",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <head>
        <title>Cybersecurity Services | ETERNYX</title>
        <meta name="description" content="Comprehensive cybersecurity solutions including penetration testing, zero-day protection, quantum encryption, AI-powered security, and elite development services." />
      </head>
      
      {/* Hero Section */}
      <section className="relative py-20 px-4 text-center bg-gradient-to-b from-primary/10 via-background to-background overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:50px_50px]" />
        <div className="relative max-w-5xl mx-auto">
          <Badge className="mb-4 bg-primary/20 text-primary border-primary/30">
            <Shield className="h-3 w-3 mr-1" />
            Enterprise-Grade Security
          </Badge>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-primary via-cyan-400 to-purple-400 bg-clip-text text-transparent">
            Cybersecurity Services
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            Comprehensive protection for your digital frontier. From penetration testing to AI-powered threat detection, 
            we provide the tools and expertise to keep you secure.
          </p>
          <div className="flex flex-wrap justify-center gap-4 mb-12">
            <Badge variant="outline" className="border-green-500/50 text-green-400">
              <CheckCircle className="h-3 w-3 mr-1" />
              ISO 27001 Certified
            </Badge>
            <Badge variant="outline" className="border-blue-500/50 text-blue-400">
              <Lock className="h-3 w-3 mr-1" />
              SOC 2 Compliant
            </Badge>
            <Badge variant="outline" className="border-purple-500/50 text-purple-400">
              <Zap className="h-3 w-3 mr-1" />
              24/7 Support
            </Badge>
          </div>
        </div>
      </section>

      {/* Services Tabs */}
      <section className="py-16 px-4 max-w-7xl mx-auto">
        <Tabs defaultValue={services[0].id} className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6 mb-12">
            {services.map((service) => (
              <TabsTrigger key={service.id} value={service.id} className="data-[state=active]:bg-primary/20">
                <div className={`text-${service.color}-400`}>{service.icon}</div>
              </TabsTrigger>
            ))}
          </TabsList>

          {services.map((service) => (
            <TabsContent key={service.id} value={service.id} className="mt-0">
              <div className="grid md:grid-cols-2 gap-8">
                {/* Service Details */}
                <Card className="bg-card/50 border-primary/20 backdrop-blur-sm">
                  <CardHeader>
                    <div className={`inline-flex items-center justify-center w-16 h-16 rounded-xl bg-${service.color}-500/10 text-${service.color}-400 mb-4`}>
                      {service.icon}
                    </div>
                    <CardTitle className="text-3xl">{service.title}</CardTitle>
                    <CardDescription className="text-base">
                      {service.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Key Features</h4>
                      <div className="space-y-2">
                        {service.features.map((feature, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <CheckCircle className={`h-4 w-4 text-${service.color}-400 mt-0.5 flex-shrink-0`} />
                            <span className="text-sm">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Pricing</div>
                        <div className="font-semibold text-primary">{service.pricing}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Duration</div>
                        <div className="font-semibold">{service.duration}</div>
                      </div>
                    </div>
                    
                    <Button 
                      onClick={() => navigate(service.link)} 
                      className="w-full"
                      size="lg"
                    >
                      Learn More <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>

                {/* Why Choose Us */}
                <div className="space-y-6">
                  <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-primary" />
                        Why Choose ETERNYX?
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <Globe className="h-5 w-5 text-cyan-400 mt-0.5" />
                          <div>
                            <div className="font-semibold mb-1">Global Expertise</div>
                            <div className="text-sm text-muted-foreground">
                              Team of certified experts with decades of combined experience
                            </div>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Server className="h-5 w-5 text-green-400 mt-0.5" />
                          <div>
                            <div className="font-semibold mb-1">Enterprise-Grade</div>
                            <div className="text-sm text-muted-foreground">
                              Solutions trusted by Fortune 500 companies worldwide
                            </div>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Cloud className="h-5 w-5 text-purple-400 mt-0.5" />
                          <div>
                            <div className="font-semibold mb-1">Cutting-Edge Tech</div>
                            <div className="text-sm text-muted-foreground">
                              Latest tools and methodologies in cybersecurity
                            </div>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Zap className="h-5 w-5 text-yellow-400 mt-0.5" />
                          <div>
                            <div className="font-semibold mb-1">Rapid Response</div>
                            <div className="text-sm text-muted-foreground">
                              24/7 incident response team ready to act immediately
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-card/30 border-primary/10">
                    <CardHeader>
                      <CardTitle className="text-lg">Additional Services</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button variant="outline" className="w-full justify-start" size="sm">
                        <Smartphone className="h-4 w-4 mr-2" />
                        Mobile Security Audit
                      </Button>
                      <Button variant="outline" className="w-full justify-start" size="sm">
                        <Database className="h-4 w-4 mr-2" />
                        Data Protection Consulting
                      </Button>
                      <Button variant="outline" className="w-full justify-start" size="sm">
                        <Code className="h-4 w-4 mr-2" />
                        Secure Code Training
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </section>
    </div>
  );
};

export default Services;

