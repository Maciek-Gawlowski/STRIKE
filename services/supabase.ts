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

// --- Database typings (only the bite_map_events table is used) --------------

export type BiteMapEventRow = {
  id: string;
  created_at: string;
  zone_id: number;
  event_type: string;
  hour_of_day: number;
  date: string;
  wind_direction: string | null;
  water_temp: number | null;
  // Only populated for 'exact' contributions; null for zone-only.
  lat: number | null;
  lng: number | null;
};

export type BiteMapEventInsert = {
  zone_id: number;
  event_type: string;
  hour_of_day: number;
  date: string;
  wind_direction?: string | null;
  water_temp?: number | null;
  lat?: number | null;
  lng?: number | null;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
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
