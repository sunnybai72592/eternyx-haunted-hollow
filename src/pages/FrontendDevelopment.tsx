import { useState } from 'react';
import { MobileViewport } from '@/components/MobileViewport';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Simple CSS Minifier function
const minifyCss = (css: string) => {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*([{}|:;,])\s*/g, '$1').replace(/;}/g, '}').trim();
};

export default function FrontendDevelopment() {
  const [inputCode, setInputCode] = useState('');
  const [formattedCode, setFormattedCode] = useState('');
  const [inputCss, setInputCss] = useState('');
  const [minifiedCss, setMinifiedCss] = useState('');

  const [componentName, setComponentName] = useState('');
  const [componentType, setComponentType] = useState('functional'); // 'functional' or 'class'
  const [generatedReactComponent, setGeneratedReactComponent] = useState('');

  const [htmlTemplate, setHtmlTemplate] = useState('');
  const [vueTemplate, setVueTemplate] = useState('');

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

  const generateReactComponent = () => {
    if (!componentName) {
      setGeneratedReactComponent('Please enter a component name.');
      return;
    }

    let componentCode = '';
    if (componentType === 'functional') {
      componentCode = `import React, { useState, useEffect } from 'react';\n\ninterface ${componentName}Props {\n  message?: string;\n}\n\nconst ${componentName}: React.FC<${componentName}Props> = ({ message = 'Hello' }) => {\n  const [count, setCount] = useState(0);\n\n  useEffect(() => {\n    console.log('Component mounted or updated');\n  }, [count]);\n\n  return (\n    <div>\n      <h1>{message} from ${componentName}!</h1>\n      <p>Count: {count}</p>\n      <button onClick={() => setCount(prev => prev + 1)}>Increment</button>\n    </div>\n  );\n};\n\nexport default ${componentName};`;
    } else if (componentType === 'class') {
      componentCode = `import React, { Component } from 'react';\n\ninterface ${componentName}Props {\n  message?: string;\n}\n\ninterface ${componentName}State {\n  count: number;\n}\n\nclass ${componentName} extends Component<${componentName}Props, ${componentName}State> {\n  constructor(props: ${componentName}Props) {\n    super(props);\n    this.state = {\n      count: 0,\n    };\n  }\n\n  componentDidMount() {\n    console.log('Component mounted');\n  }\n\n  render() {\n    const { message = 'Hello' } = this.props;\n    const { count } = this.state;\n    return (\n      <div>\n        <h1>{message} from ${componentName}!</h1>\n        <p>Count: {count}</p>\n        <button onClick={() => this.setState(prev => ({ count: prev.count + 1 }))}>Increment</button>\n      </div>\n    );\n  }\n}\n\nexport default ${componentName};`;
    }
    setGeneratedReactComponent(componentCode);
  };

  const convertToVueTemplate = () => {
    if (!htmlTemplate) {
      setVueTemplate('Please enter HTML template.');
      return;
    }
    // More advanced conversion: handle v-bind, v-on, v-if, v-for
    let converted = htmlTemplate.replace(/class=/g, ':class=');
    converted = converted.replace(/for=/g, 'v-for=');
    converted = converted.replace(/<input(.*?)value=(.*?)\/>/g, '<input$1v-model=$2/>');
    converted = converted.replace(/<button(.*?)onClick=(.*?)\/>/g, '<button$1@click=$2/>');
    converted = converted.replace(/<div(.*?)if=(.*?)\/>/g, '<div$1v-if=$2/>');

    converted = `<template>\n${converted}\n</template>\n\n<script lang="ts">\nimport { defineComponent, ref } from 'vue';\n\nexport default defineComponent({
  name: 'MyVueComponent',\n  setup() {\n    const message = ref('Hello Vue!');\n    const count = ref(0);\n\n    const increment = () => {\n      count.value++;\n    };\n\n    return {\n      message,\n      count,\n      increment,\n    };\n  },\n});\n</script>\n\n<style scoped>\n/* Your styles here */\n</style>`;
    setVueTemplate(converted);
  };

  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      <main className="pt-20 sm:pt-24 px-4 max-w-6xl mx-auto responsive-container">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-cyber-blue neon-text responsive-text-5xl">
          Frontend Development Tools
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto responsive-text-lg mb-8">
          Explore useful tools for frontend development.
        </p>

        <Tabs defaultValue="code-formatter" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="code-formatter">Code Formatter</TabsTrigger>
            <TabsTrigger value="css-minifier">CSS Minifier</TabsTrigger>
            <TabsTrigger value="react-component-generator">React Component Generator</TabsTrigger>
            <TabsTrigger value="vue-template-converter">Vue Template Converter</TabsTrigger>
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
          <TabsContent value="react-component-generator" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-primary">React Component Generator</h2>
            <Label htmlFor="component-name">Component Name:</Label>
            <Input
              id="component-name"
              type="text"
              placeholder="e.g., MyButton, UserProfileCard"
              value={componentName}
              onChange={(e) => setComponentName(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <Label htmlFor="component-type">Component Type:</Label>
            <Select value={componentType} onValueChange={setComponentType}>
              <SelectTrigger className="w-full bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300">
                <SelectValue placeholder="Select component type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="functional">Functional Component (Hooks)</SelectItem>
                <SelectItem value="class">Class Component</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={generateReactComponent} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              Generate React Component
            </Button>
            {generatedReactComponent && (
              <Textarea
                readOnly
                value={generatedReactComponent}
                className="bg-input-background border-input-border text-input-foreground min-h-[200px]"
              />
            )}
          </TabsContent>
          <TabsContent value="vue-template-converter" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-primary">Vue Template Converter</h2>
            <Label htmlFor="html-template">Enter HTML Template:</Label>
            <Textarea
              id="html-template"
              placeholder="Enter HTML template to convert to Vue..."
              value={htmlTemplate}
              onChange={(e) => setHtmlTemplate(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300 min-h-[200px]"
            />
            <Button onClick={convertToVueTemplate} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              Convert to Vue Template
            </Button>
            {vueTemplate && (
              <Textarea
                readOnly
                value={vueTemplate}
                className="bg-input-background border-input-border text-input-foreground min-h-[200px]"
              />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}


