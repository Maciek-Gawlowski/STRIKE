import { Ionicons } from "@expo/vector-icons";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "@/i18n";
import type { ProtectionZone } from "@/services/protectionZones";
import { useStrikeStore } from "@/store/useStrikeStore";
import { useZoneStatus } from "@/store/useZoneStatus";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

/**
 * Persistent strip shown during a trip while the angler is inside, or close
 * to, a fredningsbælte closed today. The alert fires once; this stays, so the
 * information is still there after the alert has been dismissed. Tap for the
 * zone's period and order.
 */
export function ZoneBanner() {
  const { t } = useTranslation();
  const onTrip = useStrikeStore((state) => state.activeTrip != null);
  const inside = useZoneStatus((state) => state.inside);
  const near = useZoneStatus((state) => state.near);

  if (!onTrip) return null;
  const zone: ProtectionZone | undefined = inside[0] ?? near?.zone;
  if (!zone) return null;
  const isInside = inside.length > 0;

  const openDetails = () => {
    const lines = [`${t("zones.period")}: ${zone.periodText || "—"}`];
    if (zone.law) lines.push(`${t("zones.law")}: ${zone.law}`);
    const buttons: { text: string; style?: "cancel"; onPress?: () => void }[] = [
      { text: t("zones.close"), style: "cancel" }
    ];
    if (zone.url) {
      buttons.push({ text: t("zones.readRule"), onPress: () => void Linking.openURL(zone.url as string) });
    }
    Alert.alert(zone.name, lines.join("\n"), buttons);
  };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={openDetails}
      style={[styles.banner, isInside ? styles.inside : styles.near]}
    >
      <Ionicons name={isInside ? "warning" : "alert-circle-outline"} size={20} color={isInside ? "#fff" : Colors.text} />
      <View style={styles.textBlock}>
        <Text style={[styles.title, isInside && styles.titleInside]} numberOfLines={1}>
          {isInside
            ? t("zones.bannerInside", { name: zone.name })
            : t("zones.bannerNear", { name: zone.name, distance: Math.max(1, Math.round(near?.distanceM ?? 0)) })}
        </Text>
        <Text style={[styles.sub, isInside && styles.subInside]} numberOfLines={1}>
          {t("zones.bannerTap")}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={isInside ? "#fff" : Colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1
  },
  inside: {
    backgroundColor: "rgba(214, 69, 69, 0.92)",
    borderColor: "rgba(236, 102, 102, 1)"
  },
  near: {
    backgroundColor: "rgba(214, 69, 69, 0.14)",
    borderColor: "rgba(236, 102, 102, 0.55)"
  },
  textBlock: { flex: 1, gap: 2 },
  title: {
    color: Colors.text,
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 0
  },
  titleInside: { color: "#fff" },
  sub: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 12,
    letterSpacing: 0
  },
  subInside: { color: "rgba(255,255,255,0.85)" }
});
