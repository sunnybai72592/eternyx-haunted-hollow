-- =============================================
-- 1. Create Private Storage Bucket for Documents
-- =============================================

-- Create the 'documents' storage bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents', 
  'documents', 
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for the documents bucket
CREATE POLICY "Users can upload their own documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can view their own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- =============================================
-- 2. Enable RLS on AI Tables
-- =============================================

-- Enable RLS on ai_documents
ALTER TABLE public.ai_documents ENABLE ROW LEVEL SECURITY;

-- Enable RLS on document_chunks
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- Enable RLS on chat_history
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;

-- Enable RLS on conversation_sessions
ALTER TABLE public.conversation_sessions ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 3. RLS Policies for ai_documents
-- =============================================

-- Users can view their own documents
CREATE POLICY "Users can view their own AI documents"
ON public.ai_documents FOR SELECT
TO authenticated
USING (auth.uid()::text = user_id::text);

-- Users can insert their own documents
CREATE POLICY "Users can insert their own AI documents"
ON public.ai_documents FOR INSERT
TO authenticated
WITH CHECK (auth.uid()::text = user_id::text);

-- Users can update their own documents
CREATE POLICY "Users can update their own AI documents"
ON public.ai_documents FOR UPDATE
TO authenticated
USING (auth.uid()::text = user_id::text);

-- Users can delete their own documents
CREATE POLICY "Users can delete their own AI documents"
ON public.ai_documents FOR DELETE
TO authenticated
USING (auth.uid()::text = user_id::text);

-- =============================================
-- 4. RLS Policies for document_chunks
-- =============================================

-- Users can view chunks from their own documents
CREATE POLICY "Users can view their own document chunks"
ON public.document_chunks FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ai_documents
    WHERE ai_documents.id = document_chunks.document_id
    AND ai_documents.user_id::text = auth.uid()::text
  )
);

-- Users can insert chunks for their own documents
CREATE POLICY "Users can insert chunks for their own documents"
ON public.document_chunks FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ai_documents
    WHERE ai_documents.id = document_chunks.document_id
    AND ai_documents.user_id::text = auth.uid()::text
  )
);

-- Users can delete chunks from their own documents
CREATE POLICY "Users can delete their own document chunks"
ON public.document_chunks FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ai_documents
    WHERE ai_documents.id = document_chunks.document_id
    AND ai_documents.user_id::text = auth.uid()::text
  )
);

-- =============================================
-- 5. RLS Policies for chat_history
-- =============================================

-- Users can view their own chat history
CREATE POLICY "Users can view their own chat history"
ON public.chat_history FOR SELECT
TO authenticated
USING (auth.uid()::text = user_id::text);

-- Users can insert their own chat messages
CREATE POLICY "Users can insert their own chat messages"
ON public.chat_history FOR INSERT
TO authenticated
WITH CHECK (auth.uid()::text = user_id::text);

-- Users can delete their own chat history
CREATE POLICY "Users can delete their own chat history"
ON public.chat_history FOR DELETE
TO authenticated
USING (auth.uid()::text = user_id::text);

-- =============================================
-- 6. RLS Policies for conversation_sessions
-- =============================================

-- Users can view their own sessions
CREATE POLICY "Users can view their own conversation sessions"
ON public.conversation_sessions FOR SELECT
TO authenticated
USING (auth.uid()::text = user_id::text);

-- Users can create their own sessions
CREATE POLICY "Users can insert their own conversation sessions"
ON public.conversation_sessions FOR INSERT
TO authenticated
WITH CHECK (auth.uid()::text = user_id::text);

-- Users can update their own sessions
CREATE POLICY "Users can update their own conversation sessions"
ON public.conversation_sessions FOR UPDATE
TO authenticated
USING (auth.uid()::text = user_id::text);

-- Users can delete their own sessions
CREATE POLICY "Users can delete their own conversation sessions"
ON public.conversation_sessions FOR DELETE
TO authenticated
USING (auth.uid()::text = user_id::text);