import { useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { MobileViewport } from '@/components/MobileViewport';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Simple CSS Minifier function
const minifyCss = (css: string) => {
  return css.replace(/\/\*[\s\S]*?\*\//g, 
'').replace(/\s*([{}|:;,])\s*/g, 
'$1').replace(/;}/g, 
'}').trim();
};

export default function FrontendDevelopment() {
  const [inputCode, setInputCode] = useState('');
  const [formattedCode, setFormattedCode] = useState('');
  const [inputCss, setInputCss] = useState('');
  const [minifiedCss, setMinifiedCss] = useState('');

  const formatCode = () => {
    try {
      // Attempt to pretty print JSON
      const parsed = JSON.parse(inputCode);
      setFormattedCode(JSON.stringify(parsed, null, 2));
    } catch (e) {
      // Fallback for non-JSON or invalid JSON: simple indentation for JS/HTML-like structures
      const lines = inputCode.split('\n');
      let indentLevel = 0;
      const indentedLines = lines.map(line => {
        let trimmedLine = line.trim();
        if (trimmedLine.startsWith('}') || trimmedLine.startsWith('</')) {
          indentLevel = Math.max(0, indentLevel - 1);
        }
        const indented = '  '.repeat(indentLevel) + trimmedLine;
        if (trimmedLine.endsWith('{') || trimmedLine.endsWith('>')) {
          indentLevel++;
        }
        return indented;
      });
      setFormattedCode(indentedLines.join('\n'));
    }
  };

  const handleMinifyCss = () => {
    setMinifiedCss(minifyCss(inputCss));
  };

  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      <Navigation />
      <main className="pt-20 sm:pt-24 px-4 max-w-6xl mx-auto responsive-container">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-cyber-blue neon-text responsive-text-5xl">
          Frontend Development Tools
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto responsive-text-lg mb-8">
          Explore useful tools for frontend development.
        </p>

        <Tabs defaultValue="code-formatter" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="code-formatter">Code Formatter</TabsTrigger>
            <TabsTrigger value="css-minifier">CSS Minifier</TabsTrigger>
          </TabsList>
          <TabsContent value="code-formatter" className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
            <div className="space-y-4">
              <Label htmlFor="input-code">Enter your code here:</Label>
              <Textarea
                id="input-code"
                placeholder="Enter your code here..."
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300 min-h-[200px]"
              />
              <Button onClick={formatCode} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
                Format Code
              </Button>
            </div>
            <div className="space-y-4">
              <Label htmlFor="formatted-code">Formatted Output:</Label>
              <Textarea
                id="formatted-code"
                readOnly
                value={formattedCode}
                className="bg-input-background border-input-border text-input-foreground min-h-[200px]"
              />
            </div>
          </TabsContent>
          <TabsContent value="css-minifier" className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
            <div className="space-y-4">
              <Label htmlFor="input-css">Enter your CSS here:</Label>
              <Textarea
                id="input-css"
                placeholder="Enter your CSS here..."
                value={inputCss}
                onChange={(e) => setInputCss(e.target.value)}
                className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300 min-h-[200px]"
              />
              <Button onClick={handleMinifyCss} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
                Minify CSS
              </Button>
            </div>
            <div className="space-y-4">
              <Label htmlFor="minified-css">Minified Output:</Label>
              <Textarea
                id="minified-css"
                readOnly
                value={minifiedCss}
                className="bg-input-background border-input-border text-input-foreground min-h-[200px]"
              />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}


