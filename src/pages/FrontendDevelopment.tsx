import { useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { MobileViewport } from '@/components/MobileViewport';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function FrontendDevelopment() {
  const [inputCode, setInputCode] = useState('');
  const [formattedCode, setFormattedCode] = useState('');

  const formatCode = () => {
    try {
      // A very basic example: pretty print JSON if it's valid, otherwise just indent
      const parsed = JSON.parse(inputCode);
      setFormattedCode(JSON.stringify(parsed, null, 2));
    } catch (e) {
      // Fallback for non-JSON or invalid JSON: simple indentation
      const lines = inputCode.split('\n');
      const indentedLines = lines.map(line => '  ' + line); // Simple 2-space indent
      setFormattedCode(indentedLines.join('\n'));
    }
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-primary">Code Formatter</h2>
            <Textarea
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
            <h2 className="text-2xl font-bold text-secondary">Formatted Output</h2>
            <Textarea
              readOnly
              value={formattedCode}
              className="bg-input-background border-input-border text-input-foreground min-h-[200px]"
            />
          </div>
        </div>
      </main>
    </div>
  );
}


