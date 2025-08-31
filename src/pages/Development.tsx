import { Navigation } from '@/components/Navigation';
import { MobileViewport } from '@/components/MobileViewport';
import { Button } from '@/components/ui/button';
import { Code, Globe, Smartphone, Database, Cloud, Zap } from 'lucide-react';

export default function Development() {
  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      <Navigation />
      
      <main className="pt-20 sm:pt-24">
        {/* Hero Section */}
        <section className="py-12 sm:py-16 md:py-20 px-4 max-w-6xl mx-auto responsive-container">
          <div className="text-center mb-8 sm:mb-12">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-cyber-blue neon-text responsive-text-5xl">
              ./web_development
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto responsive-text-lg">
              Cutting-edge web development solutions powered by modern frameworks and technologies
            </p>
          </div>
        </section>

        {/* Services Grid */}
        <section className="py-12 px-4 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mobile-grid">
            <div className="mobile-card hover:border-blue-400/40 transition-all duration-300">
              <div className="flex items-center mb-4">
                <Globe className="h-6 w-6 text-blue-400 mr-3" />
                <h3 className="text-lg font-semibold text-blue-400">Frontend Development</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                Modern React, Vue, and Angular applications with responsive design and optimal performance.
              </p>
              <Button variant="outline" size="sm" className="w-full border-blue-400/20 hover:bg-blue-400/10">
                Learn More
              </Button>
            </div>

            <div className="mobile-card hover:border-green-400/40 transition-all duration-300">
              <div className="flex items-center mb-4">
                <Database className="h-6 w-6 text-green-400 mr-3" />
                <h3 className="text-lg font-semibold text-green-400">Backend Development</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                Scalable APIs and microservices using Node.js, Python, and cloud-native architectures.
              </p>
              <Button variant="outline" size="sm" className="w-full border-green-400/20 hover:bg-green-400/10">
                Learn More
              </Button>
            </div>

            <div className="mobile-card hover:border-purple-400/40 transition-all duration-300">
              <div className="flex items-center mb-4">
                <Smartphone className="h-6 w-6 text-purple-400 mr-3" />
                <h3 className="text-lg font-semibold text-purple-400">Mobile Development</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                Cross-platform mobile apps using React Native and Flutter for iOS and Android.
              </p>
              <Button variant="outline" size="sm" className="w-full border-purple-400/20 hover:bg-purple-400/10">
                Learn More
              </Button>
            </div>

            <div className="mobile-card hover:border-cyan-400/40 transition-all duration-300">
              <div className="flex items-center mb-4">
                <Cloud className="h-6 w-6 text-cyan-400 mr-3" />
                <h3 className="text-lg font-semibold text-cyan-400">Cloud Solutions</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                AWS, Azure, and GCP deployment with containerization and serverless architectures.
              </p>
              <Button variant="outline" size="sm" className="w-full border-cyan-400/20 hover:bg-cyan-400/10">
                Learn More
              </Button>
            </div>

            <div className="mobile-card hover:border-yellow-400/40 transition-all duration-300">
              <div className="flex items-center mb-4">
                <Zap className="h-6 w-6 text-yellow-400 mr-3" />
                <h3 className="text-lg font-semibold text-yellow-400">Performance Optimization</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                Speed optimization, SEO enhancement, and performance monitoring for web applications.
              </p>
              <Button variant="outline" size="sm" className="w-full border-yellow-400/20 hover:bg-yellow-400/10">
                Learn More
              </Button>
            </div>

            <div className="mobile-card hover:border-red-400/40 transition-all duration-300">
              <div className="flex items-center mb-4">
                <Code className="h-6 w-6 text-red-400 mr-3" />
                <h3 className="text-lg font-semibold text-red-400">Custom Solutions</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                Tailored development solutions for unique business requirements and complex challenges.
              </p>
              <Button variant="outline" size="sm" className="w-full border-red-400/20 hover:bg-red-400/10">
                Learn More
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

