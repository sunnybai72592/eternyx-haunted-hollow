import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
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
import { readActiveConversation, rememberConversation } from '@/lib/activeConversation.mjs';

import { readDnsExplanation, clearDnsExplanation } from "@/lib/dnsExplanation";

interface ChatDocumentEvidence {
  segment: number;
  excerpt: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** Returned by the current AI response only; not persisted in chat_history. */
  evidence?: ChatDocumentEvidence[];
  documentContextUsed?: boolean;
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
  const { user: authUser, isLoading: isAuthLoading } = useAuthStore();
  useEffect(() => {
    if (!isAuthLoading && !authUser) navigate('/login?redirect=%2Feternyx-ai', { replace: true });
  }, [authUser, isAuthLoading, navigate]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner variant="cyber" text="Restoring your ETERNYX session..." />
      </div>
    );
  }
  return authUser ? <ChatWorkspace key={authUser.id} userId={authUser.id} /> : null;
};

const ChatWorkspace = ({ userId }: { userId: string }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const token = useLocation().state?.dnsExplanation;
  const [initialPrompt] = useState(() => readDnsExplanation(token, userId));
  const [inputValue, setInputValue] = useState(initialPrompt);
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [chatFilter, setChatFilter] = useState('');
  const [listState, setListState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const listVersion = useRef(0);
  const filterField = useRef<HTMLInputElement>(null);
  const activeTitle = sessions.find(session => session.id === currentSessionId)?.title || 'Chat';
  const visibleSessions = sessions.filter(session => (session.title || 'Untitled chat').toLowerCase().includes(chatFilter.trim().toLowerCase()));
  const historyVersion = useRef(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [sendError, setSendError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadDocuments(userId);
    const remembered = initialPrompt ? null : readActiveConversation(userId);
    const version = historyVersion.current;
    void loadSessions(userId).then(rows => {
      if (!rows || !remembered || historyVersion.current !== version) return;
      const saved = rows.find(session => session.id === remembered);
      if (saved) openConversation(saved);
      else rememberConversation(userId, null);
    });
    return () => { historyVersion.current++; };
  }, [userId, initialPrompt]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messages.length && scrollRef.current) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrollRef.current.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
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
    const version = ++listVersion.current;
    setListState('loading');
    const { data, error } = await supabase
      .from('conversation_sessions')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (version !== listVersion.current) return null;
    if (!error && data) {
      setListState('ready');
      setSessions(data);
      return data as ConversationSession[];
    }
    setListState('failed');
    return null;
  };

  function openConversation(session: ConversationSession) {
    rememberConversation(userId, session.id);
    setCurrentSessionId(session.id);
    setSelectedDocument(session.document_id ?? null);
    void loadSessionMessages(session.id);
  }

  const loadSessionMessages = async (sessionId: string) => {
    const version = ++historyVersion.current;
    setHistoryFailed(false);
    setSendError('');
    setLoadingHistory(true);
    setMessages([]);
    const { data, error } = await supabase
      .from('chat_history')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (version !== historyVersion.current) return;
    setLoadingHistory(false);
    if (error) setHistoryFailed(true);
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
    event.currentTarget.value = '';
    if (!file || !userId) return;

    // Determine file type
    const isPDF = file.type === 'application/pdf';
    const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);

    if (!isPDF && !isImage) {
      toast.error('Choose a PDF, JPEG, PNG, or WebP file.');
      return;
    }

    const maxBytes = isPDF ? 12 * 1024 * 1024 : 6 * 1024 * 1024;
    if (!file.size || file.size > maxBytes) {
      toast.error(isPDF ? 'Choose a PDF up to 12 MiB.' : 'Choose an image up to 6 MiB.');
      return;
    }
    if (isImage && !window.confirm(
      'This image will be uploaded to your account storage and its content sent to an external vision provider for OCR. Provider processing may incur a cost. Continue?',
    )) {
      return; // No upload, OCR request or provider call without explicit consent.
    }

    setUploadingFile(true);
    try {
      // Upload file to Supabase Storage
      const fileName = `${userId}/${crypto.randomUUID()}`;
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('documents')
        .upload(fileName, file, { contentType: file.type });

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

      if (docError) {
        if (docError.code && /^[0-9A-Z]{5}$/.test(docError.code)) {
          await supabase.storage.from('documents').remove([uploadData.path]);
        }
        throw docError;
      }

      // Trigger processing (Edge Function)
      const { data: processed, error: processError } = await supabase.functions.invoke('process-document', {
        body: {
          documentId: docData.id,
          storagePath: uploadData.path,
          fileType,
          mimeType: file.type,
          ocrConsent: isImage,
        },
      });

      if (processError) {
        let detail = 'Document processing could not finish.';
        // The Edge function returns a safe error message for PDF-specific
        // issues (scanned text layer, invalid PDF, timeout and size limit).
        try {
          const body = await processError.context?.json?.();
          if (typeof body?.error === 'string' && body.error.length <= 200) {
            detail = body.error;
          }
        } catch { /* Keep the safe default. */ }
        throw new Error(detail);
      }
      if (processed?.success !== true || processed?.documentId !== docData.id) {
        throw new Error('Document processing has not been confirmed. Check its status before asking questions.');
      }

      toast.success(`${fileType === 'pdf' ? 'PDF text layer' : 'Image text'} is ready to use in chat.`);
    } catch (error) {
      toast.error(`Document preparation failed: ${(error as Error).message}`);
    } finally {
      void loadDocuments(userId);
      setUploadingFile(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !userId || isLoading || loadingHistory || historyFailed) return;

    historyVersion.current++;
    setSendError('');
    const userMessage = inputValue;
    clearDnsExplanation(token);
    setInputValue('');
    setIsLoading(true);
    const pendingMessageId = crypto.randomUUID();

    try {
      // Add user message to UI
      const userMsg: Message = {
        id: pendingMessageId,
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
          requestId: crypto.randomUUID(),
        },
      });

      if (chatError) {
        const status = chatError.context?.status;
        if (status === 402) throw new Error('Your account has insufficient chat credits.');
        if (status === 401) throw new Error('Please sign in again to continue chatting.');
        if (status === 422) throw new Error('No matching text found in this document. Try a more specific question. No AI generation was requested.');
        if (status === 409) throw new Error('This document is not ready or the request needs review. Check its processing status.');
        throw new Error(chatError.message);
      }
      if (typeof data?.response !== 'string' || !data.response.trim() || !data.sessionId) throw new Error('No response from Eternyx AI');

      // Update session ID if new
      if (!currentSessionId) {
        rememberConversation(userId, data.sessionId);
        setCurrentSessionId(data.sessionId);
      }

      // Show only evidence returned for this authenticated document request;
      // never treat model-generated citations as verified source excerpts.
      const returnedEvidence: ChatDocumentEvidence[] =
        selectedDocument && Array.isArray(data.evidence)
          ? data.evidence.filter((value: unknown): value is ChatDocumentEvidence => {
              if (typeof value !== 'object' || value === null) return false;
              const entry = value as Record<string, unknown>;
              return Number.isSafeInteger(entry.segment) &&
                (entry.segment as number) >= 1 && (entry.segment as number) <= 605 &&
                typeof entry.excerpt === 'string' && entry.excerpt.length <= 700;
            }).slice(0, 5)
          : [];
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        ...(selectedDocument ? {
          evidence: returnedEvidence,
          documentContextUsed: data.contextUsed === true,
        } : {}),
      };
      setMessages((prev) => [...prev, aiMsg]);

      // Reload sessions to show updated list
      loadSessions(userId);
    } catch (error) {
      setInputValue(userMessage);
      setMessages((current) => current.filter((item) => item.id !== pendingMessageId));
      setSendError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewConversation = () => {
    setHistoryFailed(false);
    setSendError('');
    rememberConversation(userId, null);
    historyVersion.current++;
    setLoadingHistory(false);
    setMessages([]);
    setCurrentSessionId(null);
    setSelectedDocument(null);
  };

  function exportMessages() {
    const transcript = messages.map(message => {
      const evidence = message.evidence?.length
        ? '\n\nRetrieved document segments (not independent citation checks):\n' +
          message.evidence.map(item => '[Segment ' + item.segment + ']\n' + item.excerpt).join('\n\n')
        : '';
      return (message.role === 'user' ? 'You' : 'Eternyx AI') + '\n' + message.content + evidence;
    }).join('\n\n');
    const url = URL.createObjectURL(new Blob([activeTitle + '\n\n' + transcript + '\n'], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'eternyx-conversation.txt';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const handleDeleteDocument = async (docId: string) => {
    try {
      const { error } = await supabase.from('ai_documents').delete().eq('id', docId);
      if (error) throw error;
      if (selectedDocument === docId) setSelectedDocument(null);
      loadDocuments(userId!);
      toast.success('Document deleted');
    } catch (error) {
      toast.error('Failed to delete document');
    }
  };



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
                  disabled={isLoading}
                  onClick={handleNewConversation}
                  className="w-full bg-gradient-to-r from-cyber-cyan to-cyber-magenta hover:from-cyber-cyan/80 hover:to-cyber-magenta/80 text-black font-semibold gap-2"
                >
                  <Plus className="w-4 h-4" />
                  New Chat
                </Button>

                <div className="space-y-1">
                  <label htmlFor="chat-filter" className="text-sm font-medium">Find a saved chat</label>
                  <div className="flex items-center gap-1">
                    <Input ref={filterField} type="search" id="chat-filter" value={chatFilter} onChange={e => setChatFilter(e.target.value)} placeholder="Search titles" />
                    {chatFilter && <Button variant="ghost" onClick={() => { setChatFilter(''); filterField.current?.focus(); }}>Clear</Button>}
                  </div>
                </div>
                {listState === 'failed' && <div role="alert" className="text-sm">
                  Saved chats could not be refreshed. <Button variant="outline" onClick={() => loadSessions(userId)}>Retry list</Button>
                </div>}
                <p role="status" className="text-sm text-muted-foreground">{listState === 'loading' ? 'Loading saved chats…' :
                  listState === 'ready' ? (sessions.length === 0 ? 'No saved chats yet.' : visibleSessions.length === 0 ? 'No matching chats.' :
                  visibleSessions.length + ' of ' + sessions.length + ' saved chats') : ''}</p>
                <ScrollArea className="h-48 lg:h-96 rounded-lg border border-border/50 p-4">
                  <div className="space-y-2">
                    {visibleSessions.map((session) => (
                      <Button
                        key={session.id}
                        aria-pressed={currentSessionId === session.id}
                        disabled={isLoading}
                        variant={currentSessionId === session.id ? 'default' : 'ghost'}
                        className="w-full justify-start text-left h-auto py-2 px-3"
                        onClick={() => openConversation(session)}
                      >
                        <MessageCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                        <span className="truncate text-sm">{session.title || 'Untitled chat'}</span>
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
                      accept=".pdf,image/jpeg,image/png,image/webp"
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

                  <p className="mb-3 text-xs text-muted-foreground">
                    Text-layer PDFs: up to 12 MiB. Scanned PDFs are not automatically OCR'd.
                    For an authorized scanned page, export it as PNG, JPEG, or WebP (up to 6 MiB) and
                    select that image to run optional vision OCR. You will be asked to confirm
                    external processing and possible provider costs before upload.
                  </p>
                  <ScrollArea className="h-48 lg:h-96 rounded-lg border border-border/50 p-4">
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
                                aria-label={`Delete ${doc.file_name}`}
                                disabled={isLoading}
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
                                disabled={isLoading}
                                onClick={() => {
                                  if (selectedDocument !== doc.id) {
                                    handleNewConversation();
                                    setSelectedDocument(doc.id);
                                  }
                                }}
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="min-w-0 break-words">{activeTitle}</CardTitle>
                  {messages.length > 0 && <Button variant="outline" disabled={isLoading || loadingHistory || historyFailed} onClick={exportMessages}>Download visible messages (.txt)</Button>}
                </div>
                {selectedDocument && (
                  <CardDescription className="flex items-center gap-2 mt-2">
                    <FileText className="w-4 h-4 text-cyber-cyan" />
                    Using {documents.find(doc => doc.id === selectedDocument)?.file_name ?? 'selected document'}
                  </CardDescription>
                )}
              </CardHeader>

              <CardContent className="flex-1 overflow-hidden flex flex-col">
                {/* Messages */}
                <ScrollArea className="flex-1 mb-4 pr-4">
                  <div className="space-y-4">
                    {loadingHistory && <p role="status">Loading conversation history…</p>}
                    {historyFailed && currentSessionId && <div role="alert" className="space-y-2">
                      <p>Conversation history could not be loaded.</p>
                      <Button variant="outline" onClick={() => loadSessionMessages(currentSessionId)}>Retry history</Button>
                    </div>}
                    {!loadingHistory && !historyFailed && messages.length === 0 && (
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
                          <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</p>
                          {msg.role === 'assistant' && msg.documentContextUsed === false && (
                            <p className="mt-2 border-t border-border/40 pt-2 text-xs text-amber-600">
                              No matching document text was retrieved. Do not treat this response as evidence from the uploaded file.
                            </p>
                          )}
                          {msg.role === 'assistant' && !!msg.evidence?.length && (
                            <details className="mt-3 rounded-md border border-border/50 p-2 text-xs">
                              <summary className="cursor-pointer font-semibold">
                                View retrieved document evidence ({msg.evidence.length} segments)
                              </summary>
                              <p className="mt-2 text-muted-foreground">
                                These excerpts come from the selected document, not from model-generated citations.
                                Segment numbers are chunk indices, not verified PDF page numbers.
                                Evidence for previous conversations is not currently retained in chat history.
                              </p>
                              <div className="mt-2 max-h-72 space-y-2 overflow-auto">
                                {msg.evidence.map(item => (
                                  <div key={item.segment} className="rounded border border-border/40 p-2">
                                    <p className="font-semibold">Document segment {item.segment}</p>
                                    <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{item.excerpt}</p>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
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

                {sendError && <p role="alert" className="mb-2 text-sm text-destructive">{sendError} Your draft is ready to edit.</p>}
                {/* Input */}
                <div className="flex gap-2">
                  <Textarea
                    maxLength={4000}
                    aria-label="Message to Eternyx AI"
                    placeholder="Ask Eternyx AI anything..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    disabled={isLoading}
                    className="min-h-12 max-h-24 resize-none"
                  />
                  <Button
                    aria-label="Send message"
                    onClick={handleSendMessage}
                    disabled={isLoading || loadingHistory || historyFailed || !inputValue.trim()}
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
