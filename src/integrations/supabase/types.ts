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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      analytics_platform_activity_snapshots: {
        Row: {
          account_id: string
          account_name: string | null
          content: string | null
          created_at: string
          engagement_comments: number | null
          engagement_likes: number | null
          engagement_shares: number | null
          engagement_views: number | null
          fetched_at: string
          id: string
          media_url: string | null
          permalink: string | null
          platform: string
          platform_content_id: string
          published_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          account_id: string
          account_name?: string | null
          content?: string | null
          created_at?: string
          engagement_comments?: number | null
          engagement_likes?: number | null
          engagement_shares?: number | null
          engagement_views?: number | null
          fetched_at?: string
          id?: string
          media_url?: string | null
          permalink?: string | null
          platform: string
          platform_content_id: string
          published_at: string
          user_id: string
          workspace_id: string
        }
        Update: {
          account_id?: string
          account_name?: string | null
          content?: string | null
          created_at?: string
          engagement_comments?: number | null
          engagement_likes?: number | null
          engagement_shares?: number | null
          engagement_views?: number | null
          fetched_at?: string
          id?: string
          media_url?: string | null
          permalink?: string | null
          platform?: string
          platform_content_id?: string
          published_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_platform_activity_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_platform_activity_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_approvals: {
        Row: {
          approval_status: string
          content_id: string
          content_type: string
          created_at: string
          id: string
          note: string | null
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          approval_status?: string
          content_id: string
          content_type: string
          created_at?: string
          id?: string
          note?: string | null
          requested_at?: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          approval_status?: string
          content_id?: string
          content_type?: string
          created_at?: string
          id?: string
          note?: string | null
          requested_at?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_approvals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_approvals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_approvals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_change_requests: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          details: Json | null
          id: string
          request_status: string
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          details?: Json | null
          id?: string
          request_status?: string
          requested_at?: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          details?: Json | null
          id?: string
          request_status?: string
          requested_at?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_change_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_change_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_change_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          overrides: Json
          template_name: string
          type_of_post: string | null
          type_of_story: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          overrides?: Json
          template_name: string
          type_of_post?: string | null
          type_of_story?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          overrides?: Json
          template_name?: string
          type_of_post?: string | null
          type_of_story?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          content_type: string
          created_at: string
          file_path: string
          file_url: string
          id: string
          tags: string[]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          content_type: string
          created_at?: string
          file_path: string
          file_url: string
          id?: string
          tags?: string[]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          content_type?: string
          created_at?: string
          file_path?: string
          file_url?: string
          id?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_integrations: {
        Row: {
          cost: Json | null
          created_at: string
          credentials: Json
          credentials_encrypted: boolean | null
          id: string
          metadata: Json | null
          platform_name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cost?: Json | null
          created_at?: string
          credentials: Json
          credentials_encrypted?: boolean | null
          id?: string
          metadata?: Json | null
          platform_name: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cost?: Json | null
          created_at?: string
          credentials?: Json
          credentials_encrypted?: boolean | null
          id?: string
          metadata?: Json | null
          platform_name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          account_type: string | null
          created_at: string
          description: string | null
          id: string
          image: string | null
          metadata: Json | null
          pdf: string | null
          platforms: string[] | null
          published_at: string | null
          recurrence_frequency: string
          recurrence_until: string | null
          scheduled_at: string | null
          status: string
          tags: string[] | null
          text: string | null
          title: string
          type_of_post: string | null
          updated_at: string
          url: string | null
          user_id: string
          video: string | null
          workspace_id: string
        }
        Insert: {
          account_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image?: string | null
          metadata?: Json | null
          pdf?: string | null
          platforms?: string[] | null
          published_at?: string | null
          recurrence_frequency?: string
          recurrence_until?: string | null
          scheduled_at?: string | null
          status?: string
          tags?: string[] | null
          text?: string | null
          title: string
          type_of_post?: string | null
          updated_at?: string
          url?: string | null
          user_id: string
          video?: string | null
          workspace_id: string
        }
        Update: {
          account_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image?: string | null
          metadata?: Json | null
          pdf?: string | null
          platforms?: string[] | null
          published_at?: string | null
          recurrence_frequency?: string
          recurrence_until?: string | null
          scheduled_at?: string | null
          status?: string
          tags?: string[] | null
          text?: string | null
          title?: string
          type_of_post?: string | null
          updated_at?: string
          url?: string | null
          user_id?: string
          video?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          name: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          name: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      publish_jobs: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          id: string
          last_error: string | null
          retry_count: number
          run_at: string
          state: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          id?: string
          last_error?: string | null
          retry_count?: number
          run_at: string
          state?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          id?: string
          last_error?: string | null
          retry_count?: number
          run_at?: string
          state?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publish_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stories: {
        Row: {
          account_type: string | null
          created_at: string
          description: string | null
          id: string
          image: string | null
          platforms: string[] | null
          published_at: string | null
          recurrence_frequency: string
          recurrence_until: string | null
          scheduled_at: string | null
          status: string
          text: string | null
          title: string
          type_of_story: string | null
          updated_at: string
          url: string | null
          user_id: string
          video: string | null
          workspace_id: string
        }
        Insert: {
          account_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image?: string | null
          platforms?: string[] | null
          published_at?: string | null
          recurrence_frequency?: string
          recurrence_until?: string | null
          scheduled_at?: string | null
          status?: string
          text?: string | null
          title: string
          type_of_story?: string | null
          updated_at?: string
          url?: string | null
          user_id: string
          video?: string | null
          workspace_id: string
        }
        Update: {
          account_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image?: string | null
          platforms?: string[] | null
          published_at?: string | null
          recurrence_frequency?: string
          recurrence_until?: string | null
          scheduled_at?: string | null
          status?: string
          text?: string | null
          title?: string
          type_of_story?: string | null
          updated_at?: string
          url?: string | null
          user_id?: string
          video?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      decrypt_credentials: { Args: { encrypted_creds: string }; Returns: Json }
      encrypt_credentials: { Args: { credentials: Json }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "ADMIN" | "CLIENT"
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
      app_role: ["ADMIN", "CLIENT"],
    },
  },
} as const
