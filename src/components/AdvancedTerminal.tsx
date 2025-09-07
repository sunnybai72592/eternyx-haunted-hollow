import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Terminal, Minimize2, Maximize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';

interface TerminalCommand {
  command: string;
  output: string[];
  timestamp: Date;
}

interface AdvancedTerminalProps {
  title?: string;
  className?: string;
  initialCommands?: TerminalCommand[];
  onCommand?: (command: string) => void;
}

const AdvancedTerminal: React.FC<AdvancedTerminalProps> = ({
  title = "ETERNYX-TERMINAL",
  className,
  initialCommands = [],
  onCommand
}) => {
  const { profile } = useAuthStore();
  const [commands, setCommands] = useState<TerminalCommand[]>(initialCommands);
  const [currentInput, setCurrentInput] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [currentPath, setCurrentPath] = useState('/home/eternyx');
  const [isTyping, setIsTyping] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get username for terminal prompt
  const username = profile?.username || profile?.full_name || 'eternyx';

  // Auto-scroll to bottom when new commands are added
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [commands]);

  // Focus input when terminal is clicked
  const handleTerminalClick = () => {
    if (inputRef.current && !isMinimized) {
      inputRef.current.focus();
    }
  };

  // Built-in commands
  const executeCommand = async (cmd: string) => {
    const trimmedCmd = cmd.trim().toLowerCase();
    let output: string[] = [];

    switch (trimmedCmd) {
      case 'help':
        output = [
          'Available commands:',
          '  help          - Show this help message',
          '  clear         - Clear terminal history',
          '  status        - Show system status',
          '  scan          - Run security scan',
          '  matrix        - Enter the matrix',
          '  hack          - Initiate hack sequence',
          '  whoami        - Display current user',
          '  ls            - List directory contents',
          '  pwd           - Print working directory',
          '  date          - Show current date and time',
          '  uptime        - Show system uptime',
          '  ps            - Show running processes',
          '  netstat       - Show network connections',
          '  exit          - Close terminal'
        ];
        break;

      case 'clear':
        setCommands([]);
        return;

      case 'status':
        output = [
          'ETERNYX SYSTEM STATUS',
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          'CPU Usage:        45% [████████░░]',
          'Memory:           68% [██████████]',
          'Network:          ONLINE',
          'Security Level:   MAXIMUM',
          'Firewall:         ACTIVE',
          'Intrusion Det.:   MONITORING',
          'Last Scan:        ' + new Date().toLocaleString(),
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          'Status: ALL SYSTEMS OPERATIONAL'
        ];
        break;

      case 'scan':
        setIsTyping(true);
        output = ['Initiating security scan...'];
        setCommands(prev => [...prev, { command: cmd, output, timestamp: new Date() }]);
        
        // Simulate scanning process
        await new Promise(resolve => setTimeout(resolve, 1000));
        output = [...output, 'Scanning network interfaces...'];
        setCommands(prev => {
          const newCommands = [...prev];
          newCommands[newCommands.length - 1].output = output;
          return newCommands;
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
        output = [...output, 'Checking for vulnerabilities...'];
        setCommands(prev => {
          const newCommands = [...prev];
          newCommands[newCommands.length - 1].output = output;
          return newCommands;
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
        output = [...output, 'Analyzing threat patterns...', 'Scan complete: 0 threats detected', 'System is secure.'];
        setCommands(prev => {
          const newCommands = [...prev];
          newCommands[newCommands.length - 1].output = output;
          return newCommands;
        });
        setIsTyping(false);
        return;

      case 'matrix':
        output = [
          'Entering the Matrix...',
          '01001000 01100101 01101100 01101100 01101111',
          '01010111 01101111 01110010 01101100 01100100',
          'Wake up, Neo...',
          'The Matrix has you...',
          'Follow the white rabbit.'
        ];
        break;

      case 'hack':
        setIsTyping(true);
        output = ['Initiating hack sequence...'];
        setCommands(prev => [...prev, { command: cmd, output, timestamp: new Date() }]);
        
        const hackSteps = [
          'Bypassing firewall...',
          'Cracking encryption...',
          'Accessing mainframe...',
          'Downloading data...',
          'Covering tracks...',
          'Hack complete. Access granted.'
        ];

        for (let i = 0; i < hackSteps.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 800));
          output = [...output, hackSteps[i]];
          setCommands(prev => {
            const newCommands = [...prev];
            newCommands[newCommands.length - 1].output = output;
            return newCommands;
          });
        }
        setIsTyping(false);
        return;

      case 'whoami':
        output = ['eternyx-admin'];
        break;

      case 'ls':
        output = [
          'total 42',
          'drwxr-xr-x  2 eternyx eternyx 4096 Dec 30 12:34 projects/',
          'drwxr-xr-x  2 eternyx eternyx 4096 Dec 30 12:34 security/',
          '-rw-r--r--  1 eternyx eternyx 1337 Dec 30 12:34 secrets.txt',
          '-rwxr-xr-x  1 eternyx eternyx 2048 Dec 30 12:34 hack.sh',
          '-rw-r--r--  1 eternyx eternyx  666 Dec 30 12:34 matrix.dat'
        ];
        break;

      case 'pwd':
        output = [currentPath];
        break;

      case 'date':
        output = [new Date().toString()];
        break;

      case 'uptime':
        const uptime = Math.floor(Math.random() * 100) + 1;
        output = [`System uptime: ${uptime} days, 12:34:56`];
        break;

      case 'ps':
        output = [
          'PID    COMMAND',
          '1      /sbin/init',
          '42     eternyx-daemon',
          '1337   security-monitor',
          '2048   matrix-protocol',
          '9999   hack-detector'
        ];
        break;

      case 'netstat':
        output = [
          'Active Internet connections:',
          'Proto Local Address    Foreign Address    State',
          'tcp   127.0.0.1:8080   0.0.0.0:*         LISTEN',
          'tcp   0.0.0.0:22       0.0.0.0:*         LISTEN',
          'tcp   0.0.0.0:443      0.0.0.0:*         LISTEN'
        ];
        break;

      case 'exit':
        output = ['Connection closed.'];
        break;

      default:
        if (trimmedCmd.startsWith('echo ')) {
          output = [cmd.substring(5)];
        } else {
          output = [`Command not found: ${cmd}`, 'Type "help" for available commands.'];
        }
    }

    setCommands(prev => [...prev, { command: cmd, output, timestamp: new Date() }]);
    
    if (onCommand) {
      onCommand(cmd);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentInput.trim() && !isTyping) {
      executeCommand(currentInput);
      setCurrentInput('');
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour12: false });
  };

  return (
    <Card 
      className={cn(
        "bg-black/90 backdrop-blur-sm border-cyber-green/40 font-mono text-sm transition-all duration-300",
        isMaximized ? "fixed inset-4 z-50" : "",
        isMinimized ? "h-12" : "min-h-96",
        className
      )}
      onClick={handleTerminalClick}
    >
      <CardHeader className="pb-2 border-b border-cyber-green/20">
        <div className="flex items-center justify-between">
          <CardTitle className="text-cyber-green text-sm flex items-center space-x-2">
            <Terminal className="h-4 w-4" />
            <span>{title}</span>
          </CardTitle>
          <div className="flex items-center space-x-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-yellow-400 hover:bg-yellow-400/20"
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(!isMinimized);
              }}
            >
              <Minimize2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-cyber-blue hover:bg-cyber-blue/20"
              onClick={(e) => {
                e.stopPropagation();
                setIsMaximized(!isMaximized);
              }}
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-red-400 hover:bg-red-400/20"
              onClick={(e) => {
                e.stopPropagation();
                // Handle close if needed
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {!isMinimized && (
        <CardContent className="p-4">
          <div 
            ref={terminalRef}
            className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-cyber-green/40 scrollbar-track-transparent"
          >
            {commands.map((cmd, index) => (
              <div key={index} className="space-y-1">
                <div className="flex items-center space-x-2 text-cyber-green">
                  <span className="text-cyber-blue">[{formatTime(cmd.timestamp)}]</span>
                  <span className="text-yellow-400">Eternyx@{username}:</span>
                  <span className="text-purple-400">{currentPath}$</span>
                  <span className="text-white">{cmd.command}</span>
                </div>
                {cmd.output.map((line, lineIndex) => (
                  <div key={lineIndex} className="text-cyber-green/90 pl-4">
                    {line}
                  </div>
                ))}
              </div>
            ))}
            
            {isTyping && (
              <div className="text-cyber-green/90 pl-4 animate-pulse">
                Processing...
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="mt-4">
            <div className="flex items-center space-x-2">
              <span className="text-cyber-blue text-sm">[{formatTime(new Date())}]</span>
              <span className="text-yellow-400 text-sm">Eternyx@{username}:</span>
              <span className="text-purple-400 text-sm">{currentPath}$</span>
              <Input
                ref={inputRef}
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                className="flex-1 bg-transparent border-none text-white font-mono text-sm focus:ring-0 focus:outline-none p-0"
                placeholder="Enter command..."
                disabled={isTyping}
                autoComplete="off"
              />
              <div className="w-2 h-4 bg-cyber-green animate-pulse" />
            </div>
          </form>
        </CardContent>
      )}
    </Card>
  );
};

export default AdvancedTerminal;

