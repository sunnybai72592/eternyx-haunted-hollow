import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TerminalWindow } from "@/components/TerminalWindow";
import { TypingText } from "@/components/TypingText";
import LoadingSpinner from "@/components/LoadingSpinner";
import { 
  Users, 
  ArrowLeft,
  Code,
  Shield,
  Zap,
  Brain,
  Star,
  Award,
  Clock,
  CheckCircle,
  Github,
  Linkedin,
  Mail
} from "lucide-react";

const EliteDevelopmentTeam = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("team");
  const [projectRequest, setProjectRequest] = useState({
    projectType: "",
    description: "",
    timeline: "",
    budget: "",
    requirements: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Elite team members
  const teamMembers = [
    {
      id: 1,
      name: "Alex Chen",
      role: "Lead Security Architect",
      specialties: ["Zero-Day Research", "Cryptography", "Blockchain Security"],
      experience: "12+ years",
      certifications: ["CISSP", "CEH", "OSCP"],
      avatar: "AC",
      projects: 150,
      rating: 4.9
    },
    {
      id: 2,
      name: "Sarah Rodriguez",
      role: "Full-Stack Security Engineer",
      specialties: ["Web Application Security", "DevSecOps", "Cloud Security"],
      experience: "10+ years",
      certifications: ["CISSP", "AWS Security", "GCIH"],
      avatar: "SR",
      projects: 120,
      rating: 4.8
    },
    {
      id: 3,
      name: "Marcus Thompson",
      role: "AI/ML Security Specialist",
      specialties: ["Machine Learning", "AI Security", "Data Protection"],
      experience: "8+ years",
      certifications: ["CISSP", "TensorFlow", "Azure AI"],
      avatar: "MT",
      projects: 95,
      rating: 4.9
    },
    {
      id: 4,
      name: "Elena Volkov",
      role: "Penetration Testing Lead",
      specialties: ["Red Team Operations", "Social Engineering", "Mobile Security"],
      experience: "11+ years",
      certifications: ["OSCP", "OSCE", "GPEN"],
      avatar: "EV",
      projects: 200,
      rating: 5.0
    },
    {
      id: 5,
      name: "David Kim",
      role: "Quantum Security Researcher",
      specialties: ["Quantum Cryptography", "Post-Quantum Algorithms", "Research"],
      experience: "9+ years",
      certifications: ["PhD Cryptography", "CISSP", "Research Publications"],
      avatar: "DK",
      projects: 75,
      rating: 4.8
    },
    {
      id: 6,
      name: "Priya Patel",
      role: "Infrastructure Security Engineer",
      specialties: ["Cloud Security", "Kubernetes", "Infrastructure as Code"],
      experience: "7+ years",
      certifications: ["CKS", "AWS Security", "CISSP"],
      avatar: "PP",
      projects: 110,
      rating: 4.7
    }
  ];

  // Project types and pricing
  const projectTypes = [
    {
      type: "Critical Security Audit",
      description: "Comprehensive security assessment for mission-critical systems",
      duration: "2-4 weeks",
      price: "$50,000 - $150,000",
      features: ["Full penetration testing", "Code review", "Architecture analysis", "Compliance assessment"]
    },
    {
      type: "Custom Security Solution",
      description: "Bespoke security tools and systems development",
      duration: "1-6 months",
      price: "$100,000 - $500,000",
      features: ["Custom development", "Integration", "Training", "Ongoing support"]
    },
    {
      type: "Red Team Engagement",
      description: "Advanced persistent threat simulation",
      duration: "3-8 weeks",
      price: "$75,000 - $200,000",
      features: ["Social engineering", "Physical security", "Network infiltration", "Detailed reporting"]
    },
    {
      type: "Zero-Day Research",
      description: "Vulnerability research and exploit development",
      duration: "2-12 months",
      price: "$200,000 - $1,000,000",
      features: ["Original research", "Proof of concept", "Responsible disclosure", "Mitigation strategies"]
    }
  ];

  const handleProjectRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Reset form
      setProjectRequest({
        projectType: "",
        description: "",
        timeline: "",
        budget: "",
        requirements: ""
      });
      
      alert("Project request submitted successfully! Our team will contact you within 24 hours.");
    } catch (error) {
      alert("Failed to submit request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-green-500/20 bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="text-green-400 hover:text-green-300 hover:bg-green-500/10"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Main
          </Button>
          <div className="flex items-center space-x-2">
            <Users className="h-6 w-6 text-green-500" />
            <h1 className="text-xl font-bold text-green-400">Elite Development Team</h1>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 text-center bg-gradient-to-b from-green-950/20 to-background">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-center mb-6">
            <div className="p-4 rounded-full bg-green-500/10 border border-green-500/20">
              <Users className="h-16 w-16 text-green-500" />
            </div>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-green-400 glitch" data-text="ELITE TEAM">
            ELITE TEAM
          </h1>
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-green-300">
            DEVELOPMENT
          </h2>
          <div className="text-xl mb-8 h-8">
            <TypingText 
              text="Access to our top-tier developers for mission-critical applications"
              speed={80}
              className="text-green-200"
            />
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Our elite team consists of world-class security experts, researchers, and developers 
            who have worked on the most challenging and sensitive projects globally.
          </p>
        </div>
      </section>

      {/* Team Interface */}
      <section className="py-16 px-4 max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-card/50">
            <TabsTrigger value="team" className="data-[state=active]:bg-green-600">
              <Users className="mr-2 h-4 w-4" />
              Team Members
            </TabsTrigger>
            <TabsTrigger value="projects" className="data-[state=active]:bg-green-600">
              <Code className="mr-2 h-4 w-4" />
              Project Types
            </TabsTrigger>
            <TabsTrigger value="request" className="data-[state=active]:bg-green-600">
              <Mail className="mr-2 h-4 w-4" />
              Request Project
            </TabsTrigger>
            <TabsTrigger value="stats" className="data-[state=active]:bg-green-600">
              <Award className="mr-2 h-4 w-4" />
              Team Stats
            </TabsTrigger>
          </TabsList>

          <TabsContent value="team" className="mt-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {teamMembers.map((member) => (
                <Card key={member.id} className="bg-card/50 border-green-500/20 hover:border-green-500/40 transition-all duration-300 hover:scale-105">
                  <CardHeader>
                    <div className="flex items-center space-x-4">
                      <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center text-green-400 font-bold text-lg">
                        {member.avatar}
                      </div>
                      <div>
                        <CardTitle className="text-green-300">{member.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{member.role}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-green-400 mb-2">Specialties:</h4>
                      <div className="flex flex-wrap gap-1">
                        {member.specialties.map((specialty, index) => (
                          <Badge key={index} variant="outline" className="border-green-500 text-green-400 text-xs">
                            {specialty}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Experience:</span>
                        <div className="text-green-400 font-semibold">{member.experience}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Projects:</span>
                        <div className="text-green-400 font-semibold">{member.projects}+</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1">
                        <Star className="h-4 w-4 text-yellow-400 fill-current" />
                        <span className="text-green-400 font-semibold">{member.rating}</span>
                      </div>
                      <div className="flex space-x-2">
                        <Button size="sm" variant="outline" className="border-green-500/20 hover:bg-green-500/10">
                          <Github className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" className="border-green-500/20 hover:bg-green-500/10">
                          <Linkedin className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-green-400 mb-2">Certifications:</h4>
                      <div className="flex flex-wrap gap-1">
                        {member.certifications.map((cert, index) => (
                          <Badge key={index} className="bg-green-600 text-white text-xs">
                            {cert}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="projects" className="mt-6">
            <div className="grid md:grid-cols-2 gap-6">
              {projectTypes.map((project, index) => (
                <Card key={index} className="bg-card/50 border-green-500/20">
                  <CardHeader>
                    <CardTitle className="text-green-400">{project.type}</CardTitle>
                    <p className="text-muted-foreground">{project.description}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center space-x-2 mb-2">
                          <Clock className="h-4 w-4 text-green-400" />
                          <span className="font-semibold">Duration</span>
                        </div>
                        <p className="text-green-400">{project.duration}</p>
                      </div>
                      <div>
                        <div className="flex items-center space-x-2 mb-2">
                          <Zap className="h-4 w-4 text-green-400" />
                          <span className="font-semibold">Investment</span>
                        </div>
                        <p className="text-green-400">{project.price}</p>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-green-400 mb-2">Includes:</h4>
                      <ul className="space-y-1">
                        {project.features.map((feature, featureIndex) => (
                          <li key={featureIndex} className="flex items-center space-x-2 text-sm">
                            <CheckCircle className="h-3 w-3 text-green-400" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="request" className="mt-6">
            <div className="max-w-2xl mx-auto">
              <Card className="bg-card/50 border-green-500/20">
                <CardHeader>
                  <CardTitle className="text-green-400">Request Elite Team Project</CardTitle>
                  <p className="text-muted-foreground">
                    Submit your requirements and our team will provide a custom proposal within 24 hours.
                  </p>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleProjectRequest} className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium mb-2">Project Type:</label>
                      <select
                        value={projectRequest.projectType}
                        onChange={(e) => setProjectRequest(prev => ({ ...prev, projectType: e.target.value }))}
                        className="w-full p-3 bg-background border border-green-500/20 rounded-md text-foreground"
                        required
                      >
                        <option value="">Select project type</option>
                        {projectTypes.map((type, index) => (
                          <option key={index} value={type.type}>{type.type}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Project Description:</label>
                      <Textarea
                        value={projectRequest.description}
                        onChange={(e) => setProjectRequest(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Describe your project requirements, objectives, and any specific challenges..."
                        className="bg-background border-green-500/20 min-h-32"
                        required
                      />
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Timeline:</label>
                        <Input
                          value={projectRequest.timeline}
                          onChange={(e) => setProjectRequest(prev => ({ ...prev, timeline: e.target.value }))}
                          placeholder="e.g., 3 months"
                          className="bg-background border-green-500/20"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Budget Range:</label>
                        <Input
                          value={projectRequest.budget}
                          onChange={(e) => setProjectRequest(prev => ({ ...prev, budget: e.target.value }))}
                          placeholder="e.g., $100k - $500k"
                          className="bg-background border-green-500/20"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Special Requirements:</label>
                      <Textarea
                        value={projectRequest.requirements}
                        onChange={(e) => setProjectRequest(prev => ({ ...prev, requirements: e.target.value }))}
                        placeholder="Security clearance, compliance requirements, specific technologies, etc."
                        className="bg-background border-green-500/20"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full bg-green-600 hover:bg-green-700"
                    >
                      {isSubmitting ? (
                        <LoadingSpinner size="sm" text="Submitting..." />
                      ) : (
                        <>
                          <Mail className="mr-2 h-4 w-4" />
                          Submit Project Request
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="stats" className="mt-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="bg-card/50 border-green-500/20 text-center">
                <CardContent className="pt-6">
                  <div className="text-4xl font-bold text-green-400 mb-2">750+</div>
                  <div className="text-sm text-muted-foreground">Projects Completed</div>
                </CardContent>
              </Card>
              
              <Card className="bg-card/50 border-green-500/20 text-center">
                <CardContent className="pt-6">
                  <div className="text-4xl font-bold text-green-400 mb-2">99.8%</div>
                  <div className="text-sm text-muted-foreground">Success Rate</div>
                </CardContent>
              </Card>
              
              <Card className="bg-card/50 border-green-500/20 text-center">
                <CardContent className="pt-6">
                  <div className="text-4xl font-bold text-green-400 mb-2">4.9</div>
                  <div className="text-sm text-muted-foreground">Average Rating</div>
                </CardContent>
              </Card>
              
              <Card className="bg-card/50 border-green-500/20 text-center">
                <CardContent className="pt-6">
                  <div className="text-4xl font-bold text-green-400 mb-2">24/7</div>
                  <div className="text-sm text-muted-foreground">Support Available</div>
                </CardContent>
              </Card>
            </div>

            <div className="mt-8">
              <TerminalWindow title="team-achievements.log">
                <div className="space-y-2 text-sm">
                  <div className="text-green-400">[2024-08-30] Zero-day vulnerability discovered in major cloud platform</div>
                  <div className="text-green-400">[2024-08-25] Successfully defended Fortune 500 company against APT attack</div>
                  <div className="text-green-400">[2024-08-20] Published research on quantum-resistant cryptography</div>
                  <div className="text-green-400">[2024-08-15] Completed security audit for government agency</div>
                  <div className="text-green-400">[2024-08-10] Developed custom AI-powered threat detection system</div>
                  <div className="text-green-400">[2024-08-05] Led red team exercise for major financial institution</div>
                  <div className="text-green-400">[2024-08-01] Achieved 100% success rate in penetration testing engagements</div>
                </div>
              </TerminalWindow>
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
};

export default EliteDevelopmentTeam;

