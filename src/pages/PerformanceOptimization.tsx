import { useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { MobileViewport } from '@/components/MobileViewport';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function PerformanceOptimization() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{
    loadTime: number;
    pageSize: number;
    requests: number;
  } | null>(null);

  const [imageUrl, setImageUrl] = useState('');
  const [optimizedImageUrl, setOptimizedImageUrl] = useState('');
  const [imageOptimizationLoading, setImageOptimizationLoading] = useState(false);

  const [cacheUrl, setCacheUrl] = useState('');
  const [cacheHeaders, setCacheHeaders] = useState('');
  const [cacheAnalyzerLoading, setCacheAnalyzerLoading] = useState(false);

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

  const optimizeImage = () => {
    setImageOptimizationLoading(true);
    setOptimizedImageUrl('');
    // Simulate image optimization
    setTimeout(() => {
      setOptimizedImageUrl(`https://via.placeholder.com/150x150.png?text=Optimized+${Math.random().toFixed(2)}`);
      setImageOptimizationLoading(false);
    }, 1500);
  };

  const analyzeCacheHeaders = async () => {
    setCacheAnalyzerLoading(true);
    setCacheHeaders('');
    try {
      const res = await fetch(cacheUrl, { method: 'HEAD' });
      let headersString = '';
      res.headers.forEach((value, name) => {
        headersString += `${name}: ${value}\n`;
      });
      setCacheHeaders(headersString || 'No cache headers found.');
    } catch (e: any) {
      setCacheHeaders(`Error fetching headers: ${e.message}`);
    } finally {
      setCacheAnalyzerLoading(false);
    }
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
          Analyze and optimize your website speed and assets.
        </p>

        <Tabs defaultValue="speed-test" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="speed-test">Website Speed Test</TabsTrigger>
            <TabsTrigger value="image-optimizer">Image Optimizer</TabsTrigger>
            <TabsTrigger value="cache-analyzer">Cache Header Analyzer</TabsTrigger>
          </TabsList>
          <TabsContent value="speed-test" className="space-y-4 mt-8">
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
          </TabsContent>
          <TabsContent value="image-optimizer" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-secondary">Image Optimizer</h2>
            <Label htmlFor="image-url">Image URL:</Label>
            <Input
              id="image-url"
              type="url"
              placeholder="Enter image URL (e.g., https://example.com/image.jpg)"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <Button onClick={optimizeImage} disabled={imageOptimizationLoading || !imageUrl} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              {imageOptimizationLoading ? 'Optimizing...' : 'Optimize Image'}
            </Button>
            {optimizedImageUrl && (
              <div className="space-y-2">
                <p className="text-cyber-green">Optimized Image:</p>
                <img src={optimizedImageUrl} alt="Optimized" className="max-w-full h-auto border border-border rounded-md" />
                <p className="text-sm text-muted-foreground">
                  (This is a simulated optimized image.)
                </p>
              </div>
            )}
          </TabsContent>
          <TabsContent value="cache-analyzer" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-accent">Cache Header Analyzer</h2>
            <Label htmlFor="cache-url">URL to Analyze:</Label>
            <Input
              id="cache-url"
              type="url"
              placeholder="Enter URL to analyze cache headers..."
              value={cacheUrl}
              onChange={(e) => setCacheUrl(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <Button onClick={analyzeCacheHeaders} disabled={cacheAnalyzerLoading || !cacheUrl} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              {cacheAnalyzerLoading ? 'Analyzing...' : 'Analyze Headers'}
            </Button>
            {cacheHeaders && (
              <Textarea
                readOnly
                value={cacheHeaders}
                className="bg-input-background border-input-border text-input-foreground min-h-[200px]"
              />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}


