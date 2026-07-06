import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { GlassCard } from "@/components/GlassCard";
import { MetricChip } from "@/components/MetricChip";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { StatCard } from "@/components/StatCard";
import { TripMap } from "@/components/TripMap";
import { WeatherStrip } from "@/components/WeatherStrip";
import {
  formatDistance,
  formatDuration,
  useStrikeStore,
  type Coordinate,
  type Trip
} from "@/store/useStrikeStore";
import { getOnboardingCompleted } from "@/database/preferences";
import { formatWind } from "@/services/weather";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

const SAME_SPOT_METERS = 500;

function metersBetween(a: Coordinate, b: Coordinate): number {
  const radius = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function suggestTripName(location: Coordinate | null, trips: Trip[]): string | null {
  if (!location) return null;
  for (const trip of trips) {
    const start = trip.route[0];
    if (start && trip.title && metersBetween(location, start) <= SAME_SPOT_METERS) {
      return trip.title;
    }
  }
  return null;
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const activeTrip = useStrikeStore((state) => state.activeTrip);
  const currentLocation = useStrikeStore((state) => state.currentLocation);
  const trips = useStrikeStore((state) => state.trips);
  const weather = useStrikeStore((state) => state.weather);
  const startTrip = useStrikeStore((state) => state.startTrip);
  const stopTrip = useStrikeStore((state) => state.stopTrip);
  const addEvent = useStrikeStore((state) => state.addEvent);

  const [now, setNow] = useState(Date.now());
  const [tripNameOpen, setTripNameOpen] = useState(false);
  const [tripTitle, setTripTitle] = useState("");
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    let mounted = true;
    getOnboardingCompleted()
      .then((done) => {
        if (!mounted) return;
        if (done) {
          setOnboardingChecked(true);
        } else {
          router.replace("/onboarding");
        }
      })
      .catch(() => {
        if (mounted) setOnboardingChecked(true);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // The trip shown in OVERBLIK: active trip if running, otherwise last completed trip.
  const displayTrip = activeTrip ?? trips[0] ?? null;

  const tripContacts = useMemo(() =>
    displayTrip?.events.filter((e) => e.type === "contact").length ?? 0,
    [displayTrip]
  );
  const tripFollowing = useMemo(() =>
    displayTrip?.events.filter((e) => e.type === "following").length ?? 0,
    [displayTrip]
  );
  const tripCatches = useMemo(() =>
    displayTrip?.events.filter((e) => e.type === "catch").length ?? 0,
    [displayTrip]
  );

  type ChipDef = { icon: "walk-outline" | "time-outline" | "water-outline" | "navigate-outline"; label: string };

  const overblikChips = useMemo((): ChipDef[] => {
    if (!displayTrip) return [];
    const endTime = activeTrip ? new Date(now).toISOString() : displayTrip.endedAt;
    const chips: ChipDef[] = [
      { icon: "walk-outline", label: formatDistance(displayTrip.distanceMeters) },
      { icon: "time-outline", label: formatDuration(displayTrip.startedAt, endTime) }
    ];
    if (weather?.waterTemp != null) {
      chips.push({ icon: "water-outline", label: t("weather.water", { v: Math.round(weather.waterTemp) }) });
    }
    if (weather) {
      chips.push({ icon: "navigate-outline", label: formatWind(weather) });
    }
    return chips;
  }, [displayTrip, activeTrip, now, weather, t]);

  const recentTrips = trips.slice(0, 3);

  const handleStartPress = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTripTitle(suggestTripName(currentLocation, trips) ?? "");
    setTripNameOpen(true);
  }, [currentLocation, trips]);

  const beginTrip = useCallback((title?: string) => {
    setTripNameOpen(false);
    setTripTitle("");
    startTrip(undefined, "gps", title);
    router.push("/map");
  }, [startTrip]);

  const handleEvent = useCallback(async (type: "contact" | "following") => {
    if (!activeTrip) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addEvent(type);
  }, [activeTrip, addEvent]);

  const handleStop = useCallback(async () => {
    if (!activeTrip) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    stopTrip();
    router.push("/summary");
  }, [activeTrip, stopTrip]);

  if (!onboardingChecked) {
    return <View style={styles.bootGate} />;
  }

  return (
    <Screen contentStyle={styles.content}>
      {/* ── Header (solid navy, logo only) ── */}
      <View style={styles.headerHero}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>{t("home.kicker")}</Text>
            <Text style={styles.logo}>STRIKE</Text>
            <Text style={styles.tagline}>{t("home.tagline")}</Text>
          </View>
          <Pressable style={styles.iconButton}>
            <Ionicons name="notifications-outline" size={22} color={Colors.text} />
          </Pressable>
        </View>
      </View>

      {/* ── Primary CTA ── */}
      {!activeTrip ? (
        <ActionButton
          label={t("actions.startTrip")}
          icon="navigate-circle-outline"
          tone="green"
          onPress={handleStartPress}
        />
      ) : (
        <>
          <View style={styles.eventRow}>
            <ActionButton compact label={t("actions.contact")} icon="flash-outline" tone="yellow" onPress={() => void handleEvent("contact")} />
            <ActionButton compact label={t("actions.following")} icon="eye-outline" tone="blue" onPress={() => void handleEvent("following")} />
            <ActionButton compact label={t("actions.newCatch")} icon="camera-outline" tone="catch" onPress={() => router.push("/catch")} />
          </View>
          <Pressable style={styles.stopButton} onPress={() => void handleStop()}>
            <Ionicons name="stop-circle-outline" size={20} color={Colors.dangerText} />
            <Text style={styles.stopText}>{t("actions.stopTrip")}</Text>
          </Pressable>
        </>
      )}

      {/* ── OVERBLIK ── */}
      {displayTrip ? (
        <>
          <SectionHeader
            title={t("home.overblik")}
            linkLabel={activeTrip ? t("home.openRouteMap") : undefined}
            onLinkPress={activeTrip ? () => router.push("/map") : undefined}
          />
          <View style={styles.overblikCard}>
            {/* Map fills top of card, clipped by outer borderRadius */}
            <TripMap route={displayTrip.route} events={displayTrip.events} height={150} interactive={false} />
            {overblikChips.length > 0 ? (
              <View style={styles.chipRow}>
                {overblikChips.map((chip) => (
                  <MetricChip key={chip.label} icon={chip.icon} label={chip.label} />
                ))}
              </View>
            ) : null}
          </View>

          {/* Counter row */}
          <GlassCard style={styles.counterCard}>
            <View style={styles.counterInner}>
              <View style={styles.counterItem}>
                <Text style={styles.counterValue}>{tripContacts}</Text>
                <Text style={styles.counterLabel}>{t("home.counter.contacts")}</Text>
              </View>
              <View style={styles.counterDivider} />
              <View style={styles.counterItem}>
                <Text style={styles.counterValue}>{tripFollowing}</Text>
                <Text style={styles.counterLabel}>{t("home.counter.following")}</Text>
              </View>
              <View style={styles.counterDivider} />
              <View style={styles.counterItem}>
                <Text style={styles.counterValue}>{tripCatches}</Text>
                <Text style={styles.counterLabel}>{t("home.counter.catches")}</Text>
              </View>
            </View>
          </GlassCard>
        </>
      ) : (
        // Welcome state for new users
        <StatCard style={styles.welcomeCard}>
          <Text style={styles.welcomeTitle}>{t("home.welcomeTitle")}</Text>
          <Text style={styles.welcomeText}>{t("home.welcomeText")}</Text>
        </StatCard>
      )}

      {/* ── MILJØDATA ── */}
      <SectionHeader
        title={t("home.miljoedata")}
        linkLabel={t("common.seeDetails")}
        onLinkPress={() => router.push("/bitemap")}
      />
      <WeatherStrip />

      {/* ── SENESTE TURE ── */}
      {recentTrips.length > 0 ? (
        <>
          <SectionHeader
            title={t("home.senesteTure")}
            linkLabel={t("common.seeAll")}
            onLinkPress={() => router.push("/logbook")}
          />
          <View style={styles.tripList}>
            {recentTrips.map((trip) => {
              const catches = trip.events.filter((e) => e.type === "catch").length;
              const contacts = trip.events.filter((e) => e.type === "contact").length;
              return (
                <Pressable
                  key={trip.id}
                  style={styles.tripCard}
                  onPress={() => router.push(`/trip/${trip.id}`)}
                >
                  <View style={styles.tripCardMain}>
                    <Text style={styles.tripName} numberOfLines={1}>{trip.title}</Text>
                    <Text style={styles.tripDate}>
                      {new Date(trip.startedAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      })}
                    </Text>
                  </View>
                  <View style={styles.tripBadges}>
                    <Text style={styles.tripBadge}>
                      {t("logbook.catchesCount", { count: catches })}
                    </Text>
                    <Text style={styles.tripBadge}>
                      {t("logbook.contactsCount", { count: contacts })}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {/* ── Trip name modal ── */}
      <Modal visible={tripNameOpen} transparent animationType="fade" onRequestClose={() => setTripNameOpen(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalKicker}>{t("home.modalKicker")}</Text>
            <Text style={styles.modalTitle}>{t("home.modalTitle")}</Text>
            <Text style={styles.modalText}>{t("home.modalText")}</Text>
            <TextInput
              value={tripTitle}
              onChangeText={setTripTitle}
              placeholder={t("home.modalPlaceholder")}
              placeholderTextColor="#647a72"
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={() => beginTrip(tripTitle)}
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalSecondary} onPress={() => beginTrip()}>
                <Text style={styles.modalSecondaryText}>{t("common.skip")}</Text>
              </Pressable>
              <Pressable style={styles.modalPrimary} onPress={() => beginTrip(tripTitle)}>
                <Ionicons name="navigate-circle-outline" size={20} color={Colors.textOnAmber} />
                <Text style={styles.modalPrimaryText}>{t("common.start")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bootGate: {
    flex: 1,
    backgroundColor: Colors.navy
  },
  content: {
    gap: 20
  },

  // Header hero card
  headerHero: {
    borderRadius: 26,
    overflow: "hidden",
    paddingTop: 18,
    paddingBottom: 26,
    paddingHorizontal: 6,
    backgroundColor: Colors.navy
  },

  // Header content row (sits on top of the gradient)
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between"
  },
  kicker: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 0
  },
  logo: {
    color: Colors.textBright,
    fontSize: 48,
    fontFamily: Fonts.black,
    letterSpacing: 0,
    lineHeight: 52
  },
  tagline: {
    color: Colors.amber,
    fontSize: 11,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 2,
    marginTop: 2
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.field,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 4
  },

  // Active trip: event row + stop
  eventRow: {
    flexDirection: "row",
    gap: 10
  },
  stopButton: {
    minHeight: 58,
    borderRadius: 18,
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

  // OVERBLIK
  overblikCard: {
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: Colors.glassBg,
    borderWidth: 1,
    borderColor: Colors.glassBorder
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 14
  },

  // Counter row
  counterCard: {
    padding: 18
  },
  counterInner: {
    flexDirection: "row",
    alignItems: "center"
  },
  counterItem: {
    flex: 1,
    alignItems: "center",
    gap: 4
  },
  counterValue: {
    color: Colors.textBright,
    fontSize: 32,
    fontFamily: Fonts.black,
    letterSpacing: 0,
    lineHeight: 36
  },
  counterLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 1,
    textTransform: "uppercase"
  },
  counterDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.border
  },

  // Welcome card
  welcomeCard: {
    borderRadius: 26,
    gap: 8
  },
  welcomeTitle: {
    color: Colors.textBright,
    fontSize: 22,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  welcomeText: {
    color: Colors.textMuted,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: Fonts.body
  },

  // SENESTE TURE
  tripList: {
    gap: 10
  },
  tripCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border
  },
  tripCardMain: {
    flex: 1,
    gap: 2
  },
  tripName: {
    color: Colors.textBright,
    fontFamily: Fonts.heading,
    fontSize: 15,
    letterSpacing: 0
  },
  tripDate: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 12
  },
  tripBadges: {
    flexDirection: "row",
    gap: 6
  },
  tripBadge: {
    color: Colors.text,
    fontSize: 11,
    fontFamily: Fonts.bodySemibold,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: Colors.pill
  },

  // Modal
  modalScrim: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
    backgroundColor: "rgba(0, 0, 0, 0.68)"
  },
  modalCard: {
    borderRadius: 26,
    padding: 18,
    gap: 13,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border
  },
  modalKicker: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 0
  },
  modalTitle: {
    color: Colors.textBright,
    fontSize: 26,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  modalText: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.body
  },
  modalInput: {
    minHeight: 58,
    borderRadius: 18,
    paddingHorizontal: 16,
    color: Colors.text,
    backgroundColor: Colors.field,
    fontSize: 16,
    fontFamily: Fonts.body
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4
  },
  modalSecondary: {
    flex: 1,
    minHeight: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.field
  },
  modalSecondaryText: {
    color: Colors.text,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  modalPrimary: {
    flex: 1,
    minHeight: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: Colors.amber
  },
  modalPrimaryText: {
    color: Colors.textOnAmber,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  }
});
