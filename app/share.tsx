import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { ShareCard, CARD_WIDTH, CARD_HEIGHT } from "@/components/ShareCard";
import { getDb } from "@/database/db";
import { getWeatherForEvent, type WeatherSnapshot } from "@/database/queries";
import { useStrikeStore } from "@/store/useStrikeStore";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

const PREFS_KEY = "strike.sharePrefs";
const PREVIEW_SCALE = 0.56;
const PREVIEW_W = Math.round(CARD_WIDTH * PREVIEW_SCALE);
const PREVIEW_H = Math.round(CARD_HEIGHT * PREVIEW_SCALE);

export default function ShareScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { t } = useTranslation();

  const trip = useStrikeStore((state) => {
    const found = state.trips.find((tr) => tr.id === tripId);
    if (found) return found;
    if (state.activeTrip?.id === tripId) return state.activeTrip;
    return null;
  });

  const shareCardRef = useRef<View>(null);
  const [shareCardReady, setShareCardReady] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [tripWeather, setTripWeather] = useState<WeatherSnapshot | null>(null);

  const [showPhotos, setShowPhotos] = useState(true);
  const [showRoute, setShowRoute] = useState(true);
  const [showLocation, setShowLocation] = useState(false);
  const [showStats, setShowStats] = useState(true);

  const firstCatchPhotoUri = trip?.events.find(
    (e) => e.type === "catch" && e.photoUri
  )?.photoUri;

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const p = JSON.parse(raw) as Record<string, boolean>;
          if (typeof p.showPhotos === "boolean") setShowPhotos(p.showPhotos);
          if (typeof p.showRoute === "boolean") setShowRoute(p.showRoute);
          if (typeof p.showLocation === "boolean") setShowLocation(p.showLocation);
          if (typeof p.showStats === "boolean") setShowStats(p.showStats);
        } catch {}
      })
      .catch(() => null);
  }, []);

  function savePrefs(next: {
    showPhotos: boolean;
    showRoute: boolean;
    showLocation: boolean;
    showStats: boolean;
  }) {
    void AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
  }

  function toggle(
    key: "showPhotos" | "showRoute" | "showLocation" | "showStats",
    val: boolean
  ) {
    const next = { showPhotos, showRoute, showLocation, showStats, [key]: val };
    if (key === "showPhotos") setShowPhotos(val);
    else if (key === "showRoute") setShowRoute(val);
    else if (key === "showLocation") setShowLocation(val);
    else if (key === "showStats") setShowStats(val);
    savePrefs(next);
  }

  useEffect(() => {
    if (!trip || trip.events.length === 0) return;
    let cancelled = false;
    (async () => {
      const db = await getDb();
      for (const event of trip.events) {
        const wx = await getWeatherForEvent(db, event.id);
        if (wx && !cancelled) {
          setTripWeather(wx);
          return;
        }
      }
    })().catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [trip?.id]);

  const handleShare = async () => {
    console.log("[share] tapped. sharing=", sharing, "ref=", !!shareCardRef.current, "ready=", shareCardReady);
    // Silent guard: prevents double-tap while already sharing
    if (sharing) return;
    // Explicit guard: if layout hasn't fired yet, alert rather than risk a native crash
    if (!shareCardRef.current || !shareCardReady) {
      console.log("[share] guard blocked — ref or layout not ready");
      Alert.alert(t("share.errorCapture"));
      return;
    }
    setSharing(true);
    try {
      console.log("[share] requiring react-native-view-shot…");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { captureRef } = require("react-native-view-shot") as typeof import("react-native-view-shot");
      console.log("[share] requiring expo-sharing…");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sharing = require("expo-sharing") as typeof import("expo-sharing");
      // Belt-and-suspenders: verify ref is still live before touching native
      if (!shareCardRef.current || !shareCardReady) {
        throw new Error("capture target lost between guard and captureRef");
      }
      console.log("[share] calling captureRef — ref.current=", shareCardRef.current);
      const uri = await captureRef(shareCardRef, {
        format: "jpg",
        quality: 0.95,
      });
      console.log("[share] captureRef OK — uri=", uri);
      console.log("[share] calling shareAsync…");
      await Sharing.shareAsync(uri, { mimeType: "image/jpeg" });
      console.log("[share] shareAsync done");
    } catch (err) {
      console.error("[share] caught error:", err);
      Alert.alert(t("share.errorCapture"));
    } finally {
      setSharing(false);
    }
  };

  if (!trip) {
    return (
      <View style={styles.emptyScreen}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
        <Text style={styles.emptyText}>{t("errors.tripNotFound" as never)}</Text>
      </View>
    );
  }

  const cardProps = {
    trip,
    weather: tripWeather,
    contactsLabel: t("summary.shareContacts"),
    catchesLabel: t("summary.shareCatches"),
    showRoute,
    showStats,
    showLocation,
    firstCatchPhotoUri: showPhotos ? firstCatchPhotoUri : undefined,
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
        <Text style={styles.title}>{t("share.title")}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Scaled card preview */}
        <View style={styles.previewOuter}>
          <View style={styles.previewClip} pointerEvents="none">
            <View style={styles.previewScaler}>
              <ShareCard {...cardProps} />
            </View>
          </View>
        </View>

        {/* Toggles */}
        <View style={styles.togglesCard}>
          <Text style={styles.sectionKicker}>{t("share.kicker")}</Text>

          <ToggleRow
            label={t("share.toggleRoute")}
            value={showRoute}
            onToggle={(v) => toggle("showRoute", v)}
          />
          <ToggleRow
            label={t("share.togglePhotos")}
            value={showPhotos}
            onToggle={(v) => toggle("showPhotos", v)}
          />
          <ToggleRow
            label={t("share.toggleStats")}
            value={showStats}
            onToggle={(v) => toggle("showStats", v)}
          />
          <ToggleRow
            label={t("share.toggleLocation")}
            hint={t("share.toggleLocationHint")}
            value={showLocation}
            onToggle={(v) => toggle("showLocation", v)}
          />
        </View>

        <Pressable
          style={[styles.shareBtn, sharing && styles.shareBtnBusy]}
          onPress={() => void handleShare()}
          disabled={sharing}
        >
          <Ionicons name="share-outline" size={20} color={Colors.textOnAmber} />
          <Text style={styles.shareBtnText}>
            {sharing ? t("share.preparing") : t("share.shareBtn")}
          </Text>
        </Pressable>
      </ScrollView>

      {/* Off-screen full-size card for capture — positioned far left so the native
          layer still paints it (captureRef requirement) but the user never sees it.
          opacity:0 was removed: it caused a native ObjC exception in drawHierarchy. */}
      <View
        style={styles.offScreen}
        pointerEvents="none"
        onLayout={(e) => {
          if (e.nativeEvent.layout.width > 0 && e.nativeEvent.layout.height > 0) {
            setShareCardReady(true);
          }
        }}
      >
        <ShareCard ref={shareCardRef} {...cardProps} />
      </View>
    </View>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onToggle,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <Pressable style={styles.toggleRow} onPress={() => onToggle(!value)}>
      <View style={styles.toggleLeft}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.toggleHint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: Colors.border, true: Colors.amber }}
        thumbColor={Colors.textBright}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.navy,
  },
  emptyScreen: {
    flex: 1,
    backgroundColor: Colors.navy,
    padding: 20,
    paddingTop: 60,
    gap: 16,
  },
  emptyText: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 16,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.field,
  },
  backText: {
    color: Colors.text,
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 0,
  },
  title: {
    color: Colors.textBright,
    fontFamily: Fonts.heading,
    fontSize: 20,
    letterSpacing: 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 16,
  },
  // Scaled preview
  previewOuter: {
    alignItems: "center",
    paddingVertical: 8,
  },
  previewClip: {
    width: PREVIEW_W,
    height: PREVIEW_H,
    borderRadius: 14,
    overflow: "hidden",
  },
  previewScaler: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    transform: [
      { translateX: -(CARD_WIDTH * (1 - PREVIEW_SCALE)) / 2 },
      { translateY: -(CARD_HEIGHT * (1 - PREVIEW_SCALE)) / 2 },
      { scale: PREVIEW_SCALE },
    ],
  },
  // Toggles card
  togglesCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 4,
  },
  sectionKicker: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodySemibold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  toggleLeft: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    color: Colors.text,
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 0,
  },
  toggleHint: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 12,
    letterSpacing: 0,
  },
  // Share button
  shareBtn: {
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: Colors.amber,
  },
  shareBtnBusy: {
    opacity: 0.6,
  },
  shareBtnText: {
    color: Colors.textOnAmber,
    fontFamily: Fonts.heading,
    fontSize: 15,
    letterSpacing: 0,
  },
  // Off-screen capture card — parked left of the viewport, never opacity:0
  offScreen: {
    position: "absolute",
    top: 0,
    left: -9999,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
});
