import { Navigation } from '@/components/Navigation';
import { MobileViewport } from '@/components/MobileViewport';
import { Button } from '@/components/ui/button';
import { Lightbulb, Brain, Rocket, Cpu, Eye, Zap } from 'lucide-react';

export default function Innovation() {
  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      <Navigation />
      
      <main className="pt-20 sm:pt-24">
        {/* Hero Section */}
        <section className="py-12 sm:py-16 md:py-20 px-4 max-w-6xl mx-auto responsive-container">
          <div className="text-center mb-8 sm:mb-12">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-cyber-yellow neon-text responsive-text-5xl">
              ./digital_innovation
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto responsive-text-lg">
              Pioneering the future with AI, machine learning, and emerging technologies
            </p>
          </div>
        </section>

        {/* Innovation Areas */}
        <section className="py-12 px-4 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mobile-grid">
            <div className="mobile-card hover:border-yellow-400/40 transition-all duration-300">
              <div className="flex items-center mb-4">
                <Brain className="h-6 w-6 text-yellow-400 mr-3" />
                <h3 className="text-lg font-semibold text-yellow-400">Artificial Intelligence</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                Advanced AI solutions including machine learning, natural language processing, and computer vision.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full border-yellow-400/20 hover:bg-yellow-400/10"
                onClick={() => window.open('https://openai.com', '_blank')}
              >
                Explore AI
              </Button>
            </div>

            <div className="mobile-card hover:border-purple-400/40 transition-all duration-300">
              <div className="flex items-center mb-4">
                <Cpu className="h-6 w-6 text-purple-400 mr-3" />
                <h3 className="text-lg font-semibold text-purple-400">IoT Solutions</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                Internet of Things implementations for smart homes, cities, and industrial automation.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full border-purple-400/20 hover:bg-purple-400/10"
                onClick={() => window.open('https://www.ibm.com/internet-of-things', '_blank')}
              >
                Discover IoT
              </Button>
            </div>

            <div className="mobile-card hover:border-blue-400/40 transition-all duration-300">
              <div className="flex items-center mb-4">
                <Eye className="h-6 w-6 text-blue-400 mr-3" />
                <h3 className="text-lg font-semibold text-blue-400">AR/VR Development</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                Immersive augmented and virtual reality experiences for training, entertainment, and business.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full border-blue-400/20 hover:bg-blue-400/10"
                onClick={() => window.open('https://www.oculus.com', '_blank')}
              >
                Enter VR
              </Button>
            </div>

            <div className="mobile-card hover:border-green-400/40 transition-all duration-300">
              <div className="flex items-center mb-4">
                <Rocket className="h-6 w-6 text-green-400 mr-3" />
                <h3 className="text-lg font-semibold text-green-400">Blockchain Technology</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                Decentralized applications, smart contracts, and cryptocurrency solutions for modern businesses.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full border-green-400/20 hover:bg-green-400/10"
                onClick={() => window.open('https://ethereum.org', '_blank')}
              >
                Explore Blockchain
              </Button>
            </div>

            <div className="mobile-card hover:border-red-400/40 transition-all duration-300">
              <div className="flex items-center mb-4">
                <Zap className="h-6 w-6 text-red-400 mr-3" />
                <h3 className="text-lg font-semibold text-red-400">Edge Computing</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                Low-latency computing solutions bringing processing power closer to data sources.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full border-red-400/20 hover:bg-red-400/10"
                onClick={() => window.open('https://aws.amazon.com/edge/', '_blank')}
              >
                Learn Edge
              </Button>
            </div>

            <div className="mobile-card hover:border-cyan-400/40 transition-all duration-300">
              <div className="flex items-center mb-4">
                <Lightbulb className="h-6 w-6 text-cyan-400 mr-3" />
                <h3 className="text-lg font-semibold text-cyan-400">Innovation Consulting</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                Strategic guidance for digital transformation and emerging technology adoption.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full border-cyan-400/20 hover:bg-cyan-400/10"
                onClick={() => window.location.href = 'mailto:consulting@eternyx.com?subject=Innovation Consulting Inquiry'}
              >
                Get Consulting
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

