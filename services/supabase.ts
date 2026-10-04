import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for the Bite Map backend.
 *
 * Reads the public (publishable) credentials from EXPO_PUBLIC_* env vars, which
 * Expo inlines at build time. The client is anonymous — no auth/session — and we
 * only ever read aggregate activity and insert zone-level rows (never GPS or any
 * user identifier). If the env vars are missing the client is `null` and every
 * caller degrades gracefully (the app still runs fully offline).
 */

// --- Database typings -------------------------------------------------------
//
// These describe the schema as it ACTUALLY is. They previously described a
// zone_id model the app had already abandoned, and because nothing checked
// them against the database, TypeScript happily compiled an insert of a
// column that did not exist. Every upload was rejected for weeks and the
// Activity Map stayed empty while the app looked healthy.
//
// If you change the schema, change this file in the same commit. It is the
// only thing that will tell you at compile time instead of at audit time.

export type BiteMapEventRow = {
  id: string;
  created_at: string;
  /** Legacy zone model, nullable and unused. Nothing writes it. */
  zone_id: number | null;
  /** Hex cell, ~461 m circumradius. The only position ever stored. */
  h3_cell: string | null;
  event_type: string;
  hour_of_day: number | null;
  date: string | null;
  wind_direction: string | null;
  water_temp: number | null;
  species: string | null;
  /** Random per-event id. The only way a device can withdraw its own row. */
  local_event_id: string | null;
};

export type BiteMapEventInsert = {
  h3_cell: string;
  local_event_id: string;
  event_type: string;
  hour_of_day: number;
  date: string;
  species?: string | null;
  wind_direction?: string | null;
  water_temp?: number | null;
};

export type FeedbackRow = {
  id: string;
  created_at: string;
  message: string;
  app_version: string | null;
  build_number: string | null;
  platform: string | null;
  device_model: string | null;
  local_user_id: string | null;
};

export type FeedbackInsert = {
  message: string;
  app_version?: string | null;
  build_number?: string | null;
  platform?: string | null;
  device_model?: string | null;
  local_user_id?: string | null;
};

/** Aggregated cell returned by bite_map_cells(). Below-threshold cells never appear. */
export type BiteMapCell = {
  h3_cell: string;
  catches: number;
  contacts: number;
  total: number;
};

export type Database = {
  public: {
    Tables: {
      bite_map_events: {
        Row: BiteMapEventRow;
        Insert: BiteMapEventInsert;
        Update: Partial<BiteMapEventInsert>;
        Relationships: [];
      };
      feedback: {
        Row: FeedbackRow;
        Insert: FeedbackInsert;
        Update: Partial<FeedbackInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      // Reads and deletes go through these rather than the table: anon holds
      // INSERT and nothing else. bite_map_cells applies the 3-observation
      // threshold in SQL, where a caller cannot remove it.
      bite_map_cells: {
        Args: {
          p_since: string;
          p_until?: string | null;
          p_species?: string | null;
          p_event_types?: string[] | null;
        };
        Returns: BiteMapCell[];
      };
      delete_bite_map_events: {
        Args: { p_ids: string[] };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

export const supabase: SupabaseClient<Database> | null =
  url && key
    ? createClient<Database>(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      })
    : null;

if (!supabase) {
  console.warn("[strike/supabase] EXPO_PUBLIC_SUPABASE_URL/KEY missing — Bite Map runs in local-only mode.");
}
