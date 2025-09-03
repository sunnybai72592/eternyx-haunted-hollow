import { useState } from 'react';
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

  const [seoUrl, setSeoUrl] = useState('');
  const [seoKeywords, setSeoKeywords] = useState('');
  const [seoResults, setSeoResults] = useState('');
  const [seoLoading, setSeoLoading] = useState(false);

  const [keywordInput, setKeywordInput] = useState('');
  const [keywordAnalysisResult, setKeywordAnalysisResult] = useState('');

  const [metaTitleInput, setMetaTitleInput] = useState('');
  const [metaDescriptionInput, setMetaDescriptionInput] = useState('');
  const [generatedMetaTags, setGeneratedMetaTags] = useState('');

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

  const analyzeSeo = () => {
    setSeoLoading(true);
    setSeoResults('');
    // Simulate SEO analysis with more details
    setTimeout(() => {
      const keywordInfo = seoKeywords ? `\n- Target Keywords: ${seoKeywords}` : '';
      setSeoResults(`Simulated SEO Analysis for: ${seoUrl}${keywordInfo}\n\n- Title Tag: Present and Optimized (Length: ${Math.floor(Math.random() * (60 - 30) + 30)} chars)\n- Meta Description: Present and Optimized (Length: ${Math.floor(Math.random() * (160 - 120) + 120)} chars)\n- H1 Tag: Present and Unique\n- Keyword Density for '${seoKeywords || 'example'}': ${parseFloat((Math.random() * (3 - 1) + 1).toFixed(2))}% (Good)\n- Mobile-Friendly: Yes\n- Schema Markup: Detected (Product, Article)\n- Core Web Vitals: Good (LCP: 2.1s, FID: 50ms, CLS: 0.05)\n- Backlinks: 150 (Simulated)\n- Domain Authority: 65 (Simulated)`);
      setSeoLoading(false);
    }, 2000);
  };

  const analyzeKeywords = () => {
    if (!keywordInput) {
      setKeywordAnalysisResult('Please enter keywords to analyze.');
      return;
    }
    // Simulate keyword analysis
    setTimeout(() => {
      setKeywordAnalysisResult(`Analysis for '${keywordInput}':\n\n- Search Volume: High (10K-100K/month)\n- Competition: Medium\n- CPC: $1.50 - $3.00\n- Related Keywords: ${keywordInput} best practices, ${keywordInput} tutorial, ${keywordInput} examples, ${keywordInput} tools`);
    }, 1500);
  };

  const generateMetaTags = () => {
    if (!metaTitleInput || !metaDescriptionInput) {
      setGeneratedMetaTags('Please enter both a title and description.');
      return;
    }
    const titleTag = `<title>${metaTitleInput}</title>`;
    const descriptionTag = `<meta name="description" content="${metaDescriptionInput}">`;
    setGeneratedMetaTags(`Generated Meta Tags:\n\n${titleTag}\n${descriptionTag}\n\n<meta property="og:title" content="${metaTitleInput}" />\n<meta property="og:description" content="${metaDescriptionInput}" />\n<meta property="og:type" content="website" />\n<meta name="twitter:card" content="summary_large_image" />\n<meta name="twitter:title" content="${metaTitleInput}" />\n<meta name="twitter:description" content="${metaDescriptionInput}" />`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      <main className="pt-20 sm:pt-24 px-4 max-w-6xl mx-auto responsive-container">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-cyber-blue neon-text responsive-text-5xl">
          Performance Optimization Tools
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto responsive-text-lg mb-8">
          Analyze and optimize your website speed, assets, and SEO.
        </p>

        <Tabs defaultValue="speed-test" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="speed-test">Website Speed Test</TabsTrigger>
            <TabsTrigger value="image-optimizer">Image Optimizer</TabsTrigger>
            <TabsTrigger value="cache-analyzer">Cache Header Analyzer</TabsTrigger>
            <TabsTrigger value="seo-analyzer">SEO Analyzer</TabsTrigger>
            <TabsTrigger value="keyword-analyzer">Keyword Analyzer</TabsTrigger>
            <TabsTrigger value="meta-tag-generator">Meta Tag Generator</TabsTrigger>
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
          <TabsContent value="seo-analyzer" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-primary">SEO Analyzer (Simulated)</h2>
            <Label htmlFor="seo-url">URL to Analyze:</Label>
            <Input
              id="seo-url"
              type="url"
              placeholder="Enter URL to analyze SEO..."
              value={seoUrl}
              onChange={(e) => setSeoUrl(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <Label htmlFor="seo-keywords">Target Keywords (optional, comma-separated):</Label>
            <Input
              id="seo-keywords"
              type="text"
              placeholder="e.g., web development, react, nodejs"
              value={seoKeywords}
              onChange={(e) => setSeoKeywords(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <Button onClick={analyzeSeo} disabled={seoLoading || !seoUrl} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              {seoLoading ? 'Analyzing...' : 'Analyze SEO'}
            </Button>
            {seoResults && (
              <Textarea
                readOnly
                value={seoResults}
                className="bg-input-background border-input-border text-input-foreground min-h-[200px]"
              />
            )}
          </TabsContent>
          <TabsContent value="keyword-analyzer" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-secondary">Keyword Analyzer (Simulated)</h2>
            <Label htmlFor="keyword-input">Enter Keywords (comma-separated):</Label>
            <Input
              id="keyword-input"
              type="text"
              placeholder="e.g., web development, react, nodejs"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <Button onClick={analyzeKeywords} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              Analyze Keywords
            </Button>
            {keywordAnalysisResult && (
              <Textarea
                readOnly
                value={keywordAnalysisResult}
                className="bg-input-background border-input-border text-input-foreground min-h-[200px]"
              />
            )}
          </TabsContent>
          <TabsContent value="meta-tag-generator" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-accent">Meta Tag Generator</h2>
            <Label htmlFor="meta-title-input">Meta Title:</Label>
            <Input
              id="meta-title-input"
              type="text"
              placeholder="Enter meta title (e.g., Best Web Development Tools)"
              value={metaTitleInput}
              onChange={(e) => setMetaTitleInput(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <Label htmlFor="meta-description-input">Meta Description:</Label>
            <Textarea
              id="meta-description-input"
              placeholder="Enter meta description (e.g., Discover the best tools for modern web development...)"
              value={metaDescriptionInput}
              onChange={(e) => setMetaDescriptionInput(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300 min-h-[100px]"
            />
            <Button onClick={generateMetaTags} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              Generate Meta Tags
            </Button>
            {generatedMetaTags && (
              <Textarea
                readOnly
                value={generatedMetaTags}
                className="bg-input-background border-input-border text-input-foreground min-h-[200px]"
              />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}


