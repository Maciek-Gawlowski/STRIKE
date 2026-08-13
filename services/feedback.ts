import type { SQLiteDatabase } from "expo-sqlite";
import { clearFeedbackQueueItem, getFeedbackQueue, type FeedbackData } from "@/database/queries";
import { supabase } from "./supabase";

/**
 * Sends a single feedback row to Supabase. Throws on failure (network/RLS)
 * so the caller can queue for retry.
 */
export async function sendFeedback(row: FeedbackData): Promise<void> {
  if (!supabase) throw new Error("no-supabase");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("feedback") as any).insert({
    message: row.message,
    app_version: row.appVersion,
    build_number: row.buildNumber,
    platform: row.platform,
    device_model: row.deviceModel,
    local_user_id: row.localUserId
  });
  if (error) throw error;
}

/**
 * Retries any feedback rows queued due to offline failure.
 * Called once on app start (hydrateStore). Fire-and-forget — never throws.
 */
export async function flushFeedbackQueue(db: SQLiteDatabase): Promise<void> {
  try {
    const rows = await getFeedbackQueue(db);
    for (const row of rows) {
      try {
        await sendFeedback(row);
        await clearFeedbackQueueItem(db, row.id);
      } catch {
        // Still offline for this row — leave it queued.
      }
    }
  } catch {
    // DB read failed — skip flush.
  }
}
