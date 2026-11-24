import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Alert, Linking } from "react-native";
import { useTranslation } from "@/i18n";
import { zoneStatusAt, type ProtectionZone } from "@/services/protectionZones";
import { useStrikeStore } from "@/store/useStrikeStore";
import { useZoneStatus } from "@/store/useZoneStatus";

/**
 * Warns an angler on a trip who walks into — or up to — a fredningsbælte that
 * is closed today.
 *
 * Runs off the trip's own route, not a GPS subscription of its own: the route
 * only holds fixes that survived TripWatcher's accuracy and speed guards, so a
 * cell-tower jump cannot put someone "inside" a zone they never went near.
 *
 * Three levels, deliberately unequal:
 * - Inside a zone: a warning haptic and an alert naming the zone, its period
 *   and its order — once per zone per trip. Hearing it twice on one beach
 *   teaches people to dismiss it unread.
 * - Within NEAR_M of one: a lighter haptic, once per zone per trip, and the
 *   banner. No modal; standing next to a zone is legal.
 * - Everything else: the banner disappears.
 *
 * Like the rest of the app it never says "you may fish here". It names a zone
 * and its rule; the angler decides.
 *
 * Limitation, stated plainly: the app only tracks position while it is open,
 * so this only fires with the app in the foreground. A phone in a pocket gets
 * the warning the moment it is unlocked and the next fix lands — which is also
 * the moment someone logs a catch.
 */

/** Warn this close. Covers the ~37 m boundary simplification plus GPS wander. */
const NEAR_M = 100;
/** Re-check only after moving this far, so a phone resting on a rock is quiet. */
const RECHECK_M = 8;

function metresBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const latRad = ((a.latitude + b.latitude) / 2) * (Math.PI / 180);
  const dx = (b.longitude - a.longitude) * 111320 * Math.cos(latRad);
  const dy = (b.latitude - a.latitude) * 111132;
  return Math.hypot(dx, dy);
}

export function ZoneWatcher() {
  const { t } = useTranslation();
  const activeTripId = useStrikeStore((state) => state.activeTrip?.id ?? null);
  const lastPoint = useStrikeStore((state) => state.activeTrip?.route.at(-1) ?? null);
  const locationSource = useStrikeStore((state) => state.locationSource);

  // Per-trip memory of what has already been announced.
  const alertedInside = useRef(new Set<string>());
  const alertedNear = useRef(new Set<string>());
  const lastChecked = useRef<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    alertedInside.current = new Set();
    alertedNear.current = new Set();
    lastChecked.current = null;
    if (!activeTripId) useZoneStatus.getState().clear();
  }, [activeTripId]);

  useEffect(() => {
    if (!activeTripId || !lastPoint) return;
    // Simulated development routes must never produce a real-looking warning.
    if (locationSource === "mock") return;
    if (lastChecked.current && metresBetween(lastChecked.current, lastPoint) < RECHECK_M) return;
    lastChecked.current = lastPoint;

    let status;
    try {
      status = zoneStatusAt(lastPoint.latitude, lastPoint.longitude, NEAR_M);
    } catch (error) {
      // A broken zone file must not take the trip down with it.
      console.warn("[strike/zones] status check failed", error);
      return;
    }
    useZoneStatus.getState().set(status.inside, status.near);

    const fresh = status.inside.filter((zone) => !alertedInside.current.has(zone.id));
    if (fresh.length > 0) {
      for (const zone of fresh) alertedInside.current.add(zone.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      announceInside(fresh, t);
      return;
    }

    if (status.near && !alertedNear.current.has(status.near.zone.id)) {
      alertedNear.current.add(status.near.zone.id);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    }
  }, [activeTripId, lastPoint, locationSource, t]);

  return null;
}

function announceInside(zones: ProtectionZone[], t: (key: string, options?: Record<string, unknown>) => string) {
  const zone = zones[0];
  const lines = [
    t("zones.insideBody"),
    "",
    `${t("zones.period")}: ${zone.periodText || "—"}`
  ];
  if (zone.law) lines.push(`${t("zones.law")}: ${zone.law}`);
  if (zones.length > 1) lines.push("", t("zones.alsoIn", { names: zones.slice(1).map((z) => z.name).join(", ") }));

  const buttons: { text: string; style?: "cancel"; onPress?: () => void }[] = [
    { text: t("zones.understood"), style: "cancel" }
  ];
  if (zone.url) {
    buttons.push({ text: t("zones.readRule"), onPress: () => void Linking.openURL(zone.url as string) });
  }
  Alert.alert(t("zones.insideTitle", { name: zone.name }), lines.join("\n"), buttons);
}
