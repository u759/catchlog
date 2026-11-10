// Generated from the Supabase schema. Regenerate after migrations (ask Claude, or
// `npx supabase gen types typescript --project-id ouqcqcyialpvibrldtyl > src/lib/database.types.ts`).
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      catches: {
        Row: {
          caught_at: string
          created_at: string
          deleted_at: string | null
          id: string
          lat: number | null
          length_mm: number | null
          line_lb: number | null
          lng: number | null
          lure: string | null
          notes: string | null
          photo_path: string | null
          place_name: string | null
          released: boolean
          species_id: string | null
          species_other: string | null
          updated_at: string
          user_id: string
          visibility: string
          waterbody: string | null
          weather: Json | null
          weight_estimated: boolean
          weight_g: number | null
        }
        Insert: {
          caught_at?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          lat?: number | null
          length_mm?: number | null
          line_lb?: number | null
          lng?: number | null
          lure?: string | null
          notes?: string | null
          photo_path?: string | null
          place_name?: string | null
          released?: boolean
          species_id?: string | null
          species_other?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
          waterbody?: string | null
          weather?: Json | null
          weight_estimated?: boolean
          weight_g?: number | null
        }
        Update: {
          caught_at?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          lat?: number | null
          length_mm?: number | null
          line_lb?: number | null
          lng?: number | null
          lure?: string | null
          notes?: string | null
          photo_path?: string | null
          place_name?: string | null
          released?: boolean
          species_id?: string | null
          species_other?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
          waterbody?: string | null
          weather?: Json | null
          weight_estimated?: boolean
          weight_g?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "catches_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          requester_id: string
          status: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          requester_id: string
          status?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          requester_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
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
          display_name: string | null
          friend_code: string
          id: string
          units: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          friend_code?: string
          id: string
          units?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          friend_code?: string
          id?: string
          units?: string
          updated_at?: string
        }
        Relationships: []
      }
      species: {
        Row: {
          common_name: string
          family: string | null
          id: string
          scientific_name: string | null
          ws_a: number | null
          ws_b: number | null
        }
        Insert: {
          common_name: string
          family?: string | null
          id: string
          scientific_name?: string | null
          ws_a?: number | null
          ws_b?: number | null
        }
        Update: {
          common_name?: string
          family?: string | null
          id?: string
          scientific_name?: string | null
          ws_a?: number | null
          ws_b?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      leaderboard: {
        Args: { p_since?: string; p_species_id?: string }
        Returns: {
          avatar_url: string
          catch_id: string
          caught_at: string
          display_name: string
          length_mm: number
          photo_path: string
          rank: number
          species_name: string
          user_id: string
          weight_g: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
