# Eternyx AI Integration Guide

## Overview

**Eternyx AI** is a powerful, general-purpose AI assistant integrated into your ETERNYX platform. It supports:

- **General Chat:** Ask questions and have conversations like ChatGPT
- **PDF Analysis:** Upload and analyze PDF documents with RAG (Retrieval-Augmented Generation)
- **Image OCR:** Upload images and extract text using OpenAI Vision API
- **Document Context:** The AI uses uploaded documents to provide more accurate answers
- **Conversation History:** All chats are saved and can be resumed later

## Technology Stack

| Component | Technology |
| :--- | :--- |
| Frontend | React/TypeScript with Shadcn UI |
| Storage | Supabase Storage (documents bucket) |
| Database | Supabase PostgreSQL with pgvector extension |
| Vector Store | pgvector (1536-dimensional embeddings) |
| Backend | Supabase Edge Functions (Deno) |
| LLM | OpenAI API (gpt-4.1-mini for chat, gpt-4-vision for OCR) |
| Embeddings | OpenAI text-embedding-3-small |

## Database Schema

### Tables Created

1. **ai_documents** - Stores metadata about uploaded PDFs and images
2. **document_chunks** - Stores text chunks with vector embeddings for RAG
3. **chat_history** - Stores all user and AI messages
4. **conversation_sessions** - Groups related messages into conversations

## Deployment Steps

### Step 1: Apply Database Schema

Execute the SQL script in `eternyx_ai_schema.sql` on your Supabase database:

```bash
# Using Supabase CLI
supabase db push --file eternyx_ai_schema.sql

# Or manually copy and paste the SQL into the Supabase SQL Editor
```

**Important:** This script enables the `pgvector` extension, which is required for vector similarity search.

### Step 2: Deploy Edge Functions

Deploy the two new Edge Functions to your Supabase project:

```bash
# Deploy the document processing function
supabase functions deploy process-document --no-verify-jwt

# Deploy the chat function
supabase functions deploy eternyx-ai-chat --no-verify-jwt
```

### Step 3: Create Storage Bucket

Create a new Supabase Storage bucket called `documents`:

1. Go to your Supabase dashboard
2. Navigate to **Storage**
3. Click **Create a new bucket**
4. Name it `documents`
5. Set it to **Private** (users can only access their own files via RLS)

### Step 4: Set Up Row Level Security (RLS)

Enable RLS on the new tables and create policies:

```sql
-- Enable RLS on all new tables
ALTER TABLE ai_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;

-- Policy for ai_documents: Users can only read/write their own documents
CREATE POLICY "Users can manage their own documents"
ON ai_documents
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy for document_chunks: Users can read chunks from their own documents
CREATE POLICY "Users can read chunks from their documents"
ON document_chunks
FOR SELECT
USING (
  document_id IN (
    SELECT id FROM ai_documents WHERE user_id = auth.uid()
  )
);

-- Policy for chat_history: Users can read/write their own chat history
CREATE POLICY "Users can manage their own chat history"
ON chat_history
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy for conversation_sessions: Users can read/write their own sessions
CREATE POLICY "Users can manage their own sessions"
ON conversation_sessions
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

### Step 5: Configure Environment Variables

Ensure your Supabase Edge Functions have access to the OpenAI API key:

```bash
# Set the OpenAI API key as a secret in your Supabase project
supabase secrets set OPENAI_API_KEY="sk-..."
```

### Step 6: Update App Routes

The route `/eternyx-ai` has been added to your application. Users can access it from the main navigation.

## Features

### 1. General Chat

Users can chat with Eternyx AI about any topic, just like ChatGPT. The AI has access to:
- General knowledge (trained data)
- Recent conversation history (for context)
- Uploaded documents (if selected)

### 2. PDF Upload and Analysis

Users can upload PDF files. The system will:
1. Extract text from the PDF
2. Split the text into chunks (500 tokens with 100 token overlap)
3. Generate vector embeddings for each chunk using OpenAI
4. Store the chunks in the database for RAG

When the user asks a question, the system retrieves the most relevant chunks and includes them in the prompt.

### 3. Image Upload and OCR

Users can upload images (JPG, PNG, WebP, GIF). The system will:
1. Send the image to OpenAI Vision API
2. Extract all text from the image
3. Process the extracted text the same way as PDFs (chunking, embedding, storage)

This allows users to analyze screenshots, scanned documents, diagrams with text, etc.

### 4. Conversation Sessions

Each conversation is saved as a session. Users can:
- Start new conversations
- Resume previous conversations
- See a list of all their past conversations
- Associate documents with specific conversations

### 5. Document Management

Users can:
- Upload multiple documents
- See the processing status of each document
- Delete documents they no longer need
- Select which document to use for a specific conversation

## API Endpoints

### POST `/functions/v1/process-document`

Processes an uploaded PDF or image and generates embeddings.

**Request:**
```json
{
  "documentId": "uuid",
  "storagePath": "path/to/file",
  "fileType": "pdf" | "image",
  "mimeType": "application/pdf" | "image/jpeg" | etc.
}
```

**Response:**
```json
{
  "success": true,
  "documentId": "uuid",
  "chunksCreated": 42,
  "extractedTextLength": 15000
}
```

### POST `/functions/v1/eternyx-ai-chat`

Sends a message and gets a response from Eternyx AI.

**Request:**
```json
{
  "message": "What is in this document?",
  "sessionId": "uuid (optional)",
  "documentId": "uuid (optional)",
  "userId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "uuid",
  "response": "The document contains...",
  "contextUsed": true
}
```

## Cost Considerations

The system uses OpenAI APIs, which have associated costs:

1. **Embeddings:** `text-embedding-3-small` (~$0.02 per 1M tokens)
   - Called once per chunk during document processing
   - Called once per user query for similarity search

2. **Chat Completions:** `gpt-4.1-mini` (~$0.15 per 1M input tokens, $0.60 per 1M output tokens)
   - Called for each user message

3. **Vision API:** `gpt-4-vision` (~$0.01 per image for low resolution)
   - Called once per image upload for OCR

**Recommendation:** Monitor usage and consider implementing rate limiting or usage quotas if needed.

## Troubleshooting

### Document Processing Fails

- Check that the OpenAI API key is set correctly
- Ensure the file is a valid PDF or image
- Check Supabase Edge Function logs for detailed error messages

### Chat Responses Are Slow

- This is normal for the first response (embeddings are being generated)
- Subsequent responses should be faster
- Consider implementing response streaming for better UX

### Vector Search Returns No Results

- Ensure the document has been fully processed (status = 'ready')
- Check that the pgvector extension is enabled
- Verify that the embedding vectors were stored correctly

## Future Enhancements

1. **Streaming Responses:** Stream AI responses for better UX
2. **Document Summarization:** Automatically summarize uploaded documents
3. **Multi-language Support:** Support documents in multiple languages
4. **Advanced RAG:** Implement more sophisticated retrieval strategies
5. **Usage Analytics:** Track and display token usage per user
6. **Custom Instructions:** Allow users to set custom system prompts

## Support

For issues or questions, refer to:
- Supabase Documentation: https://supabase.com/docs
- OpenAI API Documentation: https://platform.openai.com/docs
- Your project's GitHub repository for code examples
