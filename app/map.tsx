import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { LureColourDot } from "@/components/LureColourDot";
import { MetricCard } from "@/components/MetricCard";
import { Screen } from "@/components/Screen";
import { SpeciesPrompt } from "@/components/SpeciesPrompt";
import { TripMap } from "@/components/TripMap";
import { formatDistance, formatDuration, useStrikeStore, type StrikeEvent } from "@/store/useStrikeStore";
import { getDb } from "@/database/db";
import { getLures, type Lure } from "@/database/lures";
import { useTranslation } from "@/i18n";
import type { MapType } from "@/database/preferences";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

const MAP_TYPES: MapType[] = ["standard", "satellite", "hybrid"];

const MAP_TYPE_LABEL_KEY: Record<MapType, string> = {
  standard: "settings.mapTypeStandard",
  satellite: "settings.mapTypeSatellite",
  hybrid: "settings.mapTypeHybrid"
};

export default function MapScreen() {
  const { t } = useTranslation();
  const activeTrip = useStrikeStore((state) => state.activeTrip);
  const currentLocation = useStrikeStore((state) => state.currentLocation);
  const addEvent = useStrikeStore((state) => state.addEvent);
  const addCatch = useStrikeStore((state) => state.addCatch);
  const updateEvent = useStrikeStore((state) => state.updateEvent);
  const stopTrip = useStrikeStore((state) => state.stopTrip);
  const mapType = useStrikeStore((state) => state.mapType);
  const setMapType = useStrikeStore((state) => state.setMapType);
  const setActiveLure = useStrikeStore((state) => state.setActiveLure);

  const celebAnim = useRef(new Animated.Value(0)).current;
  const [now, setNow] = useState(Date.now());
  const [lures, setLures] = useState<Lure[]>([]);
  const [lurePickerOpen, setLurePickerOpen] = useState(false);
  const [speciesPrompt, setSpeciesPrompt] = useState<StrikeEvent | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    getDb().then(getLures).then(setLures).catch(() => null);
  }, []);

  const handleEvent = async (type: "contact" | "following") => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addEvent(type);
  };

  const handleCatch = async () => {
    if (!activeTrip) return;
    // The catch is written first and the species asked for afterwards. Pressing
    // the button with a fish in one hand has to record something immediately —
    // if the species were a required step before saving, the honest outcome on
    // a windy beach is that nothing gets logged at all.
    const created = addCatch({
      species: "",
      comment: "",
      kept: false,
      position: currentLocation ?? undefined,
      lureId: activeTrip.currentLureId ?? undefined,
    });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    celebAnim.setValue(0);
    Animated.sequence([
      Animated.timing(celebAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(320),
      Animated.timing(celebAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
    if (created) setSpeciesPrompt(created);
  };

  /**
   * Attaches a species to the catch that was just logged. `resyncBiteMap` is
   * what pushes the corrected species to the shared map — the row went up the
   * moment the catch was created, carrying no species at all.
   */
  const confirmSpecies = (key: string) => {
    const event = speciesPrompt;
    setSpeciesPrompt(null);
    if (!event || !activeTrip) return;
    updateEvent(activeTrip.id, { ...event, species: key }, { resyncBiteMap: true });
  };

  const handlePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert(t("catch.cameraPermissionDenied") ?? "Camera access denied");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    try {
      const dest = `${FileSystem.documentDirectory}photo-${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      addEvent("photo", { photoUri: dest });
    } catch {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      addEvent("photo", { photoUri: uri });
    }
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
        {lures.length > 0 ? (
          <Pressable style={styles.lureIndicator} onPress={() => setLurePickerOpen(true)}>
            <LureColourDot
              colourKey={lures.find((l) => l.id === activeTrip.currentLureId)?.colour}
              colourSecondaryKey={lures.find((l) => l.id === activeTrip.currentLureId)?.colourSecondary}
              size={12}
            />
            <Text style={styles.lureIndicatorText} numberOfLines={1}>
              {lures.find((l) => l.id === activeTrip.currentLureId)?.name ?? t("catch.noLure")}
            </Text>
            <Ionicons name="pencil-outline" size={13} color={Colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View>
        <Text style={styles.kicker}>{t("trip.kicker")}</Text>
        <Text style={styles.title}>{activeTrip.title}</Text>
      </View>

      <TripMap
        route={activeTrip.route}
        events={activeTrip.events}
        height={390}
        mapType={mapType}
        isActive
        currentLocation={currentLocation ?? undefined}
      />

      <View style={styles.mapTypeRow}>
        {MAP_TYPES.map((type) => (
          <Pressable
            key={type}
            style={[styles.mapTypePill, mapType === type && styles.mapTypePillActive]}
            onPress={() => setMapType(type)}
          >
            <Text style={[styles.mapTypeText, mapType === type && styles.mapTypeTextActive]}>
              {t(MAP_TYPE_LABEL_KEY[type] as never)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Two explicit rows. As a single wrapping row, MetricCard's minWidth of
          30% fits three tiles and strands the fourth across the full width,
          which reads as a layout bug rather than a choice. */}
      <View style={styles.metrics}>
        <View style={styles.metricsRow}>
          <MetricCard label={t("metrics.time")} value={formatDuration(activeTrip.startedAt, new Date(now).toISOString())} />
          <MetricCard label={t("metrics.distance")} value={formatDistance(activeTrip.distanceMeters)} />
        </View>
        <View style={styles.metricsRow}>
          <MetricCard label={t("metrics.contacts")} value={contacts} />
          <MetricCard label={t("metrics.catches")} value={catches} />
        </View>
      </View>

      {/* The same four buttons as Home, from the same component. These were
          hand-rolled Pressables with no numberOfLines, which is why "Following"
          broke across two lines mid-word here but fitted on Home. Two
          implementations of one control also meant two sets of colours for the
          same four actions. */}
      <View style={styles.eventGrid}>
        <ActionButton compact label={t("actions.contact")} icon="flash-outline" tone="yellow" onPress={() => handleEvent("contact")} />
        <ActionButton compact label={t("actions.following")} icon="eye-outline" tone="blue" onPress={() => handleEvent("following")} />
        <ActionButton compact label={t("actions.newCatch")} icon="fish-outline" tone="catch" onPress={() => void handleCatch()} />
        <ActionButton compact label={t("actions.photo")} icon="camera-outline" tone="steel" onPress={handlePhoto} />
      </View>

      <Pressable style={styles.stopButton} onPress={handleStop}>
        <Ionicons name="stop-circle-outline" size={22} color={Colors.dangerText} />
        <Text style={styles.stopText}>{t("actions.stopTrip")}</Text>
      </Pressable>

      {/* Catch celebration flash */}
      <Animated.View style={[styles.celebOverlay, { opacity: celebAnim }]} pointerEvents="none">
        <Ionicons name="fish-outline" size={80} color={Colors.catchText} />
        <Text style={styles.celebText}>{t("events.catch")}</Text>
      </Animated.View>

      <Modal visible={lurePickerOpen} transparent animationType="fade" onRequestClose={() => setLurePickerOpen(false)}>
        <Pressable style={styles.modalScrim} onPress={() => setLurePickerOpen(false)}>
          <View style={styles.modalCard}>
            <Pressable
              style={styles.lureOption}
              onPress={() => { setActiveLure(null); setLurePickerOpen(false); }}
            >
              <Text style={styles.lureOptionText}>{t("catch.noLure")}</Text>
              {!activeTrip.currentLureId ? <Ionicons name="checkmark" size={20} color={Colors.amber} /> : null}
            </Pressable>
            {lures.map((lure) => (
              <Pressable
                key={lure.id}
                style={styles.lureOption}
                onPress={() => { setActiveLure(lure.id); setLurePickerOpen(false); }}
              >
                <View style={styles.lureOptionInner}>
                  {lure.isFavourite ? <Ionicons name="star" size={13} color={Colors.amber} /> : null}
                  <LureColourDot colourKey={lure.colour} colourSecondaryKey={lure.colourSecondary} size={12} />
                  <Text style={styles.lureOptionText}>{lure.name}</Text>
                </View>
                {lure.id === activeTrip.currentLureId ? <Ionicons name="checkmark" size={20} color={Colors.amber} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <SpeciesPrompt
        event={speciesPrompt}
        onPick={confirmSpecies}
        onDismiss={() => setSpeciesPrompt(null)}
        onMoreDetails={() => {
          const event = speciesPrompt;
          setSpeciesPrompt(null);
          if (event) router.push(`/event/${event.id}`);
        }}
      />

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
    borderRadius: 16,
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
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.field
  },
  kicker: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 0
  },
  title: {
    color: Colors.textBright,
    fontSize: 34,
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
  mapTypeRow: {
    flexDirection: "row",
    gap: 8
  },
  mapTypePill: {
    flex: 1,
    height: 36,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.field
  },
  mapTypePillActive: {
    backgroundColor: Colors.amber
  },
  mapTypeText: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodySemibold,
    fontSize: 13,
    letterSpacing: 0
  },
  mapTypeTextActive: {
    color: Colors.textOnAmber
  },
  metrics: {
    gap: 9
  },
  metricsRow: {
    flexDirection: "row",
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
  celebOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.catchGreen,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    zIndex: 99,
  },
  celebText: {
    color: Colors.catchText,
    fontFamily: Fonts.black,
    fontSize: 34,
    letterSpacing: 0,
  },
  stopButton: {
    height: 64,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    backgroundColor: Colors.dangerSoft,
    borderWidth: 1.5,
    borderColor: Colors.danger,
  },
  stopText: {
    color: Colors.dangerText,
    fontFamily: Fonts.heading,
    fontSize: 15,
    letterSpacing: 0
  },
  empty: {
    gap: 14,
    paddingTop: 40
  },
  lureIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: Colors.field,
    maxWidth: 180
  },
  lureIndicatorText: {
    color: Colors.text,
    fontFamily: Fonts.bodySemibold,
    fontSize: 13,
    letterSpacing: 0,
    flex: 1
  },
  modalScrim: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0, 0, 0, 0.64)"
  },
  modalCard: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border
  },
  lureOption: {
    minHeight: 56,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border
  },
  lureOptionInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1
  },
  lureOptionText: {
    color: Colors.textBright,
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 0
  }
});
