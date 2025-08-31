import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypingText } from "@/components/TypingText";
import { Badge } from "@/components/ui/badge";import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Code,
  ArrowLeft,
  User,
  Briefcase,
  Mail,
  Github,
  Linkedin,
  FileText,
  Send
} from "lucide-react";

const EliteDevelopmentTeam = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("team");
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: ""
  });

  const teamMembers = [
    {
      id: 1,
      name: "Anya 'Ghost' Petrova",
      role: "Lead Architect, AI Security",
      avatar: "https://i.pravatar.cc/150?img=1",
      bio: "Mastermind behind ETERNYX's adaptive AI defense systems. Specializes in neural network security and predictive threat modeling.",
      skills: ["AI/ML", "Python", "TensorFlow", "Cybernetics", "Threat Intelligence"],
      github: "https://github.com/ghost-anya",
      linkedin: "https://linkedin.com/in/anyapetrova"
    },
    {
      id: 2,
      name: "Jax 'Cipher' Kaito",
      role: "Quantum Cryptographer",
      avatar: "https://i.pravatar.cc/150?img=2",
      bio: "Pioneering post-quantum encryption protocols to safeguard data against future quantum threats. Expert in lattice-based cryptography.",
      skills: ["Cryptography", "Quantum Computing", "C++", "Blockchain", "Secure Communications"],
      github: "https://github.com/cipher-jax",
      linkedin: "https://linkedin.com/in/jaxkaito"
    },
    {
      id: 3,
      name: "Zara 'Spectre' Khan",
      role: "Lead Penetration Tester",
      avatar: "https://i.pravatar.cc/150?img=3",
      bio: "A former black hat turned white hat, Zara excels at uncovering hidden vulnerabilities and exploiting them to fortify defenses. Specializes in web and network penetration.",
      skills: ["Pentesting", "Exploit Dev", "Reverse Engineering", "OSINT", "Red Teaming"],
      github: "https://github.com/spectre-zara",
      linkedin: "https://linkedin.com/in/zarakhan"
    },
    {
      id: 4,
      name: "Ryu 'DataStream' Tanaka",
      role: "Full-Stack Cyber Engineer",
      avatar: "https://i.pravatar.cc/150?img=4",
      bio: "Builds the backbone of ETERNYX's secure infrastructure, from robust backend APIs to intuitive frontend interfaces. Passionate about clean code and scalable solutions.",
      skills: ["React", "Node.js", "Python", "DevOps", "Cloud Security", "Supabase"],
      github: "https://github.com/datastream-ryu",
      linkedin: "https://linkedin.com/in/ryutanaka"
    }
  ];

  const handleContactFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setContactForm(prev => ({ ...prev, [name]: value }));
  };

  const handleContactFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Contact Form Submitted:", contactForm);
    alert("Message sent! Our team will get back to you soon.");
    setContactForm({
      name: "",
      email: "",
      subject: "",
      message: ""
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-blue-500/20 bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Main
          </Button>
          <div className="flex items-center space-x-2">
            <Code className="h-6 w-6 text-blue-500" />
            <h1 className="text-xl font-bold text-blue-400">Elite Development Team</h1>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 text-center bg-gradient-to-b from-blue-950/20 to-background">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-center mb-6">
            <div className="p-4 rounded-full bg-blue-500/10 border border-blue-500/20">
              <Code className="h-16 w-16 text-blue-500" />
            </div>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-blue-400 glitch" data-text="ELITE">
            ELITE
          </h1>
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-blue-300">
            DEVELOPMENT TEAM
          </h2>
          <div className="text-xl mb-8 h-8">
            <TypingText 
              text="Access to our top-tier developers for mission-critical applications"
              speed={80}
              className="text-blue-200"
            />
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Our team of cyber-architects and digital guardians are ready to build and secure 
            your most critical systems against any threat.
          </p>
        </div>
      </section>

      {/* Team Showcase */}
      <section className="py-16 px-4 max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-card/50">
            <TabsTrigger value="team" className="data-[state=active]:bg-blue-600">
              <User className="mr-2 h-4 w-4" />
              Our Cyber-Architects
            </TabsTrigger>
            <TabsTrigger value="contact" className="data-[state=active]:bg-blue-600">
              <Mail className="mr-2 h-4 w-4" />
              Project Inquiry
            </TabsTrigger>
          </TabsList>

          <TabsContent value="team" className="mt-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {teamMembers.map((member) => (
                <Card key={member.id} className="bg-card/50 border-blue-500/20 text-center">
                  <CardContent className="pt-6 flex flex-col items-center">
                    <Avatar className="w-24 h-24 mb-4 border-2 border-blue-500">
                      <AvatarImage src={member.avatar} alt={member.name} />
                      <AvatarFallback>{member.name.split(" ").map(n => n[0]).join("")}</AvatarFallback>
                    </Avatar>
                    <h3 className="text-xl font-bold text-blue-400 mb-1">{member.name}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{member.role}</p>
                    <p className="text-sm text-muted-foreground mb-4">{member.bio}</p>
                    <div className="flex flex-wrap justify-center gap-2 mb-4">
                      {member.skills.map((skill, idx) => (
                        <Badge key={idx} variant="outline" className="border-blue-500/40 text-blue-300">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex space-x-3">
                      {member.github && (
                        <a href={member.github} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                          <Github className="h-6 w-6" />
                        </a>
                      )}
                      {member.linkedin && (
                        <a href={member.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                          <Linkedin className="h-6 w-6" />
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="contact" className="mt-6">
            <Card className="bg-card/50 border-blue-500/20 max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle className="text-blue-400 flex items-center">
                  <Briefcase className="mr-2 h-5 w-5" />
                  Initiate Project Inquiry
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleContactFormSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name" className="text-muted-foreground">Your Name</Label>
                      <Input 
                        id="name" 
                        name="name" 
                        value={contactForm.name} 
                        onChange={handleContactFormChange} 
                        className="bg-background border-blue-500/20"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="email" className="text-muted-foreground">Your Email</Label>
                      <Input 
                        id="email" 
                        name="email" 
                        type="email" 
                        value={contactForm.email} 
                        onChange={handleContactFormChange} 
                        className="bg-background border-blue-500/20"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="subject" className="text-muted-foreground">Subject</Label>
                    <Input 
                      id="subject" 
                      name="subject" 
                      value={contactForm.subject} 
                      onChange={handleContactFormChange} 
                      className="bg-background border-blue-500/20"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="message" className="text-muted-foreground">Project Details</Label>
                    <Textarea 
                      id="message" 
                      name="message" 
                      value={contactForm.message} 
                      onChange={handleContactFormChange} 
                      className="bg-background border-blue-500/20 min-h-[120px]"
                      placeholder="Describe your project, security challenges, or specific needs..."
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
                    <Send className="mr-2 h-4 w-4" />
                    Send Inquiry
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
};

export default EliteDevelopmentTeam;

