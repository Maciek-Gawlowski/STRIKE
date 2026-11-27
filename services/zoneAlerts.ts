import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { Alert, AppState, Linking } from "react-native";
import { i18n } from "@/i18n";
import { zoneStatusAt, type ProtectionZone } from "@/services/protectionZones";
import { useZoneStatus } from "@/store/useZoneStatus";

/**
 * Warns an angler on a trip who walks into — or up to — a fredningsbælte that
 * is closed today.
 *
 * This used to be a React component reacting to the last route point. It is
 * plain code now because the check has to run while the phone is in a pocket:
 * the background location task delivers positions with no screen to render,
 * and a warning that waits for the next React commit is a warning that may
 * never arrive.
 *
 * It is fed from the same place the route is (services/tripTracking.ts), so
 * only fixes that survived the accuracy and speed guards are checked — a
 * cell-tower jump cannot put someone "inside" a zone they never went near.
 *
 * Three levels, deliberately unequal:
 * - Inside a zone: once per zone per trip. App open: a warning haptic and an
 *   alert naming the zone, its period and its order. App in the background: a
 *   local notification saying the same. Hearing it twice on one beach teaches
 *   people to dismiss it unread.
 * - Within NEAR_M of one: once per zone per trip. App open: a lighter haptic
 *   and the banner, no modal — standing next to a zone is legal. App in the
 *   background: a notification, because a haptic in a pocket is nothing and
 *   the boundaries are only accurate to ~37 m (see protectionZones.ts), so
 *   "near" can already be "inside".
 * - Everything else: the banner disappears.
 *
 * Like the rest of the app it never says "you may fish here". It names a zone
 * and its rule; the angler decides.
 */

/** Warn this close. Covers the ~37 m boundary simplification plus GPS wander. */
const NEAR_M = 100;
/** Re-check only after moving this far, so a phone resting on a rock is quiet. */
const RECHECK_M = 8;

type Point = { latitude: number; longitude: number };

let currentTripId: string | null = null;
let alertedInside = new Set<string>();
let alertedNear = new Set<string>();
let lastChecked: Point | null = null;

function metresBetween(a: Point, b: Point): number {
  const latRad = ((a.latitude + b.latitude) / 2) * (Math.PI / 180);
  const dx = (b.longitude - a.longitude) * 111320 * Math.cos(latRad);
  const dy = (b.latitude - a.latitude) * 111132;
  return Math.hypot(dx, dy);
}

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

/** Forgets what was announced. Called when a trip starts, ends or changes. */
export function resetZoneAlerts(tripId: string | null): void {
  currentTripId = tripId;
  alertedInside = new Set();
  alertedNear = new Set();
  lastChecked = null;
  useZoneStatus.getState().clear();
}

/** Runs the zone check for one accepted GPS fix on the given trip. */
export function checkZones(point: Point, tripId: string): void {
  if (tripId !== currentTripId) resetZoneAlerts(tripId);
  if (lastChecked && metresBetween(lastChecked, point) < RECHECK_M) return;
  lastChecked = point;

  let status;
  try {
    status = zoneStatusAt(point.latitude, point.longitude, NEAR_M);
  } catch (error) {
    // A broken zone file must not take the trip down with it.
    console.warn("[strike/zones] status check failed", error);
    return;
  }
  useZoneStatus.getState().set(status.inside, status.near);

  const foreground = AppState.currentState === "active";

  const fresh = status.inside.filter((zone) => !alertedInside.has(zone.id));
  if (fresh.length > 0) {
    for (const zone of fresh) alertedInside.add(zone.id);
    if (foreground) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      announceInside(fresh);
    } else {
      notify(t("zones.insideTitle", { name: fresh[0].name }), insideLines(fresh).join("\n"));
    }
    return;
  }

  if (status.near && !alertedNear.has(status.near.zone.id)) {
    const { zone, distanceM } = status.near;
    alertedNear.add(zone.id);
    if (foreground) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    } else {
      notify(
        t("zones.nearTitle", { name: zone.name }),
        t("zones.nearBody", { distance: Math.max(1, Math.round(distanceM)), period: zone.periodText || "—" })
      );
    }
  }
}

function insideLines(zones: ProtectionZone[]): string[] {
  const zone = zones[0];
  const lines = [t("zones.insideBody"), "", `${t("zones.period")}: ${zone.periodText || "—"}`];
  if (zone.law) lines.push(`${t("zones.law")}: ${zone.law}`);
  if (zones.length > 1) lines.push("", t("zones.alsoIn", { names: zones.slice(1).map((z) => z.name).join(", ") }));
  return lines;
}

function announceInside(zones: ProtectionZone[]) {
  const zone = zones[0];
  const buttons: { text: string; style?: "cancel"; onPress?: () => void }[] = [
    { text: t("zones.understood"), style: "cancel" }
  ];
  if (zone.url) {
    buttons.push({ text: t("zones.readRule"), onPress: () => void Linking.openURL(zone.url as string) });
  }
  Alert.alert(t("zones.insideTitle", { name: zone.name }), insideLines(zones).join("\n"), buttons);
}

/**
 * Shows a local notification now. Never throws: if notifications were
 * declined this does nothing, and the banner is still there when the angler
 * next looks at the screen.
 */
function notify(title: string, body: string) {
  void Notifications.scheduleNotificationAsync({
    content: { title, body, sound: "default" },
    trigger: null
  }).catch((error) => console.warn("[strike/zones] notification failed", error));
}
