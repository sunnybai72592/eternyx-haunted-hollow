import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Bot, 
  Send, 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Zap,
  Brain,
  Eye,
  Terminal
} from 'lucide-react';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  actionable?: boolean;
}

interface SecurityRecommendation {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  implemented: boolean;
}

export const AISecurityAssistant = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'assistant',
      content: 'ETERNYX AI Security Assistant initialized. I\'m monitoring your systems and ready to provide real-time security recommendations. How can I assist you today?',
      timestamp: new Date(),
      severity: 'low'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const [recommendations] = useState<SecurityRecommendation[]>([
    {
      id: '1',
      title: 'Update SSL Certificate',
      description: 'Your SSL certificate expires in 7 days. Renew immediately to maintain secure connections.',
      severity: 'high',
      category: 'Infrastructure',
      implemented: false
    },
    {
      id: '2',
      title: 'Enable 2FA for Admin Accounts',
      description: 'Admin accounts detected without two-factor authentication. This poses a significant security risk.',
      severity: 'critical',
      category: 'Authentication',
      implemented: false
    },
    {
      id: '3',
      title: 'Patch Detected Vulnerabilities',
      description: '3 medium-severity vulnerabilities found in dependencies. Update packages to latest versions.',
      severity: 'medium',
      category: 'Dependencies',
      implemented: true
    }
  ]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: generateAIResponse(inputValue),
        timestamp: new Date(),
        severity: 'medium',
        actionable: true
      };
      setMessages(prev => [...prev, aiResponse]);
      setIsTyping(false);
    }, 1500);
  };

  const generateAIResponse = (input: string): string => {
    const responses = [
      'Analyzing your security posture... I\'ve detected potential vulnerabilities in your network perimeter. Recommend implementing additional firewall rules.',
      'Threat intelligence indicates increased APT activity in your sector. Suggest enabling enhanced monitoring on critical assets.',
      'Your encryption protocols are quantum-ready. However, I recommend rotating keys every 30 days for optimal security.',
      'Anomalous network traffic detected. Running deep packet inspection... Results show potential data exfiltration attempt blocked.',
      'Security scan complete. Your systems show 97% compliance with NIST framework. Addressing remaining 3% will achieve elite security status.'
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <XCircle className="h-4 w-4 text-red-400" />;
      case 'high': return <AlertTriangle className="h-4 w-4 text-orange-400" />;
      case 'medium': return <Eye className="h-4 w-4 text-yellow-400" />;
      case 'low': return <CheckCircle className="h-4 w-4 text-green-400" />;
      default: return <Shield className="h-4 w-4 text-blue-400" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'border-red-500/50 bg-red-500/10';
      case 'high': return 'border-orange-500/50 bg-orange-500/10';
      case 'medium': return 'border-yellow-500/50 bg-yellow-500/10';
      case 'low': return 'border-green-500/50 bg-green-500/10';
      default: return 'border-blue-500/50 bg-blue-500/10';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      {/* Chat Interface */}
      <div className="lg:col-span-2">
        <Card className="h-[600px] bg-card/50 backdrop-blur-sm border-primary/20 neon-border">
          <div className="p-4 border-b border-primary/20 flex items-center space-x-3">
            <div className="relative">
              <Bot className="h-6 w-6 text-primary animate-pulse" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-ping"></div>
            </div>
            <div>
              <h3 className="font-bold text-primary">ETERNYX AI Assistant</h3>
              <p className="text-xs text-muted-foreground">Neural Security Protocol v2.1</p>
            </div>
            <div className="ml-auto flex items-center space-x-2">
              <Badge variant="outline" className="text-green-400 border-green-400/50">
                <Brain className="h-3 w-3 mr-1" />
                ACTIVE
              </Badge>
            </div>
          </div>

          <ScrollArea className="h-[480px] p-4" ref={scrollAreaRef}>
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-lg ${
                      message.type === 'user'
                        ? 'bg-primary/20 border border-primary/30 text-primary'
                        : `bg-card border ${message.severity ? getSeverityColor(message.severity) : 'border-muted'}`
                    }`}
                  >
                    <div className="flex items-start space-x-2">
                      {message.type === 'assistant' && message.severity && (
                        <div className="mt-1">
                          {getSeverityIcon(message.severity)}
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-sm">{message.content}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {message.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-card border border-muted p-3 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Bot className="h-4 w-4 text-primary animate-pulse" />
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-primary/20">
            <div className="flex space-x-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about security threats, vulnerabilities, or recommendations..."
                className="flex-1 bg-background/50 border-primary/30 focus:border-primary/50"
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isTyping}
                className="bg-primary hover:bg-primary/80 neon-border"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Security Recommendations Panel */}
      <div className="space-y-4">
        <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-4">
          <div className="flex items-center space-x-2 mb-4">
            <Zap className="h-5 w-5 text-yellow-400" />
            <h3 className="font-bold text-primary">Live Recommendations</h3>
          </div>
          
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className={`p-3 rounded-lg border ${getSeverityColor(rec.severity)} transition-all duration-300 hover:scale-105`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {getSeverityIcon(rec.severity)}
                    <span className="text-sm font-medium">{rec.title}</span>
                  </div>
                  {rec.implemented && (
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-2">{rec.description}</p>
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">
                    {rec.category}
                  </Badge>
                  {!rec.implemented && (
                    <Button size="sm" variant="outline" className="text-xs h-6">
                      <Terminal className="h-3 w-3 mr-1" />
                      Fix
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Quick Actions */}
        <Card className="bg-card/50 backdrop-blur-sm border-primary/20 neon-border p-4">
          <h3 className="font-bold text-primary mb-4 flex items-center">
            <Zap className="h-4 w-4 mr-2" />
            Quick Actions
          </h3>
          <div className="space-y-2">
            <Button variant="outline" size="sm" className="w-full justify-start">
              <Shield className="h-4 w-4 mr-2" />
              Run Security Scan
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start">
              <Eye className="h-4 w-4 mr-2" />
              Check Threat Intel
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start">
              <Terminal className="h-4 w-4 mr-2" />
              Generate Report
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AISecurityAssistant;
