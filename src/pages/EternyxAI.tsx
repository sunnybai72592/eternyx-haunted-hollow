import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import LoadingSpinner from '@/components/LoadingSpinner';
import { AlertCircle, Send, Upload, Trash2, FileText, Plus, MessageCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Document {
  id: string;
  file_name: string;
  status: string;
  created_at: string;
}

interface ConversationSession {
  id: string;
  title: string;
  document_id?: string;
  created_at: string;
}

const EternixAI: React.FC = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Check authentication
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        setIsAuthenticated(true);
        loadDocuments(user.id);
        loadSessions(user.id);
      } else {
        setIsAuthenticated(false);
        navigate('/');
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        setIsAuthenticated(true);
        loadDocuments(session.user.id);
        loadSessions(session.user.id);
      } else {
        setIsAuthenticated(false);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [navigate]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const loadDocuments = async (uid: string) => {
    const { data, error } = await supabase
      .from('ai_documents')
      .select('id, file_name, status, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setDocuments(data as Document[]);
    }
  };

  const loadSessions = async (uid: string) => {
    const { data, error } = await supabase
      .from('conversation_sessions')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setSessions(data);
    }
  };

  const loadSessionMessages = async (sessionId: string) => {
    const { data, error } = await supabase
      .from('chat_history')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(
        data.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.created_at),
        }))
      );
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !userId) return;

    // Determine file type
    const isPDF = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');

    if (!isPDF && !isImage) {
      toast.error('Please upload a PDF or image file');
      return;
    }

    setUploadingFile(true);
    try {
      // Upload file to Supabase Storage
      const fileName = `${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Determine file type for database
      const fileType = isPDF ? 'pdf' : 'image';

      // Create document record
      const { data: docData, error: docError } = await supabase
        .from('ai_documents')
        .insert({
          user_id: userId,
          file_name: file.name,
          storage_path: uploadData.path,
          file_size: file.size,
          file_type: fileType,
          mime_type: file.type,
          status: 'uploaded',
        })
        .select()
        .single();

      if (docError) throw docError;

      // Trigger processing (Edge Function)
      const { error: processError } = await supabase.functions.invoke('process-document', {
        body: {
          documentId: docData.id,
          storagePath: uploadData.path,
          fileType,
          mimeType: file.type,
        },
      });

      if (processError) throw new Error(processError.message);

      toast.success(`${fileType === 'pdf' ? 'PDF' : 'Image'} uploaded and processing started!`);
      loadDocuments(userId);
    } catch (error) {
      toast.error(`Upload failed: ${(error as Error).message}`);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !userId || isLoading) return;

    const userMessage = inputValue;
    setInputValue('');
    setIsLoading(true);

    try {
      // Add user message to UI
      const userMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Call the Eternyx AI chat function
      const { data, error: chatError } = await supabase.functions.invoke('eternyx-ai-chat', {
        body: {
          message: userMessage,
          sessionId: currentSessionId,
          documentId: selectedDocument,
          userId,
        },
      });

      if (chatError) throw new Error(chatError.message);
      if (!data) throw new Error('No response from Eternyx AI');

      // Update session ID if new
      if (!currentSessionId) {
        setCurrentSessionId(data.sessionId);
      }

      // Add AI response to UI
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);

      // Reload sessions to show updated list
      loadSessions(userId);
    } catch (error) {
      toast.error(`Error: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    setCurrentSessionId(null);
    setSelectedDocument(null);
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      await supabase.from('ai_documents').delete().eq('id', docId);
      loadDocuments(userId!);
      toast.success('Document deleted');
    } catch (error) {
      toast.error('Failed to delete document');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner variant="cyber" text="Loading Eternyx AI..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-background/50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyber-cyan to-cyber-magenta bg-clip-text text-transparent mb-2">
            Eternyx AI
          </h1>
          <p className="text-muted-foreground">
            Your intelligent assistant powered by advanced AI. Chat, analyze documents, and get instant insights.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Tabs defaultValue="sessions" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="sessions">Chats</TabsTrigger>
                <TabsTrigger value="documents">Docs</TabsTrigger>
              </TabsList>

              {/* Sessions Tab */}
              <TabsContent value="sessions" className="space-y-4">
                <Button
                  onClick={handleNewConversation}
                  className="w-full bg-gradient-to-r from-cyber-cyan to-cyber-magenta hover:from-cyber-cyan/80 hover:to-cyber-magenta/80 text-black font-semibold gap-2"
                >
                  <Plus className="w-4 h-4" />
                  New Chat
                </Button>

                <ScrollArea className="h-96 rounded-lg border border-border/50 p-4">
                  <div className="space-y-2">
                    {sessions.map((session) => (
                      <Button
                        key={session.id}
                        variant={currentSessionId === session.id ? 'default' : 'ghost'}
                        className="w-full justify-start text-left h-auto py-2 px-3"
                        onClick={() => {
                          setCurrentSessionId(session.id);
                          loadSessionMessages(session.id);
                        }}
                      >
                        <MessageCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                        <span className="truncate text-sm">{session.title}</span>
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents" className="space-y-4">
                <div className="space-y-4">
                  <div className="relative">
                    <Input
                      type="file"
                      accept=".pdf,image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleFileUpload}
                      disabled={uploadingFile}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload">
                      <Button
                        asChild
                        className="w-full bg-gradient-to-r from-cyber-cyan to-cyber-magenta hover:from-cyber-cyan/80 hover:to-cyber-magenta/80 text-black font-semibold gap-2 cursor-pointer"
                        disabled={uploadingFile}
                      >
                        <span>
                          <Upload className="w-4 h-4" />
                          {uploadingFile ? 'Uploading...' : 'Upload PDF/Image'}
                        </span>
                      </Button>
                    </label>
                  </div>

                  <ScrollArea className="h-96 rounded-lg border border-border/50 p-4">
                    <div className="space-y-2">
                      {documents.map((doc) => (
                        <Card key={doc.id} className="bg-background/50 border-border/50">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate">{doc.file_name}</p>
                                <Badge
                                  variant="outline"
                                  className={`mt-1 text-xs ${
                                    doc.status === 'ready'
                                      ? 'border-green-500/50 text-green-500'
                                      : doc.status === 'processing'
                                      ? 'border-yellow-500/50 text-yellow-500'
                                      : 'border-red-500/50 text-red-500'
                                  }`}
                                >
                                  {doc.status}
                                </Badge>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteDocument(doc.id)}
                                className="text-red-500 hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                            {doc.status === 'ready' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full mt-2 text-xs border-cyber-cyan/50 text-cyber-cyan hover:bg-cyber-cyan/10"
                                onClick={() => setSelectedDocument(doc.id)}
                              >
                                Use in Chat
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Chat Area */}
          <div className="lg:col-span-3">
            <Card className="h-full bg-background/50 backdrop-blur-sm border-border/50 flex flex-col">
              <CardHeader>
                <CardTitle>Chat</CardTitle>
                {selectedDocument && (
                  <CardDescription className="flex items-center gap-2 mt-2">
                    <FileText className="w-4 h-4 text-cyber-cyan" />
                    Using document context
                  </CardDescription>
                )}
              </CardHeader>

              <CardContent className="flex-1 overflow-hidden flex flex-col">
                {/* Messages */}
                <ScrollArea className="flex-1 mb-4 pr-4">
                  <div className="space-y-4">
                    {messages.length === 0 && (
                      <div className="text-center py-12 text-muted-foreground">
                        <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Start a conversation with Eternyx AI</p>
                        <p className="text-sm mt-2">Upload a document or ask any question</p>
                      </div>
                    )}

                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-xs lg:max-w-md xl:max-w-lg px-4 py-2 rounded-lg ${
                            msg.role === 'user'
                              ? 'bg-gradient-to-r from-cyber-cyan to-cyber-magenta text-black'
                              : 'bg-muted text-foreground border border-border/50'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    ))}

                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="bg-muted text-foreground border border-border/50 px-4 py-2 rounded-lg">
                          <LoadingSpinner variant="cyber" />
                        </div>
                      </div>
                    )}

                    <div ref={scrollRef} />
                  </div>
                </ScrollArea>

                {/* Input */}
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Ask Eternyx AI anything..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    disabled={isLoading}
                    className="min-h-12 max-h-24 resize-none"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={isLoading || !inputValue.trim()}
                    className="bg-gradient-to-r from-cyber-cyan to-cyber-magenta hover:from-cyber-cyan/80 hover:to-cyber-magenta/80 text-black font-semibold"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EternixAI;
