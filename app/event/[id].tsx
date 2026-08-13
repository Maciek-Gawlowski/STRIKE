import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { GlassCard } from "@/components/GlassCard";
import { Screen } from "@/components/Screen";
import { TripMap } from "@/components/TripMap";
import { getWeatherForEvent, type WeatherSnapshot } from "@/database/queries";
import { getLures, getLureById, type Lure } from "@/database/lures";
import { LureColourDot } from "@/components/LureColourDot";
import { getDb } from "@/database/db";
import { degreesToCompass } from "@/services/weather";
import { useStrikeStore, type StrikeEvent } from "@/store/useStrikeStore";
import type { WaterLevelTrend } from "@/services/dmi";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

function waterLevelTrendArrow(trend: WaterLevelTrend): string {
  if (trend === "rising")  return "↑";
  if (trend === "falling") return "↓";
  return "—";
}

const TYPE_COLORS = {
  catch:     Colors.catchGreen,
  contact:   "#F4C84F",
  following: "#5AA9E6",
  lure:      "#a78bfa",
} as const;

const TYPE_ICONS = {
  catch:     "fish-outline",
  contact:   "flash-outline",
  following: "eye-outline",
  lure:      "pricetag-outline",
} as const satisfies Record<string, React.ComponentProps<typeof Ionicons>["name"]>;

type EditFields = {
  species: string;
  comment: string;
  kept: boolean;
  lengthCm: string;
  weightKg: string;
  lureId: string | null;
  photoUri: string | undefined;
  airTemp: string;
  waterTemp: string;
  windSpeed: string;
  windDirection: string;
  pressure: string;
};

function parseNum(s: string): number | undefined {
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? undefined : n;
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();

  const event = useStrikeStore((state) => {
    for (const trip of [state.activeTrip, ...state.trips]) {
      if (!trip) continue;
      const found = trip.events.find((e) => e.id === id);
      if (found) return found;
    }
    return null;
  });

  const tripId = useStrikeStore((state) => {
    for (const trip of [state.activeTrip, ...state.trips]) {
      if (!trip) continue;
      if (trip.events.some((e) => e.id === id)) return trip.id;
    }
    return null;
  });

  const updateEvent = useStrikeStore((state) => state.updateEvent);
  const waterLevel = useStrikeStore((state) => state.waterLevel);

  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [lure, setLure] = useState<Lure | null>(null);
  const [allLures, setAllLures] = useState<Lure[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [lurePickerOpen, setLurePickerOpen] = useState(false);
  const [edit, setEdit] = useState<EditFields>({
    species: "", comment: "", kept: false, lengthCm: "", weightKg: "",
    lureId: null, photoUri: undefined,
    airTemp: "", waterTemp: "", windSpeed: "", windDirection: "", pressure: "",
  });

  useEffect(() => {
    if (!id) return;
    getDb()
      .then((db) => getWeatherForEvent(db, id))
      .then(setWeather)
      .catch(() => null);
  }, [id]);

  useEffect(() => {
    if (!event?.lureId) return;
    const lureId = event.lureId;
    getDb()
      .then((db) => getLureById(db, lureId))
      .then((found) => setLure(found))
      .catch(() => null);
  }, [event?.lureId]);

  function enterEdit() {
    if (!event) return;
    setEdit({
      species: event.species ?? "",
      comment: event.comment ?? "",
      kept: event.kept ?? false,
      lengthCm: event.lengthCm != null ? String(event.lengthCm) : "",
      weightKg: event.weightKg != null ? String(event.weightKg) : "",
      lureId: event.lureId ?? null,
      photoUri: event.photoUri,
      airTemp: weather?.airTemp != null ? String(weather.airTemp) : "",
      waterTemp: weather?.waterTemp != null ? String(weather.waterTemp) : "",
      windSpeed: weather?.windSpeed != null ? String(weather.windSpeed) : "",
      windDirection: weather?.windDirection ?? "",
      pressure: weather?.pressure != null ? String(weather.pressure) : "",
    });
    getDb()
      .then((db) => getLures(db))
      .then(setAllLures)
      .catch(() => null);
    setIsEditing(true);
  }

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setEdit((prev) => ({ ...prev, photoUri: result.assets[0].uri }));
    }
  }

  function saveEdit() {
    if (!event || !tripId) return;

    const updatedEvent: StrikeEvent = {
      ...event,
      photoUri: edit.photoUri,
      species: edit.species.trim() || undefined,
      comment: edit.comment.trim() || undefined,
      kept: event.type === "catch" ? edit.kept : event.kept,
      lengthCm: parseNum(edit.lengthCm),
      weightKg: parseNum(edit.weightKg),
      lureId: edit.lureId ?? undefined,
    };

    // Build weather patch — only include non-empty fields
    const weatherPatch: Partial<WeatherSnapshot> = {};
    const at = parseNum(edit.airTemp);
    const wt = parseNum(edit.waterTemp);
    const ws = parseNum(edit.windSpeed);
    const wd = edit.windDirection.trim();
    const pr = parseNum(edit.pressure);
    if (at != null) weatherPatch.airTemp = at;
    if (wt != null) weatherPatch.waterTemp = wt;
    if (ws != null) weatherPatch.windSpeed = ws;
    if (wd) weatherPatch.windDirection = wd;
    if (pr != null) weatherPatch.pressure = pr;

    // Gate Bite Map resync on uploaded-field changes
    const speciesChanged = updatedEvent.type === "catch" && updatedEvent.species !== event.species;
    const waterTempChanged = weatherPatch.waterTemp !== weather?.waterTemp;
    const windDirChanged = weatherPatch.windDirection !== weather?.windDirection;
    const resyncBiteMap = speciesChanged || waterTempChanged || windDirChanged;

    updateEvent(tripId, updatedEvent, {
      weatherPatch: Object.keys(weatherPatch).length > 0 ? weatherPatch : undefined,
      existingWeather: weather,
      resyncBiteMap,
    });

    // Reflect changes locally for instant UI update
    if (Object.keys(weatherPatch).length > 0) {
      setWeather((prev) => prev
        ? { ...prev, ...weatherPatch }
        : { id: "pending", eventId: event.id, ...weatherPatch }
      );
    }
    if (edit.lureId !== event.lureId) {
      const nextLure = allLures.find((l) => l.id === edit.lureId) ?? null;
      setLure(nextLure);
    }

    setIsEditing(false);
  }

  if (!event) {
    return (
      <Screen>
        <Pressable style={styles.backInline} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
          <Text style={styles.backInlineText}>{t("common.back")}</Text>
        </Pressable>
        <Text style={styles.notFound}>Event not found.</Text>
      </Screen>
    );
  }

  const isCatch = event.type === "catch";
  const typeColor = TYPE_COLORS[event.type] ?? "#ffffff";
  const typeIcon  = TYPE_ICONS[event.type]  ?? "ellipse-outline";
  const typeKicker =
    isCatch ? t("catchDetail.kicker") :
    event.type === "contact" ? t("events.contact").toUpperCase() :
    t("events.following").toUpperCase();

  const miniRoute = [event.position, event.position];
  const dateStr = new Date(event.timestamp).toLocaleDateString([], {
    day: "numeric", month: "short", year: "numeric"
  });
  const timeStr = new Date(event.timestamp).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit"
  });
  const coordStr = `${event.position.latitude.toFixed(5)}, ${event.position.longitude.toFixed(5)}`;
  const hasPhoto = Boolean(isEditing ? edit.photoUri : event.photoUri);
  const displayPhotoUri = isEditing ? edit.photoUri : event.photoUri;
  const displaySpecies = isEditing ? edit.species : event.species;
  const displayLure = isEditing
    ? allLures.find((l) => l.id === edit.lureId) ?? null
    : lure;

  return (
    <Screen contentStyle={styles.screenContent}>

      {/* ── Hero ── */}
      <View style={styles.hero}>
        {isCatch ? (
          hasPhoto ? (
            <Image source={{ uri: displayPhotoUri }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={styles.heroNoPhoto}>
              <Ionicons name="camera-outline" size={48} color="rgba(242,243,239,0.25)" />
              <Text style={styles.heroNoPhotoText}>{t("catchDetail.noPhoto")}</Text>
            </View>
          )
        ) : (
          <View style={[styles.heroIconCenter, { backgroundColor: typeColor + "18" }]}>
            <Ionicons name={typeIcon} size={56} color={typeColor} />
          </View>
        )}

        <LinearGradient
          colors={["transparent", "rgba(13,27,42,0.62)", Colors.navy]}
          locations={[0.3, 0.68, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        <View style={styles.heroTopRow}>
          <Pressable
            style={styles.back}
            onPress={isEditing ? () => setIsEditing(false) : () => router.back()}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.textBright} />
            <Text style={styles.backText}>
              {isEditing ? t("eventEdit.cancelBtn") : t("common.back")}
            </Text>
          </Pressable>

          {/* Edit / Save buttons */}
          {event.type !== "lure" ? (
            isEditing ? (
              <Pressable style={styles.editBtn} onPress={saveEdit}>
                <Ionicons name="checkmark" size={18} color={Colors.textOnAmber} />
                <Text style={styles.editBtnText}>{t("eventEdit.saveBtn")}</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.editBtnSecondary} onPress={enterEdit}>
                <Ionicons name="create-outline" size={18} color={Colors.text} />
                <Text style={styles.editBtnSecondaryText}>{t("eventEdit.editBtn")}</Text>
              </Pressable>
            )
          ) : null}
        </View>

        <View style={styles.heroFooter}>
          <Text style={styles.kicker}>{typeKicker}</Text>
          {isCatch && displaySpecies ? (
            <Text style={styles.heroSpecies}>{displaySpecies}</Text>
          ) : null}
          {isEditing && isCatch ? (
            <Pressable style={styles.changePhotoBtn} onPress={() => void pickPhoto()}>
              <Ionicons name="camera-outline" size={16} color={Colors.textBright} />
              <Text style={styles.changePhotoBtnText}>
                {hasPhoto ? t("eventEdit.changePhoto") : t("eventEdit.addPhoto")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ── Body ── */}
      {isEditing ? (
        <ScrollView
          style={styles.editScroll}
          contentContainerStyle={styles.editScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Catch-specific fields */}
          {isCatch ? (
            <>
              <EditRow label={t("eventEdit.species")}>
                <TextInput
                  style={styles.textInput}
                  value={edit.species}
                  onChangeText={(v) => setEdit((p) => ({ ...p, species: v }))}
                  placeholder={t("eventEdit.species")}
                  placeholderTextColor={Colors.textMuted}
                />
              </EditRow>

              <EditRow label={t("eventEdit.length")}>
                <TextInput
                  style={styles.textInput}
                  value={edit.lengthCm}
                  onChangeText={(v) => setEdit((p) => ({ ...p, lengthCm: v }))}
                  keyboardType="decimal-pad"
                  placeholder="—"
                  placeholderTextColor={Colors.textMuted}
                />
              </EditRow>

              <EditRow label={t("eventEdit.weight")}>
                <TextInput
                  style={styles.textInput}
                  value={edit.weightKg}
                  onChangeText={(v) => setEdit((p) => ({ ...p, weightKg: v }))}
                  keyboardType="decimal-pad"
                  placeholder="—"
                  placeholderTextColor={Colors.textMuted}
                />
              </EditRow>

              <EditRow label="">
                <View style={styles.keptRow}>
                  <Pressable
                    style={[styles.keptBtn, !edit.kept && styles.keptBtnActive]}
                    onPress={() => setEdit((p) => ({ ...p, kept: false }))}
                  >
                    <Ionicons
                      name="arrow-undo-outline"
                      size={16}
                      color={!edit.kept ? Colors.navy : Colors.textMuted}
                    />
                    <Text style={[styles.keptBtnText, !edit.kept && styles.keptBtnTextActive]}>
                      {t("eventEdit.released")}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.keptBtn, edit.kept && styles.keptBtnActive]}
                    onPress={() => setEdit((p) => ({ ...p, kept: true }))}
                  >
                    <Ionicons
                      name="home-outline"
                      size={16}
                      color={edit.kept ? Colors.navy : Colors.textMuted}
                    />
                    <Text style={[styles.keptBtnText, edit.kept && styles.keptBtnTextActive]}>
                      {t("eventEdit.kept")}
                    </Text>
                  </Pressable>
                </View>
              </EditRow>

              <EditRow label={t("eventEdit.lure")}>
                <Pressable
                  style={styles.lurePickerBtn}
                  onPress={() => setLurePickerOpen(true)}
                >
                  {displayLure ? (
                    <View style={styles.lurePickerRow}>
                      <LureColourDot colourKey={displayLure.colour} colourSecondaryKey={displayLure.colourSecondary} size={12} />
                      <Text style={styles.lurePickerText}>{displayLure.name}</Text>
                    </View>
                  ) : (
                    <Text style={styles.lurePickerPlaceholder}>{t("eventEdit.noLure")}</Text>
                  )}
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </Pressable>
              </EditRow>
            </>
          ) : null}

          {/* Comment — all types */}
          <EditRow label={t("eventEdit.comment")}>
            <TextInput
              style={[styles.textInput, styles.textInputMulti]}
              value={edit.comment}
              onChangeText={(v) => setEdit((p) => ({ ...p, comment: v }))}
              placeholder="—"
              placeholderTextColor={Colors.textMuted}
              multiline
            />
          </EditRow>

          {/* Weather section */}
          <Text style={styles.weatherSectionLabel}>{t("eventEdit.weatherSection")}</Text>

          <EditRow label={t("eventEdit.airTemp")}>
            <TextInput
              style={styles.textInput}
              value={edit.airTemp}
              onChangeText={(v) => setEdit((p) => ({ ...p, airTemp: v }))}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor={Colors.textMuted}
            />
          </EditRow>
          <EditRow label={t("eventEdit.waterTemp")}>
            <TextInput
              style={styles.textInput}
              value={edit.waterTemp}
              onChangeText={(v) => setEdit((p) => ({ ...p, waterTemp: v }))}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor={Colors.textMuted}
            />
          </EditRow>
          <EditRow label={t("eventEdit.windSpeed")}>
            <TextInput
              style={styles.textInput}
              value={edit.windSpeed}
              onChangeText={(v) => setEdit((p) => ({ ...p, windSpeed: v }))}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor={Colors.textMuted}
            />
          </EditRow>
          <EditRow label={t("eventEdit.windDir")}>
            <TextInput
              style={styles.textInput}
              value={edit.windDirection}
              onChangeText={(v) => setEdit((p) => ({ ...p, windDirection: v }))}
              keyboardType="decimal-pad"
              placeholder="0–360°"
              placeholderTextColor={Colors.textMuted}
            />
          </EditRow>
          <EditRow label={t("eventEdit.pressure")}>
            <TextInput
              style={styles.textInput}
              value={edit.pressure}
              onChangeText={(v) => setEdit((p) => ({ ...p, pressure: v }))}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor={Colors.textMuted}
            />
          </EditRow>

          <View style={styles.saveRow}>
            <Pressable style={styles.saveBtnLarge} onPress={saveEdit}>
              <Ionicons name="checkmark-circle-outline" size={20} color={Colors.textOnAmber} />
              <Text style={styles.saveBtnLargeText}>{t("eventEdit.saveBtn")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.body}>
          {/* Big stat cards: length | weight — catch only */}
          {isCatch && (event.lengthCm != null || event.weightKg != null) ? (
            <View style={styles.bigStats}>
              {event.lengthCm != null ? (
                <GlassCard style={styles.bigStatCard}>
                  <Text style={styles.bigStatValue}>{event.lengthCm} cm</Text>
                  <Text style={styles.bigStatLabel}>{t("catchDetail.length")}</Text>
                </GlassCard>
              ) : null}
              {event.weightKg != null ? (
                <GlassCard style={styles.bigStatCard}>
                  <Text style={styles.bigStatValue}>{event.weightKg} kg</Text>
                  <Text style={styles.bigStatLabel}>{t("catchDetail.weight")}</Text>
                </GlassCard>
              ) : null}
            </View>
          ) : null}

          <GlassCard style={styles.detailCard}>
            <DetailRow
              icon="calendar-outline"
              label={t("catchDetail.dateTime")}
              value={`${dateStr} · ${timeStr}`}
            />
            {isCatch && event.species ? (
              <DetailRow icon="fish-outline" label={t("catchDetail.species")} value={event.species} />
            ) : null}
            {isCatch && event.kept !== undefined ? (
              <DetailRow
                icon={event.kept ? "home-outline" : "arrow-undo-outline"}
                label={t("catchDetail.outcome")}
                value={event.kept ? t("catchDetail.kept") : t("catchDetail.released")}
              />
            ) : null}
            {weather?.airTemp != null ? (
              <DetailRow
                icon="thermometer-outline"
                label={t("catchDetail.airTemp")}
                value={t("weather.air", { v: Math.round(weather.airTemp) })}
              />
            ) : null}
            {weather?.waterTemp != null ? (
              <DetailRow
                icon="water-outline"
                label={t("catchDetail.waterTemp")}
                value={t("weather.water", { v: Math.round(weather.waterTemp) })}
              />
            ) : null}
            {weather?.windSpeed != null ? (
              <DetailRow
                icon="navigate-outline"
                label={t("catchDetail.wind")}
                value={`${weather.windDirection ? degreesToCompass(parseFloat(weather.windDirection)) : "–"} ${Math.round(weather.windSpeed)} m/s`}
              />
            ) : null}
            {weather?.pressure != null ? (
              <DetailRow
                icon="speedometer-outline"
                label={t("catchDetail.pressure")}
                value={`${Math.round(weather.pressure)} hPa`}
              />
            ) : null}
            {waterLevel ? (
              <DetailRow
                icon="water-outline"
                label={t("catchDetail.waterLevel")}
                value={`${waterLevelTrendArrow(waterLevel.trend)} ${waterLevel.level} cm · ${t(`weather.${waterLevel.phase}`)}`}
              />
            ) : null}
            {lure ? (
              <DetailRow
                icon="pricetag-outline"
                label={t("catchDetail.lure")}
                value={lure.name}
                lureColourKey={lure.colour}
                lureColourSecondaryKey={lure.colourSecondary}
              />
            ) : null}
            {event.comment ? (
              <DetailRow icon="chatbubble-outline" label={t("catchDetail.comment")} value={event.comment} />
            ) : null}
            <DetailRow
              icon="location-outline"
              label={t("catchDetail.location")}
              value={coordStr}
            />
          </GlassCard>

          <TripMap route={miniRoute} events={[event]} height={180} interactive={false} />
        </View>
      )}

      {/* Lure picker modal */}
      <Modal visible={lurePickerOpen} transparent animationType="slide" onRequestClose={() => setLurePickerOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setLurePickerOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{t("eventEdit.lure")}</Text>
            <Pressable
              style={styles.lureOption}
              onPress={() => { setEdit((p) => ({ ...p, lureId: null })); setLurePickerOpen(false); }}
            >
              <Text style={styles.lureOptionText}>{t("eventEdit.noLure")}</Text>
            </Pressable>
            {allLures.map((l) => (
              <Pressable
                key={l.id}
                style={[styles.lureOption, edit.lureId === l.id && styles.lureOptionSelected]}
                onPress={() => { setEdit((p) => ({ ...p, lureId: l.id })); setLurePickerOpen(false); }}
              >
                <View style={styles.lureOptionRow}>
                  <LureColourDot colourKey={l.colour} colourSecondaryKey={l.colourSecondary} size={12} />
                  <Text style={styles.lureOptionText}>{l.name}</Text>
                </View>
                {edit.lureId === l.id ? (
                  <Ionicons name="checkmark" size={18} color={Colors.amber} />
                ) : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function EditRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.editRow}>
      {label ? <Text style={styles.editLabel}>{label}</Text> : null}
      {children}
    </View>
  );
}

type DetailRowProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
  lureColourKey?: string;
  lureColourSecondaryKey?: string;
};

function DetailRow({ icon, label, value, lureColourKey, lureColourSecondaryKey }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={18} color={Colors.amber} />
      <Text style={styles.detailLabel}>{label}</Text>
      <View style={styles.detailValueRow}>
        <LureColourDot colourKey={lureColourKey} colourSecondaryKey={lureColourSecondaryKey} size={12} />
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 0,
    paddingHorizontal: 0,
    gap: 0,
    paddingBottom: 36
  },

  // ── Hero ────────────────────────────────────────────────────
  hero: {
    height: 300,
    overflow: "hidden",
    backgroundColor: Colors.teal,
    justifyContent: "space-between",
    paddingBottom: 24,
    paddingHorizontal: 18
  },
  heroImage: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0
  },
  heroNoPhoto: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  heroNoPhotoText: {
    color: "rgba(242,243,239,0.35)",
    fontFamily: Fonts.bodySemibold,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroIconCenter: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
  },
  back: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(13,27,42,0.55)"
  },
  backText: {
    color: Colors.textBright,
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 0
  },
  editBtn: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.amber,
  },
  editBtnText: {
    color: Colors.textOnAmber,
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 0,
  },
  editBtnSecondary: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(13,27,42,0.55)",
  },
  editBtnSecondaryText: {
    color: Colors.text,
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 0,
  },
  heroFooter: {
    gap: 6
  },
  kicker: {
    color: "rgba(242,243,239,0.65)",
    fontSize: 11,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 1.5,
    textTransform: "uppercase"
  },
  heroSpecies: {
    color: Colors.textBright,
    fontSize: 30,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  changePhotoBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(13,27,42,0.6)",
  },
  changePhotoBtnText: {
    color: Colors.textBright,
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 0,
  },

  // ── Body (read-only) ────────────────────────────────────────
  body: {
    paddingHorizontal: 18,
    paddingTop: 18,
    gap: 16
  },
  bigStats: {
    flexDirection: "row",
    gap: 12
  },
  bigStatCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 22,
    gap: 2
  },
  bigStatValue: {
    color: Colors.textBright,
    fontSize: 44,
    fontFamily: Fonts.black,
    lineHeight: 48,
    letterSpacing: 0
  },
  bigStatLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 4
  },
  detailCard: {
    padding: 18,
    gap: 16
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 36
  },
  detailLabel: {
    flex: 1,
    color: Colors.textMuted,
    fontSize: 14,
    fontFamily: Fonts.body,
    letterSpacing: 0
  },
  detailValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    justifyContent: "flex-end",
  },
  detailValue: {
    color: Colors.textBright,
    fontSize: 14,
    fontFamily: Fonts.bodyBold,
    textAlign: "right",
    letterSpacing: 0,
    flexShrink: 1
  },

  // ── Edit form ────────────────────────────────────────────────
  editScroll: {
    flex: 1,
  },
  editScrollContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 4,
  },
  editRow: {
    gap: 6,
    marginBottom: 12,
  },
  editLabel: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodySemibold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  textInput: {
    backgroundColor: Colors.field,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textBright,
    fontFamily: Fonts.body,
    fontSize: 15,
    letterSpacing: 0,
  },
  textInputMulti: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  keptRow: {
    flexDirection: "row",
    gap: 10,
  },
  keptBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.field,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  keptBtnActive: {
    backgroundColor: Colors.amber,
    borderColor: Colors.amber,
  },
  keptBtnText: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 0,
  },
  keptBtnTextActive: {
    color: Colors.navy,
  },
  lurePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.field,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  lurePickerRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  lurePickerText: {
    color: Colors.textBright,
    fontFamily: Fonts.body,
    fontSize: 15,
  },
  lurePickerPlaceholder: {
    flex: 1,
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 15,
  },
  weatherSectionLabel: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodySemibold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 16,
  },
  saveRow: {
    marginTop: 12,
  },
  saveBtnLarge: {
    height: 56,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.amber,
  },
  saveBtnLargeText: {
    color: Colors.textOnAmber,
    fontFamily: Fonts.heading,
    fontSize: 16,
    letterSpacing: 0,
  },

  // ── Lure picker modal ────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    gap: 4,
  },
  modalTitle: {
    color: Colors.textBright,
    fontFamily: Fonts.heading,
    fontSize: 18,
    letterSpacing: 0,
    marginBottom: 8,
  },
  lureOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  lureOptionSelected: {
    // no extra style needed — checkmark handles it
  },
  lureOptionRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  lureOptionText: {
    color: Colors.text,
    fontFamily: Fonts.body,
    fontSize: 15,
    letterSpacing: 0,
  },

  // ── Not-found fallback ────────────────────────────────────────
  backInline: {
    alignSelf: "flex-start",
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.field
  },
  backInlineText: {
    color: Colors.text,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 0
  },
  notFound: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 16,
    paddingTop: 40,
    textAlign: "center"
  }
});
