export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      workspace_team_spaces: {
        Row: { id: string; owner_id: string; name: string; description: string; status: string; created_at: string; updated_at: string }
        Insert: { id?: string; owner_id: string; name: string; description?: string; status?: string; created_at?: string; updated_at?: string }
        Update: { name?: string; description?: string; status?: string; updated_at?: string }
        Relationships: []
      }
      workspace_team_members: {
        Row: { space_id: string; user_id: string; role: string; joined_at: string }
        Insert: { space_id: string; user_id: string; role: string; joined_at?: string }
        Update: { role?: string }
        Relationships: []
      }
      workspace_team_invites: {
        Row: { id: string; space_id: string; created_by: string; role: string; expires_at: string; created_at: string; revoked_at: string | null; consumed_by: string | null; consumed_at: string | null }
        Insert: { id?: string; space_id: string; created_by: string; role: string; expires_at: string; created_at?: string; revoked_at?: string | null; consumed_by?: string | null; consumed_at?: string | null }
        Update: { revoked_at?: string | null; consumed_by?: string | null; consumed_at?: string | null }
        Relationships: []
      }
      workspace_team_tasks: {
        Row: { id: string; space_id: string; created_by: string; assignee_id: string | null; title: string; details: string; status: string; priority: string; due_on: string | null; completed_at: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; space_id: string; created_by: string; assignee_id?: string | null; title: string; details?: string; status?: string; priority?: string; due_on?: string | null; completed_at?: string | null; created_at?: string; updated_at?: string }
        Update: { assignee_id?: string | null; title?: string; details?: string; status?: string; priority?: string; due_on?: string | null; completed_at?: string | null; updated_at?: string }
        Relationships: []
      }
      workspace_team_task_comments: {
        Row: {
          id:string;space_id:string;task_id:string;author_id:string;
          body:string;created_at:string;redacted_at:string|null;redacted_by:string|null;
        }
        Insert: {
          id?:string;space_id:string;task_id:string;author_id:string;
          body:string;created_at?:string;redacted_at?:string|null;redacted_by?:string|null;
        }
        Update: {body?:string;redacted_at?:string|null;redacted_by?:string|null}
        Relationships: []
      }
      workspace_team_task_steps: {
        Row: {
          id:string;space_id:string;task_id:string;created_by:string;title:string;
          done:boolean;done_by:string|null;completed_at:string|null;
          created_at:string;updated_at:string;
        }
        Insert: {
          id?:string;space_id:string;task_id:string;created_by:string;title:string;
          done?:boolean;done_by?:string|null;completed_at?:string|null;
          created_at?:string;updated_at?:string;
        }
        Update: {
          title?:string;done?:boolean;done_by?:string|null;
          completed_at?:string|null;updated_at?:string;
        }
        Relationships: []
      }
      workspace_team_read_cursors: {
        Row: { space_id: string; user_id: string; last_seen_event_id: number; updated_at: string }
        Insert: { space_id: string; user_id: string; last_seen_event_id?: number; updated_at?: string }
        Update: { last_seen_event_id?: number; updated_at?: string }
        Relationships: []
      }
      workspace_team_events: {
        Row: { id: number; space_id: string; actor_id: string; entity_id: string; event_type: string; created_at: string }
        Insert: { space_id: string; actor_id: string; entity_id: string; event_type: string; id?: number; created_at?: string }
        Update: {}
        Relationships: []
      }
      workspace_reconciliation_receipts: {
        Row: {
          id: string; owner_id: string; source_session_id: string;
          source_project_id: string; source_sha256: string;
          snapshot_sha256: string; archive_sha256: string; payload_sha256: string;
          source_tasks: number; current_tasks: number;
          source_items: number; current_items: number;
          checklist_steps: number; excluded_files: number;
          event_type: string; created_at: string;
        }
        Insert: {
          id?: string; owner_id: string; source_session_id: string;
          source_project_id: string; source_sha256: string;
          snapshot_sha256: string; archive_sha256: string; payload_sha256: string;
          source_tasks: number; current_tasks: number;
          source_items: number; current_items: number;
          checklist_steps: number; excluded_files: number;
          event_type?: string; created_at?: string;
        }
        Update: {
          id?: string; owner_id?: string; source_session_id?: string;
          source_project_id?: string; source_sha256?: string;
          snapshot_sha256?: string; archive_sha256?: string; payload_sha256?: string;
          source_tasks?: number; current_tasks?: number;
          source_items?: number; current_items?: number;
          checklist_steps?: number; excluded_files?: number;
          event_type?: string; created_at?: string;
        }
        Relationships: []
      }
      workspace_import_sessions: {
        Row: { id: string; owner_id: string; project_id: string; source_sha256: string;
          source_version: number; expected_tasks: number; expected_steps: number;
          expected_items: number; expected_files: number; status: string; baseline_signature: string | null; checkpoint_at: string | null;
          held_at: string | null; hold_reason: string;
          created_at: string; updated_at: string }
        Insert: { id?: string; owner_id: string; project_id: string; source_sha256: string;
          source_version: number; expected_tasks: number; expected_steps: number;
          expected_items: number; expected_files: number; status?: string;
          baseline_signature?: string | null; checkpoint_at?: string | null;
          held_at?: string | null; hold_reason?: string;
          created_at?: string; updated_at?: string }
        Update: { id?: string; owner_id?: string; project_id?: string; source_sha256?: string;
          source_version?: number; expected_tasks?: number; expected_steps?: number;
          expected_items?: number; expected_files?: number; status?: string;
          baseline_signature?: string | null; checkpoint_at?: string | null;
          held_at?: string | null; hold_reason?: string;
          created_at?: string; updated_at?: string }
        Relationships: []
      }
      workspace_import_batches: {
        Row: { session_id: string; phase: string; batch_index: number;
          payload_md5: string; row_count: number; step_count: number; created_at: string }
        Insert: { session_id: string; phase: string; batch_index: number;
          payload_md5: string; row_count: number; step_count?: number; created_at?: string }
        Update: { session_id?: string; phase?: string; batch_index?: number;
          payload_md5?: string; row_count?: number; step_count?: number; created_at?: string }
        Relationships: []
      }
      workspace_import_files: {
        Row: { session_id: string; file_index: number; title: string; size_bytes: number;
          mime_type: string; sha256: string; storage_path: string;
          registered: boolean; created_at: string }
        Insert: { session_id: string; file_index: number; title: string; size_bytes: number;
          mime_type: string; sha256: string; storage_path: string;
          registered?: boolean; created_at?: string }
        Update: { session_id?: string; file_index?: number; title?: string; size_bytes?: number;
          mime_type?: string; sha256?: string; storage_path?: string;
          registered?: boolean; created_at?: string }
        Relationships: []
      }
      workspace_projects: {
        Row: { id: string; owner_id: string; name: string; description: string; status: string; pinned: boolean; created_at: string; updated_at: string }
        Insert: { id?: string; owner_id: string; name: string; description?: string; status?: string; pinned?: boolean; created_at?: string; updated_at?: string }
        Update: { id?: string; owner_id?: string; name?: string; description?: string; status?: string; pinned?: boolean; created_at?: string; updated_at?: string }
        Relationships: []
      }
      workspace_tasks: {
        Row: { id: string; owner_id: string; project_id: string; title: string; status: string; priority: string; details: string; completed_at: string | null; due_on: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; owner_id: string; project_id: string; title: string; status?: string; priority?: string; details?: string; completed_at?: string | null; due_on?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; owner_id?: string; project_id?: string; title?: string; status?: string; priority?: string; details?: string; completed_at?: string | null; due_on?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      workspace_task_steps: {
        Row: { id: string; task_id: string; owner_id: string; title: string; done: boolean; created_at: string; updated_at: string }
        Insert: { id?: string; task_id: string; owner_id: string; title: string; done?: boolean; created_at?: string; updated_at?: string }
        Update: { id?: string; task_id?: string; owner_id?: string; title?: string; done?: boolean; created_at?: string; updated_at?: string }
        Relationships: []
      }
      workspace_items: {
        Row: { id: string; owner_id: string; project_id: string; kind: string; title: string; note_text: string | null; target_url: string | null; storage_path: string | null; file_size: number | null; mime_type: string | null; created_at: string; updated_at: string; revision: number }
        Insert: { id?: string; owner_id: string; project_id: string; kind: string; title: string; note_text?: string | null; target_url?: string | null; storage_path?: string | null; file_size?: number | null; mime_type?: string | null; created_at?: string; updated_at?: string; revision?: number }
        Update: { id?: string; owner_id?: string; project_id?: string; kind?: string; title?: string; note_text?: string | null; target_url?: string | null; storage_path?: string | null; file_size?: number | null; mime_type?: string | null; created_at?: string; updated_at?: string; revision?: number }
        Relationships: []
      }
      workspace_item_revisions: {
        Row: { id: string; item_id: string; owner_id: string; project_id: string; revision: number; kind: string; title: string; note_text: string | null; target_url: string | null; saved_at: string }
        Insert: { id?: string; item_id: string; owner_id: string; project_id: string; revision: number; kind: string; title: string; note_text?: string | null; target_url?: string | null; saved_at?: string }
        Update: { id?: string; item_id?: string; owner_id?: string; project_id?: string; revision?: number; kind?: string; title?: string; note_text?: string | null; target_url?: string | null; saved_at?: string }
        Relationships: []
      }
      workspace_activity: {
        Row: { id: number; owner_id: string; project_id: string; entity_id: string; event_type: string; created_at: string }
        Insert: { id?: number; owner_id: string; project_id: string; entity_id: string; event_type: string; created_at?: string }
        Update: { id?: number; owner_id?: string; project_id?: string; entity_id?: string; event_type?: string; created_at?: string }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_documents: {
        Row: {
          created_at: string | null
          error_message: string | null
          extracted_text: string | null
          file_name: string
          file_size: number | null
          file_type: string
          id: string
          mime_type: string | null
          status: string | null
          storage_path: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          extracted_text?: string | null
          file_name: string
          file_size?: number | null
          file_type: string
          id?: string
          mime_type?: string | null
          status?: string | null
          storage_path: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          extracted_text?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          id?: string
          mime_type?: string | null
          status?: string | null
          storage_path?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_security_analysis: {
        Row: {
          analysis_type: string
          confidence_score: number | null
          created_at: string | null
          id: string
          input_data: Json
          model_version: string | null
          processing_time: number | null
          results: Json
          user_id: string | null
        }
        Insert: {
          analysis_type: string
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          input_data: Json
          model_version?: string | null
          processing_time?: number | null
          results: Json
          user_id?: string | null
        }
        Update: {
          analysis_type?: string
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          input_data?: Json
          model_version?: string | null
          processing_time?: number | null
          results?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_security_analysis_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          api_key_encrypted: string
          created_at: string | null
          id: string
          is_active: boolean | null
          last_used: string | null
          service_name: string
          user_id: string | null
        }
        Insert: {
          api_key_encrypted: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used?: string | null
          service_name: string
          user_id?: string | null
        }
        Update: {
          api_key_encrypted?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used?: string | null
          service_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: unknown
          resource_id: string | null
          resource_type: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          current_period_end: string | null
          plan_id: string | null
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          plan_id?: string | null
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          plan_id?: string | null
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author_id: string | null
          category: string
          content: string
          created_at: string
          excerpt: string | null
          featured_image: string | null
          id: string
          is_published: boolean | null
          published_at: string | null
          slug: string
          tags: string[] | null
          title: string
          updated_at: string
          view_count: number | null
        }
        Insert: {
          author_id?: string | null
          category: string
          content: string
          created_at?: string
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          is_published?: boolean | null
          published_at?: string | null
          slug: string
          tags?: string[] | null
          title: string
          updated_at?: string
          view_count?: number | null
        }
        Update: {
          author_id?: string | null
          category?: string
          content?: string
          created_at?: string
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          is_published?: boolean | null
          published_at?: string | null
          slug?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          view_count?: number | null
        }
        Relationships: []
      }
      bug_reports: {
        Row: {
          created_at: string
          description: string
          id: string
          severity: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          severity?: string
          status?: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          severity?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      service_request_activity: {
        Row: {
          id: string
          request_id: string
          actor_id: string | null
          event_type: string
          body: string | null
          from_status: string | null
          to_status: string | null
          created_at: string
        }
        Insert: {
          id?: string
          request_id: string
          actor_id?: string | null
          event_type: string
          body?: string | null
          from_status?: string | null
          to_status?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          request_id?: string
          actor_id?: string | null
          event_type?: string
          body?: string | null
          from_status?: string | null
          to_status?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_request_activity_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_brief_amendments: {
        Row: {
          id: string
          request_id: string
          author_id: string
          category: "scope" | "requirements" | "timeframe" | "constraints" | "other"
          summary: string
          details: string
          status: "pending" | "reviewed"
          created_at: string
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          id?: string
          request_id: string
          author_id: string
          category: "scope" | "requirements" | "timeframe" | "constraints" | "other"
          summary: string
          details: string
          status?: "pending" | "reviewed"
          created_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: { status?: "pending" | "reviewed" }
        Relationships: [
          {
            foreignKeyName: "service_brief_amendments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          }
        ]
      }
      service_clarification_questions: {
        Row: {
          id: string
          request_id: string
          author_id: string
          prompt: string
          state: "open" | "closed"
          created_at: string
          closed_at: string | null
          closed_by: string | null
        }
        Insert: {
          id?: string
          request_id: string
          author_id: string
          prompt: string
          state?: "open" | "closed"
          created_at?: string
          closed_at?: string | null
          closed_by?: string | null
        }
        Update: {
          state?: "open" | "closed"
        }
        Relationships: [
          {
            foreignKeyName: "service_clarification_questions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          }
        ]
      }
      service_clarification_answers: {
        Row: {
          id: string
          question_id: string
          author_id: string
          answer: string
          created_at: string
        }
        Insert: {
          id?: string
          question_id: string
          author_id: string
          answer: string
          created_at?: string
        }
        Update: never
        Relationships: [
          {
            foreignKeyName: "service_clarification_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "service_clarification_questions"
            referencedColumns: ["id"]
          }
        ]
      }
      service_request_checks: {
        Row: {
          request_id: string
          user_id: string
          checked_at: string
        }
        Insert: {
          request_id: string
          user_id: string
          checked_at?: string
        }
        Update: {
          checked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_request_checks_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          }
        ]
      }
      service_triage_history: {
        Row: {
          id: string
          request_id: string
          actor_id: string | null
          operation: "created" | "updated"
          old_priority: string | null
          new_priority: string
          old_assigned_admin_id: string | null
          new_assigned_admin_id: string | null
          old_next_action_kind: string | null
          new_next_action_kind: string
          old_next_review_on: string | null
          new_next_review_on: string | null
          internal_note_changed: boolean
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "service_triage_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          }
        ]
      }
      service_request_triage: {
        Row: {
          request_id: string
          priority: string
          assigned_admin_id: string | null
          internal_note: string
          next_action_kind: string
          next_review_on: string | null
          updated_at: string
        }
        Insert: {
          request_id: string
          priority?: string
          assigned_admin_id?: string | null
          internal_note?: string
          next_action_kind?: string
          next_review_on?: string | null
          updated_at?: string
        }
        Update: {
          request_id?: string
          priority?: string
          assigned_admin_id?: string | null
          internal_note?: string
          next_action_kind?: string
          next_review_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_request_triage_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          }
        ]
      }
      service_scope_reviews: {
        Row: {
          id: string
          request_id: string
          author_id: string
          scope_summary: string
          deliverables: string
          exclusions: string
          assumptions: string
          next_steps: string
          created_at: string
        }
        Insert: {
          id?: string
          request_id: string
          author_id: string
          scope_summary: string
          deliverables: string
          exclusions: string
          assumptions: string
          next_steps: string
          created_at?: string
        }
        Update: {
          id?: string
          request_id?: string
          author_id?: string
          scope_summary?: string
          deliverables?: string
          exclusions?: string
          assumptions?: string
          next_steps?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_scope_reviews_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          }
        ]
      }
      service_scope_responses: {
        Row: {
          id: string
          review_id: string
          user_id: string
          kind: string
          note: string
          created_at: string
        }
        Insert: {
          id?: string
          review_id: string
          user_id: string
          kind: string
          note: string
          created_at?: string
        }
        Update: {
          id?: string
          review_id?: string
          user_id?: string
          kind?: string
          note?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_scope_responses_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "service_scope_reviews"
            referencedColumns: ["id"]
          }
        ]
      }
      service_requests: {
        Row: {
          id: string
          user_id: string
          service_key: string
          title: string
          description: string
          contact_email: string
          company: string | null
          status: string
          client_update: string | null
          created_at: string
          updated_at: string
          expected_outcome: string | null
          timeframe: string | null
          constraints: string | null
          authorization_understood: boolean
        }
        Insert: {
          id?: string
          user_id: string
          service_key: string
          title: string
          description: string
          contact_email: string
          company?: string | null
          status?: string
          client_update?: string | null
          created_at?: string
          updated_at?: string
          expected_outcome?: string | null
          timeframe?: string | null
          constraints?: string | null
          authorization_understood?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          service_key?: string
          title?: string
          description?: string
          contact_email?: string
          company?: string | null
          status?: string
          client_update?: string | null
          created_at?: string
          updated_at?: string
          expected_outcome?: string | null
          timeframe?: string | null
          constraints?: string | null
          authorization_understood?: boolean
        }
        Relationships: []
      }
      chat_history: {
        Row: {
          content: string
          created_at: string | null
          document_id: string | null
          id: string
          role: string
          session_id: string | null
          tokens_used: number | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          document_id?: string | null
          id?: string
          role: string
          session_id?: string | null
          tokens_used?: number | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          document_id?: string | null
          id?: string
          role?: string
          session_id?: string | null
          tokens_used?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_history_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "ai_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_history_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "conversation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          assigned_to: string | null
          budget_range: string | null
          company: string | null
          created_at: string
          email: string
          id: string
          message: string
          name: string
          notes: string | null
          phone: string | null
          priority: string | null
          service_interested: string | null
          status: string | null
          subject: string
          timeline: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          budget_range?: string | null
          company?: string | null
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          notes?: string | null
          phone?: string | null
          priority?: string | null
          service_interested?: string | null
          status?: string | null
          subject: string
          timeline?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          budget_range?: string | null
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          notes?: string | null
          phone?: string | null
          priority?: string | null
          service_interested?: string | null
          status?: string | null
          subject?: string
          timeline?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      conversation_sessions: {
        Row: {
          created_at: string | null
          document_id: string | null
          id: string
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          document_id?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          document_id?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_sessions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "ai_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      cyber_profiles: {
        Row: {
          created_at: string | null
          current_streak: number | null
          cyberpunk_handle: string | null
          favorite_tools: string[] | null
          id: string
          level: number | null
          total_xp: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          current_streak?: number | null
          cyberpunk_handle?: string | null
          favorite_tools?: string[] | null
          id?: string
          level?: number | null
          total_xp?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          current_streak?: number | null
          cyberpunk_handle?: string | null
          favorite_tools?: string[] | null
          id?: string
          level?: number | null
          total_xp?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      dashboard_stats: {
        Row: {
          access_level: Database["public"]["Enums"]["access_level"] | null
          id: string
          last_activity: string | null
          performance_rating: number | null
          projects_created: number | null
          security_score: number | null
          total_logins: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["access_level"] | null
          id?: string
          last_activity?: string | null
          performance_rating?: number | null
          projects_created?: number | null
          security_score?: number | null
          total_logins?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["access_level"] | null
          id?: string
          last_activity?: string | null
          performance_rating?: number | null
          projects_created?: number | null
          security_score?: number | null
          total_logins?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string | null
          document_id: string
          embedding: string | null
          id: string
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string | null
          document_id: string
          embedding?: string | null
          id?: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string | null
          document_id?: string
          embedding?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "ai_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      encrypted_data: {
        Row: {
          created_at: string | null
          data_name: string
          encrypted_content: string
          encryption_algorithm: string
          id: string
          key_id: string | null
          original_size: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          data_name: string
          encrypted_content: string
          encryption_algorithm: string
          id?: string
          key_id?: string | null
          original_size?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          data_name?: string
          encrypted_content?: string
          encryption_algorithm?: string
          id?: string
          key_id?: string | null
          original_size?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "encrypted_data_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "encryption_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encrypted_data_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      encryption_keys: {
        Row: {
          algorithm: string
          created_at: string | null
          expires_at: string | null
          id: string
          is_quantum_resistant: boolean | null
          key_name: string
          key_size: number
          private_key_encrypted: string | null
          public_key: string | null
          user_id: string | null
        }
        Insert: {
          algorithm: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_quantum_resistant?: boolean | null
          key_name: string
          key_size: number
          private_key_encrypted?: string | null
          public_key?: string | null
          user_id?: string | null
        }
        Update: {
          algorithm?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_quantum_resistant?: boolean | null
          key_name?: string
          key_size?: number
          private_key_encrypted?: string | null
          public_key?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "encryption_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          sender_id: string | null
          thread_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          sender_id?: string | null
          thread_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          sender_id?: string | null
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      network_traffic_analysis: {
        Row: {
          analysis_name: string | null
          analysis_results: Json | null
          analyzed_at: string | null
          anomalies_detected: number | null
          created_at: string | null
          id: string
          risk_level: string | null
          traffic_data: Json
          user_id: string | null
        }
        Insert: {
          analysis_name?: string | null
          analysis_results?: Json | null
          analyzed_at?: string | null
          anomalies_detected?: number | null
          created_at?: string | null
          id?: string
          risk_level?: string | null
          traffic_data: Json
          user_id?: string | null
        }
        Update: {
          analysis_name?: string | null
          analysis_results?: Json | null
          analyzed_at?: string | null
          anomalies_detected?: number | null
          created_at?: string | null
          id?: string
          risk_level?: string | null
          traffic_data?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "network_traffic_analysis_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      options: {
        Row: {
          created_at: string | null
          id: string
          is_correct: boolean | null
          option_text: string
          question_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          option_text: string
          question_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          option_text?: string
          question_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      pentest_audit_events: {
        Row: {
          actor_id: string | null
          created_at: string
          details: Json
          engagement_id: string | null
          event_type: string
          id: string
          owner_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          engagement_id?: string | null
          event_type: string
          id?: string
          owner_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          engagement_id?: string | null
          event_type?: string
          id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pentest_audit_events_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "pentest_engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      pentest_engagements: {
        Row: {
          authorization_attested: boolean
          authorization_attested_at: string | null
          authorization_reference: string | null
          client_name: string | null
          created_at: string
          emergency_contact: string | null
          end_at: string | null
          engagement_name: string
          excluded_targets: string[]
          id: string
          notes: string | null
          owner_id: string
          permitted_methods: string[]
          scope_targets: string[]
          start_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          authorization_attested?: boolean
          authorization_attested_at?: string | null
          authorization_reference?: string | null
          client_name?: string | null
          created_at?: string
          emergency_contact?: string | null
          end_at?: string | null
          engagement_name: string
          excluded_targets?: string[]
          id?: string
          notes?: string | null
          owner_id: string
          permitted_methods?: string[]
          scope_targets?: string[]
          start_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          authorization_attested?: boolean
          authorization_attested_at?: string | null
          authorization_reference?: string | null
          client_name?: string | null
          created_at?: string
          emergency_contact?: string | null
          end_at?: string | null
          engagement_name?: string
          excluded_targets?: string[]
          id?: string
          notes?: string | null
          owner_id?: string
          permitted_methods?: string[]
          scope_targets?: string[]
          start_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      pentest_evidence: {
        Row: {
          created_at: string
          description: string | null
          engagement_id: string
          file_name: string
          file_size: number
          id: string
          mime_type: string
          owner_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          engagement_id: string
          file_name: string
          file_size: number
          id?: string
          mime_type: string
          owner_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          description?: string | null
          engagement_id?: string
          file_name?: string
          file_size?: number
          id?: string
          mime_type?: string
          owner_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "pentest_evidence_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "pentest_engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      polar_billing_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          current_period_end: string | null
          plan_id: string | null
          polar_customer_id: string
          polar_subscription_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          plan_id?: string | null
          polar_customer_id: string
          polar_subscription_id: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          plan_id?: string | null
          polar_customer_id?: string
          polar_subscription_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      polar_webhook_events: {
        Row: {
          attempts: number
          created_at: string
          event_id: string
          event_type: string
          last_error: string | null
          processed_at: string | null
          processing_started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_id: string
          event_type: string
          last_error?: string | null
          processed_at?: string | null
          processing_started_at?: string
          status: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_id?: string
          event_type?: string
          last_error?: string | null
          processed_at?: string | null
          processing_started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      pricing_plans: {
        Row: {
          created_at: string
          description: string
          features: string[]
          id: string
          is_active: boolean | null
          is_popular: boolean | null
          max_projects: number | null
          max_scans: number | null
          name: string
          order_index: number | null
          price_monthly: number | null
          price_yearly: number | null
          support_level: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          features: string[]
          id?: string
          is_active?: boolean | null
          is_popular?: boolean | null
          max_projects?: number | null
          max_scans?: number | null
          name: string
          order_index?: number | null
          price_monthly?: number | null
          price_yearly?: number | null
          support_level?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          features?: string[]
          id?: string
          is_active?: boolean | null
          is_popular?: boolean | null
          max_projects?: number | null
          max_scans?: number | null
          name?: string
          order_index?: number | null
          price_monthly?: number | null
          price_yearly?: number | null
          support_level?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          company: string | null
          created_at: string
          full_name: string | null
          github_url: string | null
          id: string
          is_profile_public: boolean | null
          job_title: string | null
          linkedin_url: string | null
          location: string | null
          phone: string | null
          role: string | null
          show_email: boolean | null
          show_phone: boolean | null
          skills: string[] | null
          twitter_url: string | null
          updated_at: string
          user_id: string
          username: string | null
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          company?: string | null
          created_at?: string
          full_name?: string | null
          github_url?: string | null
          id?: string
          is_profile_public?: boolean | null
          job_title?: string | null
          linkedin_url?: string | null
          location?: string | null
          phone?: string | null
          role?: string | null
          show_email?: boolean | null
          show_phone?: boolean | null
          skills?: string[] | null
          twitter_url?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          company?: string | null
          created_at?: string
          full_name?: string | null
          github_url?: string | null
          id?: string
          is_profile_public?: boolean | null
          job_title?: string | null
          linkedin_url?: string | null
          location?: string | null
          phone?: string | null
          role?: string | null
          show_email?: boolean | null
          show_phone?: boolean | null
          skills?: string[] | null
          twitter_url?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
          website?: string | null
        }
        Relationships: []
      }
      project_requests: {
        Row: {
          assigned_team_member: string | null
          budget_range: string | null
          description: string
          id: string
          priority: string | null
          project_type: string
          requirements: string | null
          status: string | null
          submitted_at: string | null
          timeline: string | null
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assigned_team_member?: string | null
          budget_range?: string | null
          description: string
          id?: string
          priority?: string | null
          project_type: string
          requirements?: string | null
          status?: string | null
          submitted_at?: string | null
          timeline?: string | null
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_team_member?: string | null
          budget_range?: string | null
          description?: string
          id?: string
          priority?: string | null
          project_type?: string
          requirements?: string | null
          status?: string | null
          submitted_at?: string | null
          timeline?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_requests_assigned_team_member_fkey"
            columns: ["assigned_team_member"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          last_updated: string | null
          name: string
          progress: number | null
          status: Database["public"]["Enums"]["project_status"] | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          last_updated?: string | null
          name: string
          progress?: number | null
          status?: Database["public"]["Enums"]["project_status"] | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          last_updated?: string | null
          name?: string
          progress?: number | null
          status?: Database["public"]["Enums"]["project_status"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          created_at: string | null
          id: string
          order_index: number
          points: number | null
          question_text: string
          question_type: string
          test_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_index: number
          points?: number | null
          question_text: string
          question_type: string
          test_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          order_index?: number
          points?: number | null
          question_text?: string
          question_type?: string
          test_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      recent_activities: {
        Row: {
          description: string
          id: string
          status: Database["public"]["Enums"]["activity_status"] | null
          timestamp: string | null
          type: Database["public"]["Enums"]["activity_type"]
          user_id: string
        }
        Insert: {
          description: string
          id?: string
          status?: Database["public"]["Enums"]["activity_status"] | null
          timestamp?: string | null
          type: Database["public"]["Enums"]["activity_type"]
          user_id: string
        }
        Update: {
          description?: string
          id?: string
          status?: Database["public"]["Enums"]["activity_status"] | null
          timestamp?: string | null
          type?: Database["public"]["Enums"]["activity_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recent_activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      security_incidents: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          description: string | null
          detected_at: string | null
          id: string
          incident_type: string
          resolution_notes: string | null
          resolved_at: string | null
          severity: string
          source_ip: unknown
          status: string | null
          target_system: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          description?: string | null
          detected_at?: string | null
          id?: string
          incident_type: string
          resolution_notes?: string | null
          resolved_at?: string | null
          severity: string
          source_ip?: unknown
          status?: string | null
          target_system?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          description?: string | null
          detected_at?: string | null
          id?: string
          incident_type?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          source_ip?: unknown
          status?: string | null
          target_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_incidents_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      security_logs: {
        Row: {
          event_type: string
          id: string
          message: string
          severity: Database["public"]["Enums"]["log_severity"] | null
          source_ip: string | null
          timestamp: string | null
          user_id: string
        }
        Insert: {
          event_type: string
          id?: string
          message: string
          severity?: Database["public"]["Enums"]["log_severity"] | null
          source_ip?: string | null
          timestamp?: string | null
          user_id: string
        }
        Update: {
          event_type?: string
          id?: string
          message?: string
          severity?: Database["public"]["Enums"]["log_severity"] | null
          source_ip?: string | null
          timestamp?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      security_scans: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          recommendations: string[] | null
          results: Json | null
          scan_duration: number | null
          scan_type: string
          score: number | null
          status: string | null
          target_url: string
          user_id: string | null
          vulnerabilities_found: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          recommendations?: string[] | null
          results?: Json | null
          scan_duration?: number | null
          scan_type: string
          score?: number | null
          status?: string | null
          target_url: string
          user_id?: string | null
          vulnerabilities_found?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          recommendations?: string[] | null
          results?: Json | null
          scan_duration?: number | null
          scan_type?: string
          score?: number | null
          status?: string | null
          target_url?: string
          user_id?: string | null
          vulnerabilities_found?: number | null
        }
        Relationships: []
      }
      services: {
        Row: {
          category: string
          created_at: string
          features: string[]
          full_description: string
          icon_name: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          order_index: number | null
          pricing_tiers: Json | null
          short_description: string
          slug: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          features: string[]
          full_description: string
          icon_name?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          order_index?: number | null
          pricing_tiers?: Json | null
          short_description: string
          slug: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          features?: string[]
          full_description?: string
          icon_name?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          order_index?: number | null
          pricing_tiers?: Json | null
          short_description?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          attempts: number
          created_at: string
          event_id: string
          event_type: string
          last_error: string | null
          processed_at: string | null
          processing_started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_id: string
          event_type: string
          last_error?: string | null
          processed_at?: string | null
          processing_started_at?: string
          status: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_id?: string
          event_type?: string
          last_error?: string | null
          processed_at?: string | null
          processing_started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean | null
          results_password_hash: string | null
          student_id_code: string
          teacher_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
          results_password_hash?: string | null
          student_id_code: string
          teacher_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          results_password_hash?: string | null
          student_id_code?: string
          teacher_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          stripe_customer_id: string | null
          subscribed: boolean
          subscription_end: string | null
          subscription_tier: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      system_metrics: {
        Row: {
          cpu_usage: number | null
          disk_usage: number | null
          id: string
          network_traffic: number | null
          ram_usage: number | null
          timestamp: string | null
          user_id: string
        }
        Insert: {
          cpu_usage?: number | null
          disk_usage?: number | null
          id?: string
          network_traffic?: number | null
          ram_usage?: number | null
          timestamp?: string | null
          user_id: string
        }
        Update: {
          cpu_usage?: number | null
          disk_usage?: number | null
          id?: string
          network_traffic?: number | null
          ram_usage?: number | null
          timestamp?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_metrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          institution: string | null
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          institution?: string | null
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          institution?: string | null
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tests: {
        Row: {
          access_password_hash: string | null
          created_at: string | null
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean | null
          is_published: boolean | null
          teacher_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          access_password_hash?: string | null
          created_at?: string | null
          description?: string | null
          duration_minutes: number
          id?: string
          is_active?: boolean | null
          is_published?: boolean | null
          teacher_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          access_password_hash?: string | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          is_published?: boolean | null
          teacher_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tests_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_participants: {
        Row: {
          thread_id: string
          user_id: string
        }
        Insert: {
          thread_id: string
          user_id: string
        }
        Update: {
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          created_at: string | null
          id: string
          title: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          title?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          title?: string | null
        }
        Relationships: []
      }
      threat_intelligence: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          description: string | null
          first_seen: string | null
          id: string
          indicator_type: string
          indicator_value: string
          is_active: boolean | null
          last_seen: string | null
          severity: string
          source: string
          tags: string[] | null
          threat_type: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          description?: string | null
          first_seen?: string | null
          id?: string
          indicator_type: string
          indicator_value: string
          is_active?: boolean | null
          last_seen?: string | null
          severity: string
          source: string
          tags?: string[] | null
          threat_type: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          description?: string | null
          first_seen?: string | null
          id?: string
          indicator_type?: string
          indicator_value?: string
          is_active?: boolean | null
          last_seen?: string | null
          severity?: string
          source?: string
          tags?: string[] | null
          threat_type?: string
        }
        Relationships: []
      }
      threat_monitoring_events: {
        Row: {
          analyst_notes: string | null
          created_at: string | null
          destination_ip: unknown
          destination_port: number | null
          detected_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          is_false_positive: boolean | null
          protocol: string | null
          severity: string
          source_ip: unknown
          source_port: number | null
        }
        Insert: {
          analyst_notes?: string | null
          created_at?: string | null
          destination_ip?: unknown
          destination_port?: number | null
          detected_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          is_false_positive?: boolean | null
          protocol?: string | null
          severity: string
          source_ip?: unknown
          source_port?: number | null
        }
        Update: {
          analyst_notes?: string | null
          created_at?: string | null
          destination_ip?: unknown
          destination_port?: number | null
          detected_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          is_false_positive?: boolean | null
          protocol?: string | null
          severity?: string
          source_ip?: unknown
          source_port?: number | null
        }
        Relationships: []
      }
      tool_usage: {
        Row: {
          created_at: string | null
          id: string
          last_used: string | null
          tool_id: string
          usage_count: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_used?: string | null
          tool_id: string
          usage_count?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_used?: string | null
          tool_id?: string
          usage_count?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string
          id: string
          unlocked_at: string | null
          user_id: string | null
        }
        Insert: {
          achievement_id: string
          id?: string
          unlocked_at?: string | null
          user_id?: string | null
        }
        Update: {
          achievement_id?: string
          id?: string
          unlocked_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_answers: {
        Row: {
          attempt_id: string | null
          created_at: string | null
          id: string
          is_correct: boolean | null
          points_awarded: number | null
          question_id: string | null
          selected_option_id: string | null
          short_answer_text: string | null
        }
        Insert: {
          attempt_id?: string | null
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          points_awarded?: number | null
          question_id?: string | null
          selected_option_id?: string | null
          short_answer_text?: string | null
        }
        Update: {
          attempt_id?: string | null
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          points_awarded?: number | null
          question_id?: string | null
          selected_option_id?: string | null
          short_answer_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "user_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_answers_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "options"
            referencedColumns: ["id"]
          },
        ]
      }
      user_attempts: {
        Row: {
          created_at: string | null
          end_time: string | null
          id: string
          is_mobile_locked: boolean | null
          max_score: number | null
          score: number | null
          start_time: string | null
          status: string | null
          student_id: string | null
          test_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          end_time?: string | null
          id?: string
          is_mobile_locked?: boolean | null
          max_score?: number | null
          score?: number | null
          start_time?: string | null
          status?: string | null
          student_id?: string | null
          test_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          end_time?: string | null
          id?: string
          is_mobile_locked?: boolean | null
          max_score?: number | null
          score?: number | null
          start_time?: string | null
          status?: string | null
          student_id?: string | null
          test_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_attempts_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          access_level: Database["public"]["Enums"]["access_level"] | null
          avatar_url: string | null
          created_at: string | null
          email: string
          id: string
          last_login: string | null
          preferences: Json | null
          stats: Json | null
          username: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["access_level"] | null
          avatar_url?: string | null
          created_at?: string | null
          email: string
          id: string
          last_login?: string | null
          preferences?: Json | null
          stats?: Json | null
          username: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["access_level"] | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          id?: string
          last_login?: string | null
          preferences?: Json | null
          stats?: Json | null
          username?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          role: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          id: string
          password_hash: string
          role: string | null
          updated_at: string | null
          username: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          password_hash: string
          role?: string | null
          updated_at?: string | null
          username: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          password_hash?: string
          role?: string | null
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
      vulnerability_details: {
        Row: {
          created_at: string | null
          cve_id: string | null
          cvss_score: number | null
          description: string | null
          id: string
          location: string | null
          proof_of_concept: string | null
          remediation: string | null
          scan_id: string | null
          severity: string
          vulnerability_type: string
        }
        Insert: {
          created_at?: string | null
          cve_id?: string | null
          cvss_score?: number | null
          description?: string | null
          id?: string
          location?: string | null
          proof_of_concept?: string | null
          remediation?: string | null
          scan_id?: string | null
          severity: string
          vulnerability_type: string
        }
        Update: {
          created_at?: string | null
          cve_id?: string | null
          cvss_score?: number | null
          description?: string | null
          id?: string
          location?: string | null
          proof_of_concept?: string | null
          remediation?: string | null
          scan_id?: string | null
          severity?: string
          vulnerability_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vulnerability_details_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "vulnerability_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      vulnerability_scans: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          results: Json | null
          risk_score: number | null
          scan_duration: number | null
          scan_type: string
          started_at: string | null
          status: string | null
          target_url: string
          user_id: string | null
          vulnerabilities_found: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          results?: Json | null
          risk_score?: number | null
          scan_duration?: number | null
          scan_type: string
          started_at?: string | null
          status?: string | null
          target_url: string
          user_id?: string | null
          vulnerabilities_found?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          results?: Json | null
          risk_score?: number | null
          scan_duration?: number | null
          scan_type?: string
          started_at?: string | null
          status?: string | null
          target_url?: string
          user_id?: string | null
          vulnerabilities_found?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vulnerability_scans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      service_request_journal: {
        Row: {
          request_id: string
          event_key: string
          actor_id: string | null
          occurred_at: string
          stream: "conversation" | "scope" | "clarifications" | "brief_changes"
          event_kind: string
          title: string
          detail: string | null
        }
        Relationships: []
      }
      service_admin_amendment_queue: {
        Row: {
          id: string
          user_id: string
          service_key: string
          title: string
          description: string
          contact_email: string
          company: string | null
          status: string
          client_update: string | null
          expected_outcome: string | null
          timeframe: string | null
          constraints: string | null
          created_at: string
          updated_at: string
          priority: string
          priority_rank: number
          assigned_admin_id: string | null
          triage_updated_at: string | null
          last_customer_activity_at: string | null
          last_admin_activity_at: string | null
          needs_follow_up: boolean
          next_action_kind: string
          next_review_on: string | null
          review_bucket: string
          last_checked_at: string | null
          needs_my_check: boolean
          open_clarification_count: number
          awaiting_customer_count: number
          awaiting_admin_review_count: number
          last_customer_answer_at: string | null
          needs_my_check_extended: boolean
          needs_follow_up_extended: boolean
          customer_answers_since_check: number
          amendment_count: number
          pending_amendment_count: number
          last_amendment_submitted_at: string | null
          needs_my_check_complete: boolean
          needs_follow_up_complete: boolean
        }
        Relationships: []
      }
      service_customer_amendment_queue: {
        Row: {
          id: string
          user_id: string
          service_key: string
          title: string
          description: string
          status: string
          client_update: string | null
          created_at: string
          updated_at: string
          expected_outcome: string | null
          timeframe: string | null
          constraints: string | null
          last_admin_activity_at: string | null
          last_checked_at: string | null
          has_updates_since_check: boolean
          open_clarification_count: number
          awaiting_customer_count: number
          awaiting_admin_review_count: number
          last_clarification_activity_at: string | null
          has_updates_since_check_extended: boolean
          clarification_changes_since_check: number
          amendment_count: number
          pending_amendment_count: number
          last_amendment_reviewed_at: string | null
          has_updates_since_check_complete: boolean
        }
        Relationships: []
      }
      service_admin_followup_queue: {
        Row: {
          id: string
          user_id: string
          service_key: string
          title: string
          description: string
          contact_email: string
          company: string | null
          status: string
          client_update: string | null
          expected_outcome: string | null
          timeframe: string | null
          constraints: string | null
          created_at: string
          updated_at: string
          priority: string
          priority_rank: number
          assigned_admin_id: string | null
          triage_updated_at: string | null
          last_customer_activity_at: string | null
          last_admin_activity_at: string | null
          needs_follow_up: boolean
          next_action_kind: string
          next_review_on: string | null
          review_bucket: string
          last_checked_at: string | null
          needs_my_check: boolean
          open_clarification_count: number
          awaiting_customer_count: number
          awaiting_admin_review_count: number
          last_customer_answer_at: string | null
          needs_my_check_extended: boolean
          needs_follow_up_extended: boolean
          customer_answers_since_check: number
        }
        Relationships: []
      }
      service_customer_followup_queue: {
        Row: {
          id: string
          user_id: string
          service_key: string
          title: string
          description: string
          status: string
          client_update: string | null
          created_at: string
          updated_at: string
          expected_outcome: string | null
          timeframe: string | null
          constraints: string | null
          last_admin_activity_at: string | null
          last_checked_at: string | null
          has_updates_since_check: boolean
          open_clarification_count: number
          awaiting_customer_count: number
          awaiting_admin_review_count: number
          last_clarification_activity_at: string | null
          has_updates_since_check_extended: boolean
          clarification_changes_since_check: number
        }
        Relationships: []
      }
      service_admin_clarification_queue: {
        Row: {
          id: string
          user_id: string
          service_key: string
          title: string
          description: string
          contact_email: string
          company: string | null
          status: string
          client_update: string | null
          expected_outcome: string | null
          timeframe: string | null
          constraints: string | null
          created_at: string
          updated_at: string
          priority: string
          priority_rank: number
          assigned_admin_id: string | null
          triage_updated_at: string | null
          last_customer_activity_at: string | null
          last_admin_activity_at: string | null
          needs_follow_up: boolean
          next_action_kind: string
          next_review_on: string | null
          review_bucket: string
          last_checked_at: string | null
          needs_my_check: boolean
          open_clarification_count: number
          awaiting_customer_count: number
          awaiting_admin_review_count: number
        }
        Relationships: []
      }
      service_customer_clarification_queue: {
        Row: {
          id: string
          user_id: string
          service_key: string
          title: string
          description: string
          status: string
          client_update: string | null
          created_at: string
          updated_at: string
          expected_outcome: string | null
          timeframe: string | null
          constraints: string | null
          last_admin_activity_at: string | null
          last_checked_at: string | null
          has_updates_since_check: boolean
          open_clarification_count: number
          awaiting_customer_count: number
          awaiting_admin_review_count: number
        }
        Relationships: []
      }
      service_admin_check_queue: {
        Row: {
          id: string
          user_id: string
          service_key: string
          title: string
          description: string
          contact_email: string
          company: string | null
          status: string
          client_update: string | null
          expected_outcome: string | null
          timeframe: string | null
          constraints: string | null
          created_at: string
          updated_at: string
          priority: string
          priority_rank: number
          assigned_admin_id: string | null
          triage_updated_at: string | null
          last_customer_activity_at: string | null
          last_admin_activity_at: string | null
          needs_follow_up: boolean
          next_action_kind: string
          next_review_on: string | null
          review_bucket: string
          last_checked_at: string | null
          needs_my_check: boolean
        }
        Relationships: []
      }
      service_customer_check_queue: {
        Row: {
          id: string
          user_id: string
          service_key: string
          title: string
          description: string
          status: string
          client_update: string | null
          created_at: string
          updated_at: string
          expected_outcome: string | null
          timeframe: string | null
          constraints: string | null
          last_admin_activity_at: string | null
          last_checked_at: string | null
          has_updates_since_check: boolean
        }
        Relationships: []
      }
      service_admin_review_queue: {
        Row: {
          id: string
          user_id: string
          service_key: string
          title: string
          description: string
          contact_email: string
          company: string | null
          status: string
          client_update: string | null
          expected_outcome: string | null
          timeframe: string | null
          constraints: string | null
          created_at: string
          updated_at: string
          priority: string
          priority_rank: number
          assigned_admin_id: string | null
          triage_updated_at: string | null
          last_customer_activity_at: string | null
          last_admin_activity_at: string | null
          needs_follow_up: boolean
          next_action_kind: string
          next_review_on: string | null
          review_bucket: string
        }
        Relationships: []
      }
      service_admin_attention_queue: {
        Row: {
          id: string
          user_id: string
          service_key: string
          title: string
          description: string
          contact_email: string
          company: string | null
          status: string
          client_update: string | null
          expected_outcome: string | null
          timeframe: string | null
          constraints: string | null
          created_at: string
          updated_at: string
          priority: string
          priority_rank: number
          assigned_admin_id: string | null
          triage_updated_at: string | null
          last_customer_activity_at: string | null
          last_admin_activity_at: string | null
          needs_follow_up: boolean
        }
        Relationships: []
      }
    }
    Functions: {
      workspace_team_notification_snapshot: {
        Args: { p_space_id: string }
        Returns: Json
      }
      workspace_team_mark_events_seen: {
        Args: { p_space_id: string; p_event_id: number }
        Returns: number
      }
      workspace_team_post_comment: {
        Args: {p_space_id:string;p_task_id:string;p_body:string};Returns:string
      }
      workspace_team_redact_comment: {
        Args: {p_space_id:string;p_comment_id:string};Returns:boolean
      }
      workspace_team_add_step: {
        Args: {p_space_id:string;p_task_id:string;p_title:string};Returns:string
      }
      workspace_team_check_step: {
        Args: {
          p_space_id:string;p_step_id:string;p_done:boolean;
          p_expected_updated_at:string;
        };Returns:boolean
      }
      workspace_team_remove_step: {
        Args: {p_space_id:string;p_step_id:string};Returns:boolean
      }
      workspace_team_role: { Args: { p_space_id: string }; Returns: string | null }
      workspace_team_create: { Args: { p_name: string; p_description?: string }; Returns: string }
      workspace_team_invite: { Args: { p_space_id: string; p_role?: string }; Returns: Json }
      workspace_team_accept_invite: { Args: { p_token: string }; Returns: string }
      workspace_team_revoke_invite: { Args: { p_invite_id: string }; Returns: boolean }
      workspace_team_member_change: { Args: { p_space_id: string; p_user_id: string; p_role?: string | null }; Returns: boolean }
      workspace_team_leave: { Args: { p_space_id: string }; Returns: boolean }
      workspace_team_set_status: { Args: { p_space_id: string; p_status: string }; Returns: boolean }
      workspace_team_save_task: { Args: { p_space_id: string; p_task_id: string | null; p_title: string; p_details: string; p_status: string; p_priority: string; p_due_on: string | null; p_assignee_id: string | null; p_expected_updated_at?: string | null }; Returns: string }
      workspace_team_delete_task: { Args: { p_space_id: string; p_task_id: string }; Returns: boolean }
      workspace_reconciliation_record: {
        Args: {
          p_source_session_id: string; p_source_sha256: string;
          p_snapshot_sha256: string; p_archive_sha256: string;
          p_payload_sha256: string; p_source_tasks: number;
          p_current_tasks: number; p_source_items: number;
          p_current_items: number; p_checklist_steps: number;
          p_excluded_files: number;
        };
        Returns: Json;
      }
      workspace_import_set_hold: { Args: { p_session_id: string; p_hold: boolean; p_reason?: string }; Returns: boolean }
      workspace_import_integrity: { Args: { p_session_id: string }; Returns: Json }
      workspace_import_inspect: { Args: { p_session_id: string }; Returns: Json }
      workspace_import_prepare_discard: { Args: { p_session_id: string }; Returns: boolean }
      workspace_import_finalize_discard: { Args: { p_session_id: string }; Returns: boolean }
      workspace_import_cancel_discard: { Args: { p_session_id: string }; Returns: boolean }
      workspace_import_begin: { Args: {
        p_source_sha256: string; p_source_version: number; p_project_name: string;
        p_description: string; p_expected_tasks: number; p_expected_steps: number;
        p_expected_items: number; p_expected_files: number }; Returns: Json }
      workspace_import_status: { Args: { p_session_id: string }; Returns: Json }
      workspace_import_apply_batch: { Args: {
        p_session_id: string; p_phase: string; p_batch_index: number; p_payload: Json }; Returns: Json }
      workspace_import_claim_file: { Args: {
        p_session_id: string; p_file_index: number; p_title: string; p_size_bytes: number;
        p_mime_type: string; p_sha256: string }; Returns: Json }
      workspace_import_register_file: { Args: { p_session_id: string; p_file_index: number }; Returns: boolean }
      workspace_import_finish: { Args: { p_session_id: string }; Returns: boolean }
      workspace_restore_task_batch: { Args: { p_project_id: string; p_tasks: Json }; Returns: Json }
      mark_service_request_checked: { Args: { p_request_id: string }; Returns: string }
      workspace_delete_archived_project: { Args: { p_project_id: string }; Returns: boolean }
      admin_list_users: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          access_level: string
          avatar_url: string
          created_at: string
          full_name: string
          is_profile_public: boolean
          job_title: string
          location: string
          profile_id: string
          total_count: number
          user_id: string
          username: string
        }[]
      }
      admin_update_bug_report_status: {
        Args: { p_report_id: string; p_status: string }
        Returns: boolean
      }
      calculate_risk_score: { Args: { scan_id: string }; Returns: number }
      check_and_auto_submit_test: {
        Args: { p_attempt_id: string }
        Returns: undefined
      }
      claim_polar_webhook_event: {
        Args: { p_event_id: string; p_event_type: string }
        Returns: string
      }
      claim_stripe_webhook_event: {
        Args: { p_event_id: string; p_event_type: string }
        Returns: string
      }
      complete_polar_webhook_event: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      complete_stripe_webhook_event: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      fail_polar_webhook_event: {
        Args: { p_error: string; p_event_id: string }
        Returns: undefined
      }
      fail_stripe_webhook_event: {
        Args: { p_error: string; p_event_id: string }
        Returns: undefined
      }
      get_current_user_role: { Args: never; Returns: string }
      get_threat_statistics: {
        Args: { days?: number }
        Returns: {
          critical_threats: number
          high_threats: number
          low_threats: number
          medium_threats: number
          total_threats: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      visitor_presence: { Args: { contribute?: boolean }; Returns: Json }
    }
    Enums: {
      access_level: "basic" | "premium" | "elite"
      activity_status: "success" | "warning" | "error"
      activity_type: "login" | "project" | "security" | "system"
      log_severity: "info" | "warning" | "critical"
      project_status: "active" | "completed" | "on_hold"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      access_level: ["basic", "premium", "elite"],
      activity_status: ["success", "warning", "error"],
      activity_type: ["login", "project", "security", "system"],
      log_severity: ["info", "warning", "critical"],
      project_status: ["active", "completed", "on_hold"],
    },
  },
} as const
