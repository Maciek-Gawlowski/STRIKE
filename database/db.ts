import * as SQLite from "expo-sqlite";
import { migrate } from "./schema";

const DATABASE_NAME = "strike.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Opens (once) and returns the shared SQLite connection. The schema migration
 * runs as part of the first open, so callers always get a ready database.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      try {
        await migrate(db);
      } catch (error) {
        // A migration failure must not brick the singleton — the app must remain
        // usable (schema is best-effort for existing columns; new ones may be
        // absent but no crash on launch).
        console.warn("[strike/db] migration error (continuing)", error);
      }
      return db;
    })();
  }
  return dbPromise;
}

/**
 * Serialized write queue.
 *
 * The Zustand actions are synchronous (the UI depends on that), so they cannot
 * `await` database writes. Instead they enqueue work here. Chaining every write
 * onto a single promise guarantees they apply in call order and never interleave
 * (e.g. startTrip must land before the route points that follow it).
 *
 * Writes are best-effort: a failed write is logged but never throws into the UI,
 * keeping the app fully usable offline.
 */
let writeChain: Promise<unknown> = Promise.resolve();

export function enqueueWrite(work: (db: SQLite.SQLiteDatabase) => Promise<void>): Promise<void> {
  const next = writeChain
    .then(() => getDb())
    .then((db) => work(db))
    .catch((error) => {
      console.warn("[strike/db] write failed", error);
    });
  // Keep the chain alive even if this link rejected.
  writeChain = next.catch(() => undefined);
  return next;
}

/**
 * Resolves once every queued write has drained. Useful in tests or before a
 * future sync pass.
 */
export function flushWrites(): Promise<unknown> {
  return writeChain;
}

export { DATABASE_NAME };
