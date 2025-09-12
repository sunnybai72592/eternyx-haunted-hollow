import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Play, Download, Copy, Code } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SimpleCodeEditorProps {
  initialCode?: string;
  language?: string;
  height?: string;
}

export const SimpleCodeEditor: React.FC<SimpleCodeEditorProps> = ({
  initialCode = '// Welcome to the Code Editor\nconsole.log("Hello, World!");',
  language = 'javascript',
  height = '400px'
}) => {
  const [currentLanguage, setCurrentLanguage] = useState(language);
  const [code, setCode] = useState(initialCode);
  const [output, setOutput] = useState('');
  const { toast } = useToast();

  const executeCode = () => {
    try {
      if (currentLanguage === 'javascript') {
        // Create a safe execution environment
        const originalLog = console.log;
        let output = '';
        
        console.log = (...args) => {
          output += args.join(' ') + '\n';
        };

        // Execute the code
        const func = new Function(code);
        func();
        
        // Restore console.log
        console.log = originalLog;
        
        setOutput(output || 'Code executed successfully (no output)');
      } else {
        setOutput(`Code execution not supported for ${currentLanguage}. This is a demonstration.`);
      }
      
      toast({
        title: 'Code Executed',
        description: 'Check the output panel below',
      });
    } catch (error) {
      setOutput(`Error: ${error.message}`);
      toast({
        title: 'Execution Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    toast({
      title: 'Copied!',
      description: 'Code copied to clipboard',
    });
  };

  const downloadCode = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code.${getFileExtension(currentLanguage)}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Downloaded!',
      description: 'Code file downloaded successfully',
    });
  };

  const getFileExtension = (lang: string) => {
    const extensions = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      java: 'java',
      cpp: 'cpp',
      csharp: 'cs',
      html: 'html',
      css: 'css',
      json: 'json',
      xml: 'xml',
      sql: 'sql'
    };
    return extensions[lang] || 'txt';
  };

  const languages = [
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'python', label: 'Python' },
    { value: 'java', label: 'Java' },
    { value: 'cpp', label: 'C++' },
    { value: 'csharp', label: 'C#' },
    { value: 'html', label: 'HTML' },
    { value: 'css', label: 'CSS' },
    { value: 'json', label: 'JSON' },
    { value: 'xml', label: 'XML' },
    { value: 'sql', label: 'SQL' }
  ];

  return (
    <div className="w-full space-y-4">
      <Card className="bg-gray-900/50 border-cyan-500/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-cyan-400 flex items-center gap-2">
              <Code className="w-5 h-5" />
              Interactive Code Editor
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={currentLanguage} onValueChange={setCurrentLanguage}>
                <SelectTrigger className="w-40 bg-gray-800 border-cyan-500/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-cyan-500/30">
                  {languages.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Code Editor */}
            <div>
              <Textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="bg-gray-800 text-white border-cyan-500/30 font-mono text-sm resize-none"
                style={{ height }}
                placeholder="Enter your code here..."
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={executeCode}
                className="bg-green-600 hover:bg-green-700"
                disabled={currentLanguage !== 'javascript'}
              >
                <Play className="w-4 h-4 mr-2" />
                Run Code
              </Button>
              <Button
                onClick={copyCode}
                variant="outline"
                className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
              <Button
                onClick={downloadCode}
                variant="outline"
                className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>

            {/* Output Panel */}
            {output && (
              <div className="mt-4">
                <h4 className="text-cyan-400 font-semibold mb-2">Output:</h4>
                <pre className="bg-black/50 p-4 rounded-lg border border-gray-700 text-green-400 font-mono text-sm whitespace-pre-wrap">
                  {output}
                </pre>
              </div>
            )}

            {/* Features Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-gray-800/30 p-3 rounded-lg border border-cyan-500/20">
                <div className="text-cyan-400 font-medium">Language</div>
                <div className="text-white">{languages.find(l => l.value === currentLanguage)?.label}</div>
              </div>
              <div className="bg-gray-800/30 p-3 rounded-lg border border-cyan-500/20">
                <div className="text-cyan-400 font-medium">Lines</div>
                <div className="text-white">{code.split('\n').length}</div>
              </div>
              <div className="bg-gray-800/30 p-3 rounded-lg border border-cyan-500/20">
                <div className="text-cyan-400 font-medium">Characters</div>
                <div className="text-white">{code.length}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SimpleCodeEditor;

