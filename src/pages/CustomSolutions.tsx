import { useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { MobileViewport } from '@/components/MobileViewport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function CustomSolutions() {
  const [keywords, setKeywords] = useState('');
  const [generatedIdea, setGeneratedIdea] = useState('');

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

  const generateIdea = () => {
    const randomIdea = projectIdeas[Math.floor(Math.random() * projectIdeas.length)];
    setGeneratedIdea(`Based on your keywords '${keywords}', consider: ${randomIdea}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      <Navigation />
      <main className="pt-20 sm:pt-24 px-4 max-w-6xl mx-auto responsive-container">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-cyber-blue neon-text responsive-text-5xl">
          Custom Solutions Tools
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto responsive-text-lg mb-8">
          Generate ideas for your next custom project.
        </p>

        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-primary">Project Idea Generator</h2>
          <Input
            type="text"
            placeholder="Enter keywords (e.g., AI, blockchain, mobile app)"
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
        </div>
      </main>
    </div>
  );
}


