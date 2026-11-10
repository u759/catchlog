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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      catches: {
        Row: {
          caught_at: string
          created_at: string
          deleted_at: string | null
          gear_id: string | null
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
          waterbody_id: string | null
          weather: Json | null
          weight_estimated: boolean
          weight_g: number | null
        }
        Insert: {
          caught_at?: string
          created_at?: string
          deleted_at?: string | null
          gear_id?: string | null
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
          waterbody_id?: string | null
          weather?: Json | null
          weight_estimated?: boolean
          weight_g?: number | null
        }
        Update: {
          caught_at?: string
          created_at?: string
          deleted_at?: string | null
          gear_id?: string | null
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
          waterbody_id?: string | null
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
      data_sources: {
        Row: {
          attribution: string
          depends_on: string[]
          enabled: boolean
          key: string
          last_attempt_at: string | null
          last_error: string | null
          last_row_count: number | null
          last_success_at: string | null
          licence: string
          name: string
          refresh_every: string
          region: string | null
          running_since: string | null
          state: Json
          updated_at: string
          url: string | null
          used_for: string | null
          version: string | null
        }
        Insert: {
          attribution: string
          depends_on?: string[]
          enabled?: boolean
          key: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_row_count?: number | null
          last_success_at?: string | null
          licence: string
          name: string
          refresh_every?: string
          region?: string | null
          running_since?: string | null
          state?: Json
          updated_at?: string
          url?: string | null
          used_for?: string | null
          version?: string | null
        }
        Update: {
          attribution?: string
          depends_on?: string[]
          enabled?: boolean
          key?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_row_count?: number | null
          last_success_at?: string | null
          licence?: string
          name?: string
          refresh_every?: string
          region?: string | null
          running_since?: string | null
          state?: Json
          updated_at?: string
          url?: string | null
          used_for?: string | null
          version?: string | null
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
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
      gear: {
        Row: {
          brand: string | null
          category: string
          color: string | null
          created_at: string
          deleted_at: string | null
          hook_size: string | null
          id: string
          name: string
          notes: string | null
          quantity: number | null
          size: string | null
          subtype: string | null
          updated_at: string
          user_id: string
          weight_g: number | null
        }
        Insert: {
          brand?: string | null
          category: string
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          hook_size?: string | null
          id?: string
          name: string
          notes?: string | null
          quantity?: number | null
          size?: string | null
          subtype?: string | null
          updated_at?: string
          user_id?: string
          weight_g?: number | null
        }
        Update: {
          brand?: string | null
          category?: string
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          hook_size?: string | null
          id?: string
          name?: string
          notes?: string | null
          quantity?: number | null
          size?: string | null
          subtype?: string | null
          updated_at?: string
          user_id?: string
          weight_g?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gear_user_id_fkey"
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
          brackish: boolean | null
          common_name: string
          common_name_fr: string | null
          dex_no: number | null
          family: string | null
          family_common: string | null
          fishbase_id: number | null
          freshwater: boolean | null
          game_fish: boolean
          id: string
          in_canada: boolean
          lw_a: number | null
          lw_b: number | null
          lw_method: string | null
          max_length_mm: number | null
          national_rank: string | null
          native_to_canada: boolean | null
          order_name: string | null
          regions: string[]
          saltwater: boolean | null
          scientific_name: string | null
          updated_at: string
          wild_species_code: string | null
        }
        Insert: {
          brackish?: boolean | null
          common_name: string
          common_name_fr?: string | null
          dex_no?: number | null
          family?: string | null
          family_common?: string | null
          fishbase_id?: number | null
          freshwater?: boolean | null
          game_fish?: boolean
          id: string
          in_canada?: boolean
          lw_a?: number | null
          lw_b?: number | null
          lw_method?: string | null
          max_length_mm?: number | null
          national_rank?: string | null
          native_to_canada?: boolean | null
          order_name?: string | null
          regions?: string[]
          saltwater?: boolean | null
          scientific_name?: string | null
          updated_at?: string
          wild_species_code?: string | null
        }
        Update: {
          brackish?: boolean | null
          common_name?: string
          common_name_fr?: string | null
          dex_no?: number | null
          family?: string | null
          family_common?: string | null
          fishbase_id?: number | null
          freshwater?: boolean | null
          game_fish?: boolean
          id?: string
          in_canada?: boolean
          lw_a?: number | null
          lw_b?: number | null
          lw_method?: string | null
          max_length_mm?: number | null
          national_rank?: string | null
          native_to_canada?: boolean | null
          order_name?: string | null
          regions?: string[]
          saltwater?: boolean | null
          scientific_name?: string | null
          updated_at?: string
          wild_species_code?: string | null
        }
        Relationships: []
      }
      species_aliases: {
        Row: {
          alias: string
          alias_type: string
          species_id: string
        }
        Insert: {
          alias: string
          alias_type: string
          species_id: string
        }
        Update: {
          alias?: string
          alias_type?: string
          species_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "species_aliases_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      species_profiles: {
        Row: {
          canada_notes: string | null
          canada_status: string | null
          depth_max_m: number | null
          depth_min_m: number | null
          diet: string | null
          environment: string | null
          feeding: string | null
          habitat: string | null
          id_features: string | null
          image_author: string | null
          image_license: string | null
          image_page_url: string | null
          image_thumb_url: string | null
          image_url: string | null
          iucn_status: string | null
          longevity_years: number | null
          max_weight_g: number | null
          migration: string | null
          spawning_months: number[] | null
          species_id: string
          summary: string | null
          summary_url: string | null
          temp_pref_max_c: number | null
          temp_pref_min_c: number | null
          updated_at: string
          wikidata_id: string | null
        }
        Insert: {
          canada_notes?: string | null
          canada_status?: string | null
          depth_max_m?: number | null
          depth_min_m?: number | null
          diet?: string | null
          environment?: string | null
          feeding?: string | null
          habitat?: string | null
          id_features?: string | null
          image_author?: string | null
          image_license?: string | null
          image_page_url?: string | null
          image_thumb_url?: string | null
          image_url?: string | null
          iucn_status?: string | null
          longevity_years?: number | null
          max_weight_g?: number | null
          migration?: string | null
          spawning_months?: number[] | null
          species_id: string
          summary?: string | null
          summary_url?: string | null
          temp_pref_max_c?: number | null
          temp_pref_min_c?: number | null
          updated_at?: string
          wikidata_id?: string | null
        }
        Update: {
          canada_notes?: string | null
          canada_status?: string | null
          depth_max_m?: number | null
          depth_min_m?: number | null
          diet?: string | null
          environment?: string | null
          feeding?: string | null
          habitat?: string | null
          id_features?: string | null
          image_author?: string | null
          image_license?: string | null
          image_page_url?: string | null
          image_thumb_url?: string | null
          image_url?: string | null
          iucn_status?: string | null
          longevity_years?: number | null
          max_weight_g?: number | null
          migration?: string | null
          spawning_months?: number[] | null
          species_id?: string
          summary?: string | null
          summary_url?: string | null
          temp_pref_max_c?: number | null
          temp_pref_min_c?: number | null
          updated_at?: string
          wikidata_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "species_profiles_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: true
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      spots: {
        Row: {
          created_at: string
          deleted_at: string | null
          depth_m: number | null
          id: string
          lat: number
          lng: number
          name: string
          notes: string | null
          updated_at: string
          user_id: string
          waterbody_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          depth_m?: number | null
          id?: string
          lat: number
          lng: number
          name: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          waterbody_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          depth_m?: number | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          waterbody_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waterbodies: {
        Row: {
          area_ha: number | null
          attributes: Json
          bbox: number[] | null
          depth_maps: Json
          geom: unknown
          id: string
          kind: string
          lat: number | null
          lng: number | null
          max_depth_m: number | null
          mean_depth_m: number | null
          name: string | null
          region: string
          source: string
          source_id: string
          updated_at: string
        }
        Insert: {
          area_ha?: number | null
          attributes?: Json
          bbox?: number[] | null
          depth_maps?: Json
          geom?: unknown
          id?: string
          kind?: string
          lat?: number | null
          lng?: number | null
          max_depth_m?: number | null
          mean_depth_m?: number | null
          name?: string | null
          region: string
          source: string
          source_id: string
          updated_at?: string
        }
        Update: {
          area_ha?: number | null
          attributes?: Json
          bbox?: number[] | null
          depth_maps?: Json
          geom?: unknown
          id?: string
          kind?: string
          lat?: number | null
          lng?: number | null
          max_depth_m?: number | null
          mean_depth_m?: number | null
          name?: string | null
          region?: string
          source?: string
          source_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      waterbody_keys: {
        Row: {
          key_type: string
          key_value: string
          waterbody_id: string
        }
        Insert: {
          key_type: string
          key_value: string
          waterbody_id: string
        }
        Update: {
          key_type?: string
          key_value?: string
          waterbody_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waterbody_keys_waterbody_id_fkey"
            columns: ["waterbody_id"]
            isOneToOne: false
            referencedRelation: "waterbodies"
            referencedColumns: ["id"]
          },
        ]
      }
      waterbody_species: {
        Row: {
          first_observed: string | null
          last_observed: string | null
          observations: number
          source: string
          species_id: string
          updated_at: string
          waterbody_id: string
        }
        Insert: {
          first_observed?: string | null
          last_observed?: string | null
          observations?: number
          source: string
          species_id: string
          updated_at?: string
          waterbody_id: string
        }
        Update: {
          first_observed?: string | null
          last_observed?: string | null
          observations?: number
          source?: string
          species_id?: string
          updated_at?: string
          waterbody_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waterbody_species_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waterbody_species_waterbody_id_fkey"
            columns: ["waterbody_id"]
            isOneToOne: false
            referencedRelation: "waterbodies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      finalize_observations: { Args: { p_source: string }; Returns: number }
      leaderboard: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_since?: string
          p_species_id?: string
        }
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
      my_profile: {
        Args: never
        Returns: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          friend_code: string
          id: string
          units: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      patch_species: { Args: { p_rows: Json }; Returns: number }
      patch_species_profiles: { Args: { p_rows: Json }; Returns: number }
      reference_version: { Args: { p_table: string }; Returns: string }
      replace_species_aliases: {
        Args: { p_rows: Json; p_type: string }
        Returns: number
      }
      send_friend_request: { Args: { p_code: string }; Returns: Json }
      set_species_wiki: { Args: { p_rows: Json }; Returns: number }
      set_waterbody_depth_maps: {
        Args: { p_licence: string; p_rows: Json; p_source: string }
        Returns: number
      }
      set_waterbody_depths: { Args: { p_rows: Json }; Returns: number }
      species_version: { Args: never; Returns: string }
      stage_observations: {
        Args: { p_rows: Json; p_source: string }
        Returns: number
      }
      upsert_waterbodies: {
        Args: {
          p_region: string
          p_rows: Json
          p_run: string
          p_source: string
        }
        Returns: number
      }
      waterbody_at: { Args: { p_lat: number; p_lng: number }; Returns: string }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
