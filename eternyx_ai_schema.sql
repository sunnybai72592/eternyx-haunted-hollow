-- Eternyx AI Schema for Supabase/PostgreSQL

-- Enable the pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. AI Documents Table: Stores metadata about uploaded documents (PDFs, Images, etc.)
CREATE TABLE IF NOT EXISTS ai_documents (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    storage_path VARCHAR(255) NOT NULL,
    file_size INTEGER, -- Size in bytes
    file_type VARCHAR(50) NOT NULL, -- 'pdf', 'image', 'text', etc.
    mime_type VARCHAR(100), -- MIME type (e.g., 'application/pdf', 'image/jpeg')
    status VARCHAR(50) DEFAULT 'uploaded', -- 'uploaded', 'processing', 'ready', 'failed'
    error_message TEXT, -- Error details if processing fails
    extracted_text TEXT, -- Raw extracted text (for quick preview)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Document Chunks Table: Stores text chunks and their vector embeddings
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    document_id UUID REFERENCES ai_documents(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL, -- The actual text chunk
    embedding vector(1536), -- OpenAI embedding (1536 dimensions)
    chunk_index INTEGER NOT NULL, -- Order of the chunk in the document
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index on the embedding column for faster similarity search
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 3. Chat History Table: Stores conversation history
CREATE TABLE IF NOT EXISTS chat_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    document_id UUID REFERENCES ai_documents(id) ON DELETE SET NULL, -- Optional: for RAG-specific chats
    role VARCHAR(10) NOT NULL, -- 'user' or 'assistant'
    content TEXT NOT NULL, -- The message content
    tokens_used INTEGER, -- Number of tokens used in this message (for tracking usage)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index for faster chat history retrieval
CREATE INDEX IF NOT EXISTS idx_chat_history_user_created ON chat_history(user_id, created_at DESC);

-- 4. Conversation Sessions Table: Groups related messages into conversations
CREATE TABLE IF NOT EXISTS conversation_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    document_id UUID REFERENCES ai_documents(id) ON DELETE SET NULL, -- Optional: for document-specific conversations
    title VARCHAR(255), -- User-friendly title for the conversation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Update chat_history to include session_id
ALTER TABLE chat_history ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES conversation_sessions(id) ON DELETE CASCADE;

-- Create an index for faster session retrieval
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_user ON conversation_sessions(user_id, created_at DESC);

-- 5. Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at for ai_documents
CREATE TRIGGER update_ai_documents_updated_at
BEFORE UPDATE ON ai_documents
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger to automatically update updated_at for conversation_sessions
CREATE TRIGGER update_conversation_sessions_updated_at
BEFORE UPDATE ON conversation_sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies (to be fully implemented in Supabase)
-- Policy for 'ai_documents': Users can only read/write their own documents
-- Policy for 'document_chunks': Users can only read chunks from their own documents
-- Policy for 'chat_history': Users can only read/write their own chat history
-- Policy for 'conversation_sessions': Users can only read/write their own sessions
