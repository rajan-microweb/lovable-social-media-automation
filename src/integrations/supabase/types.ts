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
          workspace_id: string
          scheduled_at: string | null
          recurrence_frequency: string
          recurrence_until: string | null
          status: string
          tags: string[] | null
          text: string | null
          title: string
          type_of_post: string | null
          updated_at: string
          url: string | null
          user_id: string
          video: string | null
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
          workspace_id: string
          scheduled_at?: string | null
          recurrence_frequency?: string
          recurrence_until?: string | null
          status?: string
          tags?: string[] | null
          text?: string | null
          title: string
          type_of_post?: string | null
          updated_at?: string
          url?: string | null
          user_id: string
          video?: string | null
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
          workspace_id?: string
          scheduled_at?: string | null
          recurrence_frequency?: string
          recurrence_until?: string | null
          status?: string
          tags?: string[] | null
          text?: string | null
          title?: string
          type_of_post?: string | null
          updated_at?: string
          url?: string | null
          user_id?: string
          video?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      stories: {
        Row: {
          account_type: string | null
          created_at: string
          description: string | null
          id: string
          image: string | null
          platforms: string[] | null
          workspace_id: string
          scheduled_at: string | null
          recurrence_frequency: string
          recurrence_until: string | null
          status: string
          text: string | null
          title: string
          type_of_story: string | null
          updated_at: string
          user_id: string
          video: string | null
        }
        Insert: {
          account_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image?: string | null
          platforms?: string[] | null
          workspace_id: string
          scheduled_at?: string | null
          recurrence_frequency?: string
          recurrence_until?: string | null
          status?: string
          text?: string | null
          title: string
          type_of_story?: string | null
          updated_at?: string
          user_id: string
          video?: string | null
        }
        Update: {
          account_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image?: string | null
          platforms?: string[] | null
          workspace_id?: string
          scheduled_at?: string | null
          recurrence_frequency?: string
          recurrence_until?: string | null
          status?: string
          text?: string | null
          title?: string
          type_of_story?: string | null
          updated_at?: string
          user_id?: string
          video?: string | null
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      content_change_requests: {
        Row: {
          created_at: string
          content_id: string
          content_type: string
          details: Json | null
          id: string
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          request_status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          content_id: string
          content_type: string
          details?: Json | null
          id?: string
          requested_at?: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          request_status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          content_id?: string
          content_type?: string
          details?: Json | null
          id?: string
          requested_at?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          request_status?: string
          updated_at?: string
          workspace_id?: string
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
        Relationships: []
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
