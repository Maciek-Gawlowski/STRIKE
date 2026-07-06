import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { MetricCard } from "@/components/MetricCard";
import { Screen } from "@/components/Screen";
import { TripMap } from "@/components/TripMap";
import { formatDistance, formatDuration, useStrikeStore } from "@/store/useStrikeStore";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

export default function MapScreen() {
  const { t } = useTranslation();
  const activeTrip = useStrikeStore((state) => state.activeTrip);
  const addEvent = useStrikeStore((state) => state.addEvent);
  const stopTrip = useStrikeStore((state) => state.stopTrip);

  const handleEvent = async (type: "contact" | "following") => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addEvent(type);
  };

  const handleStop = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    stopTrip();
    router.replace("/summary");
  };

  if (!activeTrip) {
    return (
      <Screen>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
        <View style={styles.empty}>
          <Text style={styles.title}>{t("trip.noActiveTrip")}</Text>
          <Text style={styles.subtitle}>{t("trip.noActiveTripHint")}</Text>
          <ActionButton label={t("actions.startTrip")} icon="navigate-circle-outline" tone="green" onPress={() => router.replace("/")} />
        </View>
      </Screen>
    );
  }

  const contacts = activeTrip.events.filter((event) => event.type === "contact").length;
  const catches = activeTrip.events.filter((event) => event.type === "catch").length;

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.nav}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
          <Text style={styles.backText}>{t("common.home")}</Text>
        </Pressable>
      </View>

      <View>
        <Text style={styles.kicker}>{t("trip.kicker")}</Text>
        <Text style={styles.title}>{activeTrip.title}</Text>
      </View>

      <TripMap route={activeTrip.route} events={activeTrip.events} height={390} />

      <View style={styles.metrics}>
        <MetricCard label={t("metrics.time")} value={formatDuration(activeTrip.startedAt)} />
        <MetricCard label={t("metrics.distance")} value={formatDistance(activeTrip.distanceMeters)} />
        <MetricCard label={t("metrics.contacts")} value={contacts} />
        <MetricCard label={t("metrics.catches")} value={catches} />
      </View>

      <View style={styles.eventGrid}>
        <Pressable style={[styles.eventBtn, styles.eventContact]} onPress={() => handleEvent("contact")}>
          <Ionicons name="flash-outline" size={26} color={Colors.textOnAmber} />
          <Text style={[styles.eventBtnText, { color: Colors.textOnAmber }]}>{t("actions.contact")}</Text>
        </Pressable>
        <Pressable style={[styles.eventBtn, styles.eventFollowing]} onPress={() => handleEvent("following")}>
          <Ionicons name="eye-outline" size={26} color={Colors.textBright} />
          <Text style={[styles.eventBtnText, { color: Colors.textBright }]}>{t("actions.following")}</Text>
        </Pressable>
        <Pressable style={[styles.eventBtn, styles.eventCatch]} onPress={() => router.push("/catch")}>
          <Ionicons name="camera-outline" size={26} color="#06231A" />
          <Text style={[styles.eventBtnText, { color: "#06231A" }]}>{t("actions.newCatch")}</Text>
        </Pressable>
      </View>

      <Pressable style={styles.stopButton} onPress={handleStop}>
        <Ionicons name="stop-circle-outline" size={22} color={Colors.dangerText} />
        <Text style={styles.stopText}>{t("actions.stopTrip")}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16
  },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  back: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.field
  },
  backText: {
    color: Colors.text,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 0
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.field
  },
  kicker: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 0
  },
  title: {
    color: Colors.textBright,
    fontSize: 32,
    fontFamily: Fonts.heading,
    letterSpacing: 0,
    lineHeight: 36
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 14,
    fontFamily: Fonts.body
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9
  },
  actions: {
    flexDirection: "row",
    gap: 12
  },
  eventGrid: {
    flexDirection: "row",
    gap: 10
  },
  eventBtn: {
    flex: 1,
    minHeight: 96,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 12
  },
  eventContact: {
    backgroundColor: Colors.amber
  },
  eventFollowing: {
    backgroundColor: "#2F6F93"
  },
  eventCatch: {
    backgroundColor: Colors.cardElevated,
    borderWidth: 1,
    borderColor: Colors.border
  },
  eventBtnText: {
    fontFamily: Fonts.heading,
    fontSize: 14,
    textAlign: "center"
  },
  stopButton: {
    minHeight: 60,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: Colors.dangerSoft
  },
  stopText: {
    color: Colors.dangerText,
    fontFamily: Fonts.heading,
    fontSize: 16,
    letterSpacing: 0
  },
  empty: {
    gap: 14,
    paddingTop: 40
  }
});
