import { useState } from 'react';
import { MobileViewport } from '@/components/MobileViewport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function CustomSolutions() {
  const [keywords, setKeywords] = useState('');
  const [generatedIdea, setGeneratedIdea] = useState('');

  const [projectType, setProjectType] = useState('');
  const [scale, setScale] = useState('');
  const [techStackRecommendation, setTechStackRecommendation] = useState('');

  const projectIdeas = [
    "An AI-powered personal assistant that integrates with smart home devices.",
    "A blockchain-based supply chain tracking system for ethical sourcing.",
    "A virtual reality platform for remote team collaboration and brainstorming.",
    "A mobile application that uses augmented reality to help users visualize furniture in their homes.",
    "A data analytics dashboard for small businesses to track customer engagement and sales.",
    "A gamified learning platform for cybersecurity education.",
    "An IoT solution for smart agriculture, monitoring soil conditions and automating irrigation.",
    "A natural language processing tool for summarizing long research papers.",
    "A platform for creating and managing personalized fitness plans with AI coaching.",
    "A peer-to-peer marketplace for local artisans to sell their handmade goods."
  ];

  const techStackRecommendations = {
    "web": {
      "small": "Frontend: React/Vue, Backend: Node.js/Express, Database: MongoDB/PostgreSQL",
      "medium": "Frontend: React/Angular, Backend: Node.js/Python (Django/Flask), Database: PostgreSQL/MySQL, Cloud: AWS/Azure",
      "large": "Frontend: React/Angular, Backend: Microservices (Node.js/Go/Java), Database: Polyglot Persistence, Cloud: Kubernetes/Serverless"
    },
    "mobile": {
      "small": "Cross-platform: React Native/Flutter, Backend: Firebase",
      "medium": "Native: Kotlin (Android)/Swift (iOS), Backend: Node.js/Express, Database: PostgreSQL",
      "large": "Native: Kotlin (Android)/Swift (iOS), Backend: Microservices, Cloud: AWS Amplify/Azure Mobile Apps"
    },
    "data": {
      "small": "Python (Pandas/NumPy), Visualization: Matplotlib/Seaborn",
      "medium": "Python (Scikit-learn/TensorFlow), Big Data: Spark/Hadoop, Cloud: Google Cloud AI Platform",
      "large": "Distributed ML: Kubernetes, Data Warehousing: Snowflake/BigQuery, MLOps: Kubeflow"
    }
  };

  const generateIdea = () => {
    const randomIdea = projectIdeas[Math.floor(Math.random() * projectIdeas.length)];
    setGeneratedIdea(`Based on your keywords '${keywords}', consider: ${randomIdea}`);
  };

  const recommendTechStack = () => {
    const type = projectType.toLowerCase();
    const size = scale.toLowerCase();

    if (techStackRecommendations[type] && techStackRecommendations[type][size]) {
      setTechStackRecommendation(techStackRecommendations[type][size]);
    } else {
      setTechStackRecommendation("No specific recommendation found for this combination. Please try 'web', 'mobile', or 'data' for project type and 'small', 'medium', or 'large' for scale.");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      <main className="pt-20 sm:pt-24 px-4 max-w-6xl mx-auto responsive-container">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-cyber-blue neon-text responsive-text-5xl">
          Custom Solutions Tools
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto responsive-text-lg mb-8">
          Generate ideas and get technology recommendations for your custom projects.
        </p>

        <Tabs defaultValue="idea-generator" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="idea-generator">Project Idea Generator</TabsTrigger>
            <TabsTrigger value="tech-stack-recommender">Tech Stack Recommender</TabsTrigger>
          </TabsList>
          <TabsContent value="idea-generator" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-primary">Project Idea Generator</h2>
            <Label htmlFor="keywords">Keywords (e.g., AI, blockchain, mobile app):</Label>
            <Input
              id="keywords"
              type="text"
              placeholder="Enter keywords..."
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <Button onClick={generateIdea} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              Generate Project Idea
            </Button>
            {generatedIdea && (
              <Textarea
                readOnly
                value={generatedIdea}
                className="bg-input-background border-input-border text-input-foreground min-h-[100px]"
              />
            )}
          </TabsContent>
          <TabsContent value="tech-stack-recommender" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-secondary">Technology Stack Recommender</h2>
            <Label htmlFor="project-type">Project Type (e.g., Web, Mobile, Data):</Label>
            <Input
              id="project-type"
              type="text"
              placeholder="Enter project type..."
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <Label htmlFor="scale">Scale (e.g., Small, Medium, Large):</Label>
            <Input
              id="scale"
              type="text"
              placeholder="Enter scale..."
              value={scale}
              onChange={(e) => setScale(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <Button onClick={recommendTechStack} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              Recommend Tech Stack
            </Button>
            {techStackRecommendation && (
              <Textarea
                readOnly
                value={techStackRecommendation}
                className="bg-input-background border-input-border text-input-foreground min-h-[100px]"
              />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}


