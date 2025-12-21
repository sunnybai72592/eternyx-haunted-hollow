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
      tests: {
        Row: {
          created_at: string | null
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duration_minutes: number
          id?: string
          is_active?: boolean | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
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
          test_id?: string | null
          user_id?: string | null
        }
        Relationships: [
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
      [_ in never]: never
    }
    Functions: {
      calculate_risk_score: { Args: { scan_id: string }; Returns: number }
      check_and_auto_submit_test: {
        Args: { p_attempt_id: string }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
