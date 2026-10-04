import { supabase } from "./supabase";

/**
 * A readable record of whether the app can talk to the server.
 *
 * This exists because of a bug that cost roughly three months. The Activity
 * Map silently uploaded nothing from June onwards — first because the table
 * had no h3_cell column, then because release builds shipped without the
 * Supabase environment variables at all. Both failures were caught and
 * discarded by empty catch blocks, and the only evidence was a console.warn
 * that nobody could read: the app ships through TestFlight to people on
 * phones, and its developer works on Windows with no way to attach a console.
 *
 * So the status lives in the app instead, on the profile screen. A tester who
 * says "it says 'not configured'" has just done a day of debugging for us.
 */

export type SyncHealth = "unconfigured" | "ok" | "failing" | "unknown";

/**
 * Reads and writes are tracked separately, and this is not a detail.
 *
 * The first version of this file treated any success as proof of health. But
 * reading the Activity Map succeeds even when it is empty, so opening that tab
 * turned the light green while not one observation had ever been uploaded —
 * and because success also cleared the last failure, a rejected upload
 * followed by an empty read looked perfect. The panel existed to catch exactly
 * that class of bug and instead it hid one.
 *
 * So: a read proves reads work and nothing else, a failure is cleared only by
 * a success of the same kind, and the light is green only once something has
 * actually been sent.
 */
export type SyncStatus = {
  health: SyncHealth;
  /** Which operation last failed: "upload", "read", "delete-queue-flush", … */
  stage: string | null;
  /** The server's own words, trimmed. Not a translated string: we need the real one. */
  message: string | null;
  /** When the last failure happened. */
  failedAt: string | null;
  /** When something was last sent successfully. Reads do not count. */
  succeededAt: string | null;
  /** True once the app has read from the server without error, empty or not. */
  readsOk: boolean;
};

/** Which half of the connection an event concerns. */
export type SyncKind = "read" | "write";

const MAX_MESSAGE = 220;

// With no URL or key the client is null and every call is a silent no-op.
// That is the single most important thing this screen can tell you, and it is
// knowable before anything is even attempted.
let writeOkAt: string | null = null;
let readsOk = false;
let failure: { stage: string; message: string; at: string; kind: SyncKind } | null = null;

function derive(): SyncStatus {
  const health: SyncHealth = !supabase
    ? "unconfigured"
    : failure
      ? "failing"
      : writeOkAt
        ? "ok"
        : "unknown";
  return {
    health,
    stage: failure?.stage ?? null,
    message: failure?.message ?? null,
    failedAt: failure?.at ?? null,
    succeededAt: writeOkAt,
    readsOk
  };
}

let status: SyncStatus = derive();

type Listener = (next: SyncStatus) => void;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    try {
      listener(status);
    } catch {
      // A broken subscriber must not break syncing.
    }
  }
}

/** Subscribe to status changes. Returns an unsubscribe function. */
export function subscribeSyncStatus(listener: Listener): () => void {
  listeners.add(listener);
  listener(status);
  return () => {
    listeners.delete(listener);
  };
}

export function getSyncStatus(): SyncStatus {
  return status;
}

/**
 * Records a success. A read clears only a read failure; sending clears only a
 * send failure. Nothing here can turn the light green except an upload that
 * the server accepted.
 */
export function recordSyncSuccess(kind: SyncKind = "write"): void {
  if (!supabase) return;
  if (kind === "write") {
    writeOkAt = new Date().toISOString();
  } else {
    readsOk = true;
  }
  if (failure && failure.kind === kind) {
    failure = null;
  }
  status = derive();
  emit();
}

/**
 * Records a failure. Offline is not a failure — it is the normal state of a
 * phone on a beach, and reporting it would train people to ignore this panel.
 */
export function recordSyncFailure(stage: string, error: unknown, kind: SyncKind = "write"): void {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return String(error);
            }
          })();
  const message = (raw ?? "").slice(0, MAX_MESSAGE);

  if (/network|fetch|timeout|offline|abort/i.test(message)) {
    return;
  }

  failure = { stage, message, at: new Date().toISOString(), kind };
  status = derive();
  emit();
}
