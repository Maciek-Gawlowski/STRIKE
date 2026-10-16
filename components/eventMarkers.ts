import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/theme/colors";

/**
 * How an event looks wherever it is drawn on a map.
 *
 * These used to live inside TripMap, which meant the Activity Map had no way
 * to show the same catch the same way without copying the values — and copied
 * values drift. One catch is one fish icon on one green chip, on every screen.
 *
 * The colours are deliberately NOT part of the brand palette: they are map
 * marker colours, chosen to stay apart from each other and from the activity
 * scale, and changing them silently re-labels every map in the app.
 */
export const EVENT_MARKER_COLORS: Record<string, string> = {
  contact:   "#f4c84f",
  following: "#5AA9E6",
  catch:     Colors.catchGreen,
  photo:     "#9B59B6",
};

export const EVENT_MARKER_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  contact:   "flash-outline",
  following: "eye-outline",
  catch:     "fish-outline",
  photo:     "camera-outline",
};

/**
 * Which event stands for a group of them in the same place. A catch outranks a
 * contact, a contact outranks a follow: the pin should show the best thing
 * that happened there, not whichever row the database returned first.
 */
const RANK: Record<string, number> = { catch: 3, contact: 2, following: 1, photo: 0 };

export function dominantEventType(types: string[]): string {
  let best = types[0] ?? "catch";
  for (const type of types) {
    if ((RANK[type] ?? -1) > (RANK[best] ?? -1)) best = type;
  }
  return best;
}
