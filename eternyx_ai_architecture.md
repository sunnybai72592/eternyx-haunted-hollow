# Eternyx AI Architecture and RAG Implementation Plan

## 1. Overview

The **Eternyx AI** system will be a general-purpose chat assistant integrated into the existing ETERNYX platform. Its key feature will be **Retrieval-Augmented Generation (RAG)**, allowing it to answer questions based on user-uploaded PDF documents.

The architecture leverages the existing Supabase backend for storage, database, and serverless functions (Edge Functions).

## 2. Technology Stack

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | React/TypeScript | User interface for chat and document upload. |
| **Storage** | Supabase Storage | Securely stores user-uploaded PDF files. |
| **Database** | Supabase (PostgreSQL) | Stores chat history, document metadata, and vector embeddings. |
| **Vector Store** | `pg_vector` Extension | Stores and indexes vector embeddings for fast similarity search (RAG). |
| **Backend Logic** | Supabase Edge Functions (Deno) | Handles PDF processing, embedding generation, RAG logic, and LLM API calls. |
| **LLM** | OpenAI API (`gpt-4.1-mini`) | Generates responses for both general chat and RAG-augmented queries. |

## 3. Database Schema Extensions

We will add two new tables to the existing Supabase database:

### `ai_documents` (Document Metadata)

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | Primary Key |
| `user_id` | `UUID` | Foreign Key to `users` table |
| `file_name` | `VARCHAR(255)` | Original name of the uploaded file |
| `storage_path` | `VARCHAR(255)` | Path to the file in Supabase Storage |
| `status` | `VARCHAR(50)` | Processing status: `uploaded`, `processing`, `ready`, `failed` |
| `created_at` | `TIMESTAMP` | Creation timestamp |

### `document_chunks` (Vector Store)

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | Primary Key |
| `document_id` | `UUID` | Foreign Key to `ai_documents` table |
| `content` | `TEXT` | The text chunk extracted from the PDF |
| `embedding` | `VECTOR(1536)` | The vector representation of the content (using OpenAI's embedding model size) |
| `chunk_index` | `INTEGER` | Order of the chunk in the document |

### `chat_history` (Conversation Storage)

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | Primary Key |
| `user_id` | `UUID` | Foreign Key to `users` table |
| `document_id` | `UUID` | Optional Foreign Key to `ai_documents` (for RAG-specific chats) |
| `role` | `VARCHAR(10)` | `user` or `assistant` |
| `content` | `TEXT` | The message content |
| `created_at` | `TIMESTAMP` | Creation timestamp |

## 4. RAG Pipeline Flow

The RAG process is split into two main parts: **Ingestion** and **Query**.

### A. Ingestion Pipeline (Edge Function: `process-document`)

1.  **Upload:** User uploads a PDF via the frontend to a dedicated Supabase Storage bucket.
2.  **Trigger:** A database trigger or direct function call initiates the `process-document` Edge Function.
3.  **Parsing:** The function downloads the PDF and uses a Deno-compatible library (e.g., `pdf-parse`) to extract raw text.
4.  **Chunking:** The raw text is split into smaller, overlapping chunks (e.g., 500 tokens with 100 token overlap).
5.  **Embedding:** Each text chunk is sent to the OpenAI Embedding API to generate a vector (1536 dimensions).
6.  **Storage:** The text chunk and its corresponding vector are stored in the `document_chunks` table.
7.  **Status Update:** The `ai_documents` status is updated to `ready`.

### B. Query Pipeline (Edge Function: `eternyx-ai-chat`)

1.  **User Query:** User sends a message to the `eternyx-ai-chat` endpoint.
2.  **Embedding:** The user's query is sent to the OpenAI Embedding API to generate a query vector.
3.  **Retrieval:** The query vector is used to perform a **vector similarity search** against the `document_chunks` table (using the `pg_vector` extension). The top 3-5 most relevant text chunks are retrieved.
4.  **Prompt Construction:** A system prompt is constructed, including:
    *   Instructions for the AI (e.g., "You are Eternyx AI, a helpful assistant...")
    *   The retrieved context chunks.
    *   The user's current query.
    *   Recent chat history (from `chat_history` table).
5.  **Generation:** The complete prompt is sent to the OpenAI Chat API (`gpt-4.1-mini`).
6.  **Response:** The AI's response is streamed back to the user.
7.  **History:** Both the user's query and the AI's response are saved to the `chat_history` table.

## 5. Next Steps

1.  **Database Implementation:** Add the new tables and enable the `pg_vector` extension.
2.  **Edge Function Development:** Write the Deno code for the two Edge Functions.
3.  **Frontend Development:** Build the chat and upload UI.
4.  **Integration:** Connect the frontend to the new Edge Function APIs.
5.  **Deployment:** Deploy the changes to Supabase.
