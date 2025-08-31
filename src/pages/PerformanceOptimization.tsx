import { useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { MobileViewport } from '@/components/MobileViewport';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export default function PerformanceOptimization() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{
    loadTime: number;
    pageSize: number;
    requests: number;
  } | null>(null);

  const runSpeedTest = () => {
    setLoading(true);
    setProgress(0);
    setResults(null);

    // Simulate a network request and performance analysis
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += 10;
      setProgress(currentProgress);
      if (currentProgress >= 100) {
        clearInterval(interval);
        setLoading(false);
        setResults({
          loadTime: parseFloat((Math.random() * (5 - 1) + 1).toFixed(2)), // 1-5 seconds
          pageSize: parseFloat((Math.random() * (3 - 0.5) + 0.5).toFixed(2)), // 0.5-3 MB
          requests: Math.floor(Math.random() * (100 - 20) + 20), // 20-100 requests
        });
      }
    }, 200);
  };

  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      <Navigation />
      <main className="pt-20 sm:pt-24 px-4 max-w-6xl mx-auto responsive-container">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-cyber-blue neon-text responsive-text-5xl">
          Performance Optimization Tools
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto responsive-text-lg mb-8">
          Analyze and optimize your website speed.
        </p>

        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-primary">Website Speed Test</h2>
          <Input
            type="url"
            placeholder="Enter website URL (e.g., https://www.example.com)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
          />
          <Button onClick={runSpeedTest} disabled={loading || !url} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
            {loading ? `Testing... ${progress}%` : 'Run Speed Test'}
          </Button>
          {loading && <Progress value={progress} className="w-full" />}
          {results && (
            <div className="bg-card p-4 rounded-lg border border-border space-y-2">
              <h3 className="text-xl font-bold text-secondary">Results:</h3>
              <p><strong>Load Time:</strong> {results.loadTime} seconds</p>
              <p><strong>Page Size:</strong> {results.pageSize} MB</p>
              <p><strong>Total Requests:</strong> {results.requests}</p>
              <p className="text-sm text-muted-foreground mt-4">
                (These are simulated results for demonstration purposes.)
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}


