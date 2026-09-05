import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { GlassCard } from "@/components/GlassCard";
import { LureColourDot } from "@/components/LureColourDot";
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
import { getDb } from "@/database/db";
import { getOnboardingCompleted } from "@/database/preferences";
import { getLures, type Lure } from "@/database/lures";
import { formatWind } from "@/services/weather";
import { getStreakData, type StreakData } from "@/services/statistics";
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

function autoTripName(t: (key: string) => string): string {
  const hour = new Date().getHours();
  if (hour >= 4  && hour < 9)  return t("home.tripMorning");
  if (hour >= 9  && hour < 12) return t("home.tripLateMorning");
  if (hour >= 12 && hour < 14) return t("home.tripNoon");
  if (hour >= 14 && hour < 18) return t("home.tripAfternoon");
  if (hour >= 18 && hour < 22) return t("home.tripEvening");
  return t("home.tripNight");
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

/** Amber pill that breathes in/out while a trip is active. */
function LiveBadge() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.2, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true })
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <Animated.View style={[liveBadge.root, { opacity }]}>
      <View style={liveBadge.dot} />
      <Text style={liveBadge.text}>LIVE</Text>
    </Animated.View>
  );
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
  const addCatch = useStrikeStore((state) => state.addCatch);
  const updateEvent = useStrikeStore((state) => state.updateEvent);
  const recoveredStaleTrip = useStrikeStore((state) => state.recoveredStaleTrip);
  const changeLure = useStrikeStore((state) => state.changeLure);
  const saveRecoveredTrip = useStrikeStore((state) => state.saveRecoveredTrip);
  const discardRecoveredTrip = useStrikeStore((state) => state.discardRecoveredTrip);

  const celebAnim = useRef(new Animated.Value(0)).current;

  const [now, setNow] = useState(Date.now());
  const [tripNameOpen, setTripNameOpen] = useState(false);
  const [tripTitle, setTripTitle] = useState("");
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [modalLures, setModalLures] = useState<Lure[]>([]);
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [lureChangeOpen, setLureChangeOpen] = useState(false);
  const [selectedLureId, setSelectedLureId] = useState<string | null>(null);
  const [catchPickerOpen, setCatchPickerOpen] = useState(false);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);

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

  useEffect(() => {
    getStreakData().then(setStreakData).catch(() => null);
  }, [trips.length]);

  useEffect(() => {
    getDb()
      .then((db) => db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM events WHERE sync_status = 'pending'"))
      .then((row) => setPendingCount(row?.count ?? 0))
      .catch(() => null);
  }, [trips.length, activeTrip?.events.length]);

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
  const isEmpty = trips.length === 0 && !activeTrip;

  // Load lures whenever we need them (trip start or active trip)
  useEffect(() => {
    if (modalLures.length === 0) {
      getDb().then(getLures).then((list) => {
        setModalLures(list);
      }).catch(() => null);
    }
  }, []);

  const handleStartPress = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTripTitle(suggestTripName(currentLocation, trips) ?? "");
    getDb().then(getLures).then((list) => {
      setModalLures(list);
      const fav = list.find((l) => l.isFavourite);
      setSelectedLureId(fav?.id ?? null);
    }).catch(() => null);
    setTripNameOpen(true);
  }, [currentLocation, trips]);

  const beginTrip = useCallback((title?: string) => {
    setTripNameOpen(false);
    setTripTitle("");
    startTrip(undefined, "gps", title?.trim() || autoTripName(t), selectedLureId ?? undefined);
    router.push("/map");
  }, [startTrip, selectedLureId, t]);

  const handleEvent = useCallback(async (type: "contact" | "following") => {
    if (!activeTrip) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addEvent(type);
  }, [activeTrip, addEvent]);

  const handleCatch = useCallback(async () => {
    if (!activeTrip) return;
    addCatch({
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
  }, [activeTrip, addCatch, currentLocation, celebAnim]);

  const savePhotoToCatch = useCallback(async (tripId: string, eventId: string, uri: string) => {
    if (!activeTrip) return;
    const event = activeTrip.events.find((e) => e.id === eventId);
    if (!event) return;
    try {
      const dest = `${FileSystem.documentDirectory}strike_catch_${eventId}_${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      updateEvent(tripId, { ...event, photoUri: dest });
    } catch {
      updateEvent(tripId, { ...event, photoUri: uri });
    }
  }, [activeTrip, updateEvent]);

  const attachPhotoToTrip = useCallback(async (uri: string) => {
    if (!activeTrip) return;
    const catches = activeTrip.events.filter((e) => e.type === "catch");
    if (catches.length === 0) {
      Alert.alert(t("catch.noYetCatch") ?? "Log a catch first to attach a photo");
      return;
    }
    if (catches.length === 1) {
      await savePhotoToCatch(activeTrip.id, catches[0].id, uri);
    } else {
      setPendingPhotoUri(uri);
      setCatchPickerOpen(true);
    }
  }, [activeTrip, savePhotoToCatch, t]);

  const handlePhoto = useCallback(() => {
    Alert.alert(t("catch.addPhoto"), undefined, [
      {
        text: t("catch.takePhoto"), onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (perm.status !== "granted") {
            Alert.alert(t("catch.cameraPermissionDenied") ?? "Camera access denied");
            return;
          }
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.85 });
          if (!result.canceled && result.assets[0]) {
            await attachPhotoToTrip(result.assets[0].uri);
          }
        },
      },
      {
        text: t("catch.chooseLibrary"), onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: false,
            quality: 0.85,
          });
          if (!result.canceled && result.assets[0]) {
            await attachPhotoToTrip(result.assets[0].uri);
          }
        },
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }, [attachPhotoToTrip, t]);

  const handleStop = useCallback(() => {
    if (!activeTrip) return;
    Alert.alert(
      t("trip.stopConfirmTitle"),
      t("trip.stopConfirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("trip.stopConfirmBtn"),
          style: "destructive",
          onPress: async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            stopTrip();
            router.push("/summary");
          },
        },
      ]
    );
  }, [activeTrip, stopTrip, t]);

  if (!onboardingChecked) {
    return <View style={styles.bootGate} />;
  }

  return (
    <Screen contentStyle={styles.content}>
      {/* ── Header ── */}
      <View style={styles.headerHero}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image
              source={require("../../assets/strike-logo.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>{t("home.tagline")}</Text>
          </View>
          {activeTrip ? <LiveBadge /> : null}
        </View>
      </View>

      {/* ── Stale-trip recovery banner ── */}
      {recoveredStaleTrip ? (
        <GlassCard style={styles.recoverBanner}>
          <Text style={styles.recoverTitle}>{t("home.recoverTitle")}</Text>
          <Text style={styles.recoverBody}>
            {t("home.recoverBody", {
              date: new Date(recoveredStaleTrip.startedAt).toLocaleDateString([], {
                weekday: "short",
                month: "short",
                day: "numeric"
              })
            })}
          </Text>
          <View style={styles.recoverButtons}>
            <Pressable style={styles.recoverSaveBtn} onPress={() => { saveRecoveredTrip(); router.push("/summary"); }}>
              <Ionicons name="checkmark-circle-outline" size={16} color={Colors.textOnAmber} />
              <Text style={styles.recoverSaveText}>{t("home.recoverSave")}</Text>
            </Pressable>
            <Pressable style={styles.recoverDiscardBtn} onPress={discardRecoveredTrip}>
              <Text style={styles.recoverDiscardText}>{t("home.recoverDiscard")}</Text>
            </Pressable>
          </View>
        </GlassCard>
      ) : null}

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
            <ActionButton compact label={t("actions.newCatch")} icon="fish-outline" tone="catch" onPress={() => void handleCatch()} />
            <ActionButton compact label={t("actions.photo")} icon="camera-outline" tone="steel" onPress={handlePhoto} />
          </View>
          {/* Lure change pill */}
          {modalLures.length > 0 ? (
            <Pressable style={styles.lureChangePill} onPress={() => setLureChangeOpen(true)}>
              <Ionicons name="pricetag-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.lureChangePillText} numberOfLines={1}>
                {modalLures.find((l) => l.id === (activeTrip?.currentLureId ?? selectedLureId))?.name ?? t("actions.changeLure")}
              </Text>
              <Ionicons name="chevron-down" size={11} color={Colors.textMuted} />
            </Pressable>
          ) : null}
          <Pressable style={styles.stopButton} onPress={handleStop}>
            <Ionicons name="stop-circle-outline" size={20} color={Colors.dangerText} />
            <Text style={styles.stopText}>{t("actions.stopTrip")}</Text>
          </Pressable>
        </>
      )}

      {/* ── OVERBLIK / empty state ── */}
      {isEmpty ? (
        <StatCard style={styles.welcomeCard}>
          <Text style={styles.welcomeTitle}>{t("home.welcomeTitle")}</Text>
          <Text style={styles.welcomeText}>{t("home.welcomeText")}</Text>
          <Text style={styles.welcomeHint}>{t("home.welcomeHint")}</Text>
        </StatCard>
      ) : displayTrip ? (
        <>
          <SectionHeader
            title={t("home.overblik")}
            linkLabel={activeTrip ? t("home.openRouteMap") : undefined}
            onLinkPress={activeTrip ? () => router.push("/map") : undefined}
          />
          <Pressable
            style={styles.overblikCard}
            onPress={!activeTrip ? () => router.push(`/trip/${displayTrip.id}`) : undefined}
          >
            <TripMap
              route={displayTrip.route}
              events={displayTrip.events}
              height={150}
              interactive={false}
              isActive={!!activeTrip}
              currentLocation={activeTrip ? currentLocation ?? undefined : undefined}
              vignette
            />
            {overblikChips.length > 0 ? (
              <View style={styles.chipRow}>
                {overblikChips.map((chip) => (
                  <MetricChip key={chip.label} icon={chip.icon} label={chip.label} />
                ))}
              </View>
            ) : null}
          </Pressable>

          {/* Counter row */}
          <GlassCard style={styles.counterCard}>
            <View style={styles.counterInner}>
              <View style={styles.counterItem}>
                <AnimatedCounter value={tripContacts} style={styles.counterValue} />
                <Text style={styles.counterLabel}>{t("home.counter.contacts")}</Text>
              </View>
              <View style={styles.counterDivider} />
              <View style={styles.counterItem}>
                <AnimatedCounter value={tripFollowing} style={styles.counterValue} />
                <Text style={styles.counterLabel}>{t("home.counter.following")}</Text>
              </View>
              <View style={styles.counterDivider} />
              <View style={styles.counterItem}>
                <AnimatedCounter value={tripCatches} style={styles.counterValue} />
                <Text style={styles.counterLabel}>{t("home.counter.catches")}</Text>
              </View>
            </View>
          </GlassCard>

          {/* Streak chips */}
          {streakData && (streakData.tripsThisWeek > 0 || streakData.consecutiveDays > 0) ? (
            <View style={styles.streakRow}>
              {streakData.tripsThisWeek > 0 ? (
                <View style={styles.streakChip}>
                  <Ionicons name="calendar-outline" size={13} color={Colors.amber} />
                  <Text style={styles.streakChipText}>
                    {t("home.streak", { n: streakData.tripsThisWeek })}
                  </Text>
                </View>
              ) : null}
              {streakData.consecutiveDays > 0 ? (
                <View style={styles.streakChip}>
                  <Ionicons name="flame-outline" size={13} color={Colors.amber} />
                  <Text style={styles.streakChipText}>
                    {t("home.streakDays", { n: streakData.consecutiveDays })}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}

      {/* Sync status */}
      {pendingCount > 0 ? (
        <View style={styles.syncChip}>
          <Ionicons name="cloud-upload-outline" size={13} color={Colors.amber} />
          <Text style={styles.syncChipText}>{t("home.pendingSync", { n: pendingCount })}</Text>
        </View>
      ) : null}

      {/* ── MILJØDATA ── */}
      <SectionHeader
        title={t("home.miljoedata")}
        linkLabel={t("common.seeDetails")}
        onLinkPress={() => router.push("/stats")}
      />
      <WeatherStrip />

      {/* ── SENESTE TURE ── */}
      {!isEmpty && recentTrips.length > 0 ? (
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

      {/* ── Catch celebration overlay ── */}
      <Animated.View
        style={[styles.celebOverlay, { opacity: celebAnim }]}
        pointerEvents="none"
      >
        <Ionicons name="fish-outline" size={80} color={Colors.navy} />
        <Text style={styles.celebText}>{t("events.catch")}</Text>
      </Animated.View>

      {/* ── Lure change modal ── */}
      <Modal visible={lureChangeOpen} transparent animationType="fade" onRequestClose={() => setLureChangeOpen(false)}>
        <Pressable style={styles.modalScrim} onPress={() => setLureChangeOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("actions.changeLure")}</Text>
            <Pressable
              style={styles.lureChip}
              onPress={() => {
                changeLure(null, t("catch.noLure"));
                setLureChangeOpen(false);
              }}
            >
              <Text style={styles.lureChipText}>{t("catch.noLure")}</Text>
            </Pressable>
            {modalLures.map((lure) => (
              <Pressable
                key={lure.id}
                style={[styles.lureChip, activeTrip?.currentLureId === lure.id && styles.lureChipActive]}
                onPress={() => {
                  changeLure(lure.id, lure.name);
                  setLureChangeOpen(false);
                }}
              >
                <LureColourDot colourKey={lure.colour} colourSecondaryKey={lure.colourSecondary} size={10} />
                <Text style={[styles.lureChipText, activeTrip?.currentLureId === lure.id && styles.lureChipTextActive]} numberOfLines={1}>
                  {lure.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

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
            {modalLures.length > 0 ? (
              <View style={styles.lurePicker}>
                <Text style={styles.lurePickerLabel}>{t("home.startingLure")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lurePickerRow}>
                  <Pressable
                    style={[styles.lureChip, selectedLureId === null && styles.lureChipActive]}
                    onPress={() => setSelectedLureId(null)}
                  >
                    <Text style={[styles.lureChipText, selectedLureId === null && styles.lureChipTextActive]}>
                      {t("catch.noLure")}
                    </Text>
                  </Pressable>
                  {modalLures.map((lure) => (
                    <Pressable
                      key={lure.id}
                      style={[styles.lureChip, selectedLureId === lure.id && styles.lureChipActive]}
                      onPress={() => setSelectedLureId(lure.id)}
                    >
                      <LureColourDot colourKey={lure.colour} colourSecondaryKey={lure.colourSecondary} size={10} />
                      <Text style={[styles.lureChipText, selectedLureId === lure.id && styles.lureChipTextActive]} numberOfLines={1}>
                        {lure.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalSecondary} onPress={() => { setTripNameOpen(false); setTripTitle(""); }}>
                <Text style={styles.modalSecondaryText}>{t("home.cancelTripStart")}</Text>
              </Pressable>
              <Pressable style={styles.modalPrimary} onPress={() => beginTrip(tripTitle)}>
                <Ionicons name="navigate-circle-outline" size={20} color={Colors.textOnAmber} />
                <Text style={styles.modalPrimaryText}>{t("common.start")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Catch picker — attach photo to a specific catch ── */}
      <Modal visible={catchPickerOpen} transparent animationType="fade" onRequestClose={() => { setCatchPickerOpen(false); setPendingPhotoUri(null); }}>
        <Pressable style={styles.modalScrim} onPress={() => { setCatchPickerOpen(false); setPendingPhotoUri(null); }}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("catch.attachToWhich") ?? "Attach photo to catch:"}</Text>
            {activeTrip?.events.filter((e) => e.type === "catch").map((event, idx) => (
              <Pressable
                key={event.id}
                style={styles.lureChip}
                onPress={() => {
                  setCatchPickerOpen(false);
                  if (pendingPhotoUri && activeTrip) {
                    void savePhotoToCatch(activeTrip.id, event.id, pendingPhotoUri);
                  }
                  setPendingPhotoUri(null);
                }}
              >
                <Text style={styles.lureChipText}>
                  {event.species?.trim() ? event.species : `${t("events.catch")} ${idx + 1}`}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bootGate: {
    flex: 1,
    backgroundColor: Colors.navy
  },
  recoverBanner: {
    borderWidth: 1,
    borderColor: Colors.amber,
    padding: 16,
    gap: 8,
  },
  recoverTitle: {
    color: Colors.amber,
    fontFamily: Fonts.heading,
    fontSize: 14,
    letterSpacing: 0,
  },
  recoverBody: {
    color: Colors.text,
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
  },
  recoverButtons: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  recoverSaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.amber,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  recoverSaveText: {
    color: Colors.textOnAmber,
    fontFamily: Fonts.heading,
    fontSize: 13,
    letterSpacing: 0,
  },
  recoverDiscardBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: "center",
  },
  recoverDiscardText: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 13,
    letterSpacing: 0,
  },
  content: {
    gap: 20
  },

  // Header hero card — no overflow:hidden (solid bg, nothing to clip)
  headerHero: {
    borderRadius: 26,
    paddingTop: 18,
    paddingBottom: 26,
    paddingHorizontal: 8,
    backgroundColor: Colors.navy
  },

  // Header content row
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between"
  },
  // flex:1 + paddingRight so text never crowds the badge/button
  headerLeft: {
    flex: 1,
    paddingRight: 12
  },
  kicker: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 0
  },
  logoImage: {
    width: 110,
    height: 68,
  },
  tagline: {
    color: Colors.amber,
    fontSize: 11,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 2,
    marginTop: 2
  },

  // Lure change pill
  lureChangePill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: Colors.field,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  lureChangePillText: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodySemibold,
    fontSize: 12,
    letterSpacing: 0,
    maxWidth: 140,
  },

  // Sync status chip
  syncChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: Colors.field,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  syncChipText: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodySemibold,
    fontSize: 11,
    letterSpacing: 0,
  },

  // Active trip: event row + stop
  eventRow: {
    flexDirection: "row",
    gap: 10
  },
  stopButton: {
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    backgroundColor: Colors.dangerSoft,
    borderWidth: 1.5,
    borderColor: Colors.danger,
    shadowColor: Colors.danger,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.38,
    shadowRadius: 14,
    elevation: 9,
  },
  stopText: {
    color: Colors.dangerText,
    fontFamily: Fonts.heading,
    fontSize: 16,
    letterSpacing: 0
  },

  // OVERBLIK
  overblikCard: {
    borderRadius: 20,
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
    fontSize: 48,
    fontFamily: Fonts.black,
    letterSpacing: -1,
    lineHeight: 54
  },
  counterLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 1.5,
    textTransform: "uppercase"
  },
  counterDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.border
  },

  // Streak chips
  streakRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  streakChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: Colors.field,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  streakChipText: {
    color: Colors.text,
    fontFamily: Fonts.bodySemibold,
    fontSize: 12,
    letterSpacing: 0,
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
  welcomeHint: {
    color: Colors.amber,
    fontSize: 13,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 0,
    marginTop: 4
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
  },
  lurePicker: {
    gap: 8
  },
  lurePickerLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: Fonts.bodySemibold,
    textTransform: "uppercase",
    letterSpacing: 0
  },
  lurePickerRow: {
    flexDirection: "row",
    gap: 8
  },
  lureChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: Colors.field
  },
  lureChipActive: {
    backgroundColor: Colors.amber
  },
  lureChipText: {
    color: Colors.text,
    fontFamily: Fonts.bodySemibold,
    fontSize: 13,
    letterSpacing: 0,
    maxWidth: 120
  },
  lureChipTextActive: {
    color: Colors.textOnAmber
  },

  // Catch celebration
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
    fontSize: 36,
    letterSpacing: 0,
  },
});

const liveBadge = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.amber
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textOnAmber
  },
  text: {
    color: Colors.textOnAmber,
    fontFamily: Fonts.black,
    fontSize: 11,
    letterSpacing: 1.5
  }
});
