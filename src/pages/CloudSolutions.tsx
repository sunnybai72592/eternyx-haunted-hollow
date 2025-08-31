import { useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { MobileViewport } from '@/components/MobileViewport';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function CloudSolutions() {
  const [servers, setServers] = useState(1);
  const [databases, setDatabases] = useState(1);
  const [storageGB, setStorageGB] = useState(100);
  const [estimatedCost, setEstimatedCost] = useState(0);

  const calculateCost = () => {
    // Simple hypothetical cost calculation
    const serverCost = servers * 50; // $50 per server
    const databaseCost = databases * 100; // $100 per database
    const storageCost = storageGB * 0.10; // $0.10 per GB
    setEstimatedCost(serverCost + databaseCost + storageCost);
  };

  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      <Navigation />
      <main className="pt-20 sm:pt-24 px-4 max-w-6xl mx-auto responsive-container">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-cyber-blue neon-text responsive-text-5xl">
          Cloud Solutions Tools
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto responsive-text-lg mb-8">
          Estimate your cloud infrastructure costs.
        </p>

        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-primary">Cloud Cost Estimator</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="servers" className="block text-muted-foreground mb-2">Number of Servers:</label>
              <Input
                id="servers"
                type="number"
                value={servers}
                onChange={(e) => setServers(parseInt(e.target.value) || 0)}
                className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
              />
            </div>
            <div>
              <label htmlFor="databases" className="block text-muted-foreground mb-2">Number of Databases:</label>
              <Input
                id="databases"
                type="number"
                value={databases}
                onChange={(e) => setDatabases(parseInt(e.target.value) || 0)}
                className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
              />
            </div>
            <div>
              <label htmlFor="storage" className="block text-muted-foreground mb-2">Storage (GB):</label>
              <Input
                id="storage"
                type="number"
                value={storageGB}
                onChange={(e) => setStorageGB(parseInt(e.target.value) || 0)}
                className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
              />
            </div>
          </div>
          <Button onClick={calculateCost} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
            Calculate Estimated Cost
          </Button>
          <div className="text-xl font-bold text-center mt-4">
            Estimated Monthly Cost: <span className="text-cyber-green">${estimatedCost.toFixed(2)}</span>
          </div>
        </div>
      </main>
    </div>
  );
}


