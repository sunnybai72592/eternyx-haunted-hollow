import React, { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Download, Copy, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MonacoCodeEditorProps {
  initialCode?: string;
  language?: string;
  theme?: 'vs-dark' | 'vs-light' | 'hc-black';
  height?: string;
}

export const MonacoCodeEditor: React.FC<MonacoCodeEditorProps> = ({
  initialCode = '// Welcome to Monaco Editor\nconsole.log("Hello, World!");',
  language = 'javascript',
  theme = 'vs-dark',
  height = '400px'
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<any>(null);
  const [currentLanguage, setCurrentLanguage] = useState(language);
  const [code, setCode] = useState(initialCode);
  const [output, setOutput] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    // Load Monaco Editor dynamically
    const loadMonaco = async () => {
      try {
        // Import Monaco Editor
        const monaco = await import('monaco-editor');
        
        if (editorRef.current) {
          const editorInstance = monaco.editor.create(editorRef.current, {
            value: initialCode,
            language: currentLanguage,
            theme: theme,
            automaticLayout: true,
            minimap: { enabled: true },
            fontSize: 14,
            lineNumbers: 'on',
            roundedSelection: false,
            scrollBeyondLastLine: false,
            readOnly: false,
            cursorStyle: 'line',
            wordWrap: 'on',
          });

          // Listen for content changes
          editorInstance.onDidChangeModelContent(() => {
            setCode(editorInstance.getValue());
          });

          setEditor(editorInstance);
        }
      } catch (error) {
        console.error('Failed to load Monaco Editor:', error);
        toast({
          title: 'Editor Error',
          description: 'Failed to load Monaco Editor. Using fallback textarea.',
          variant: 'destructive'
        });
      }
    };

    loadMonaco();

    return () => {
      if (editor) {
        editor.dispose();
      }
    };
  }, []);

  useEffect(() => {
    if (editor) {
      try {
        // Import monaco dynamically to access it
        import('monaco-editor').then((monaco) => {
          const model = editor.getModel();
          if (model) {
            monaco.editor.setModelLanguage(model, currentLanguage);
          }
        });
      } catch (error) {
        console.warn('Failed to change language:', error);
      }
    }
  }, [currentLanguage, editor]);

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
            <CardTitle className="text-cyan-400">Monaco Code Editor</CardTitle>
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
            {/* Editor Container */}
            <div 
              ref={editorRef} 
              style={{ height }}
              className="border border-cyan-500/30 rounded-lg overflow-hidden"
            />
            
            {/* Fallback textarea if Monaco fails to load */}
            {!editor && (
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full h-96 bg-gray-800 text-white p-4 rounded-lg border border-cyan-500/30 font-mono text-sm"
                placeholder="Enter your code here..."
              />
            )}

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
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MonacoCodeEditor;

