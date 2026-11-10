import * as FileSystem from "expo-file-system/legacy";

/**
 * Where photos live, and why their stored paths cannot be trusted.
 *
 * Every photo the app keeps — profile picture, catch photos, trip photos — is
 * copied into FileSystem.documentDirectory and its full path written to the
 * database. On iOS that path looks like:
 *
 *   file:///var/mobile/Containers/Data/Application/<UUID>/Documents/photo-1.jpg
 *
 * and that <UUID> is not stable. iOS can hand the app a new data container on
 * update, which it does regularly through TestFlight. The file is still there;
 * the path saved next to it is not. So the photo "disappears" while sitting
 * untouched on disk.
 *
 * Claus reported it as his profile picture vanishing on every update. It was
 * never only the profile picture — every catch photo any tester has taken
 * stopped rendering the same way, quietly, because nobody opens an old catch
 * as often as they open their own profile.
 *
 * The fix is to treat the stored value as a FILE NAME with some stale
 * directory attached, and rebuild the path against today's container on every
 * read. That repairs existing rows with no migration: the name was always the
 * only durable part.
 */

/** Prefixes used by every writer in the app. See map.tsx, index.tsx, catch.tsx, privacy.tsx. */
const OWNED_PREFIXES = ["photo-", "strike_catch_", "strike_profile_"];

/**
 * Turns a stored photo reference into a URI that works right now.
 *
 * A path we recognise as ours is rebuilt against the current document
 * directory. Anything else — a library asset, a cache URI from a failed copy —
 * is handed back untouched, since guessing at those would turn a working
 * photo into a broken one.
 */
export function resolvePhotoUri(stored: string | null | undefined): string | undefined {
  if (!stored) return undefined;

  const name = stored.split("/").pop();
  if (!name || !OWNED_PREFIXES.some((prefix) => name.startsWith(prefix))) return stored;

  const dir = FileSystem.documentDirectory;
  return dir ? `${dir}${name}` : stored;
}
