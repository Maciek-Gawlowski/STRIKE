import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MapView, { Marker } from "react-native-maps";
import { GlassCard } from "@/components/GlassCard";
import { GradientLegend } from "@/components/GradientLegend";
import { HeatmapOverlay, type HeatPoint } from "@/components/HeatmapOverlay";
import { Screen } from "@/components/Screen";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";
import { getDb } from "@/database/db";
import { getBiteMapData, type BiteMapFilter, type HexActivity } from "@/services/biteMap";
import { latLngToXY, type MapRegion } from "@/services/heatmapGeo";
import { MOCK_BITE_MAP_ACTIVITY, MOCK_HEAT_POINTS } from "@/services/mockBiteMapHexes";
import { deleteSpot, getSpots, upsertSpot, type Spot } from "@/database/spots";
import { useTranslation } from "@/i18n";
import { ALS_CENTER } from "@/services/zones";
import { useStrikeStore } from "@/store/useStrikeStore";
import type { MapType } from "@/database/preferences";

const uid = () => Math.random().toString(36).slice(2, 10);

const MAP_TYPES: MapType[] = ["standard", "satellite", "hybrid"];

const MAP_TYPE_LABEL_KEY: Record<MapType, string> = {
  standard: "settings.mapTypeStandard",
  satellite: "settings.mapTypeSatellite",
  hybrid: "settings.mapTypeHybrid"
};

const mapStyle = [
  { elementType: "geometry", stylers: [{ color: "#16313F" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8A99A6" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0D1B2A" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0B1622" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1B3A4B" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#1B3A4B" }] }
];

const INITIAL_LAT_DELTA = 0.4;
const MAX_LAT_DELTA_FOR_OVERLAY = 4;

type TimeMode = "24h" | "48h" | "7d" | "custom";
type TimeTab = { val: TimeMode; labelKey: string };
const TIME_TABS: TimeTab[] = [
  { val: "24h",    labelKey: "bitemap.toggle24" },
  { val: "48h",    labelKey: "bitemap.toggle48" },
  { val: "7d",     labelKey: "bitemap.toggle7" },
  { val: "custom", labelKey: "bitemap.customRange" },
];

const ALL_SPECIES = [
  { key: "havoerred", label: "Havørred" },
  { key: "laks",      label: "Laks" },
  { key: "gedde",     label: "Gedde" },
  { key: "torsk",     label: "Torsk" },
  { key: "aborre",    label: "Aborre" },
  { key: "hornfisk",  label: "Hornfisk" },
  { key: "makrel",    label: "Makrel" },
  { key: "bækørred",  label: "Bækørred" },
  { key: "stalling",  label: "Stalling" },
  { key: "rødspætte", label: "Rødspætte" },
  { key: "skrubbe",   label: "Skrubbe" },
  { key: "pighvar",   label: "Pighvar" },
  { key: "suder",     label: "Suder" },
  { key: "karpe",     label: "Karpe" },
] as const;

const EVENT_TYPE_OPTIONS = [
  { key: "catch",     labelKey: "events.catch" },
  { key: "contact",   labelKey: "events.contact" },
  { key: "following", labelKey: "events.following" },
] as const;

const SPECIES_PREF_KEY = "strike.biteMapSpecies";
const EVENT_TYPES_PREF_KEY = "strike.biteMapEventTypes";

function modeToSince(mode: TimeMode): string {
  if (mode === "48h") return new Date(Date.now() - 48 * 3600000).toISOString();
  if (mode === "7d")  return new Date(Date.now() - 168 * 3600000).toISOString();
  return new Date(Date.now() - 24 * 3600000).toISOString();
}

function parseDMY(s: string): Date | null {
  const parts = s.trim().split(/[.\-/]/);
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return null;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

type SpotForm = { id?: string; lat: number; lng: number; name: string; note: string };

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

function subLabel(mode: TimeMode, t: (key: string) => string, customRange?: string): string {
  if (mode === "24h") return t("bitemap.sub24");
  if (mode === "48h") return t("bitemap.sub48");
  if (mode === "custom" && customRange) return customRange;
  return t("bitemap.sub7");
}

function getActivityLabel(total: number, t: (key: string) => string): string {
  if (total >= 9) return t("bitemap.activityHigh");
  if (total >= 4) return t("bitemap.activityMid");
  if (total >= 1) return t("bitemap.activityLow");
  return t("bitemap.activityNone");
}

function getActivityColor(total: number): string {
  if (total >= 9) return Colors.activityHigh;
  if (total >= 4) return Colors.activityMid;
  if (total >= 1) return Colors.activityLow;
  return Colors.activityNone;
}

function inViewport(lat: number, lng: number, region: MapRegion): boolean {
  const latMargin = region.latitudeDelta * 0.2;
  const lngMargin = region.longitudeDelta * 0.2;
  return (
    lat >= region.latitude - region.latitudeDelta / 2 - latMargin &&
    lat <= region.latitude + region.latitudeDelta / 2 + latMargin &&
    lng >= region.longitude - region.longitudeDelta / 2 - lngMargin &&
    lng <= region.longitude + region.longitudeDelta / 2 + lngMargin
  );
}

export default function BiteMapScreen() {
  const { t } = useTranslation();
  const mapType = useStrikeStore((state) => state.mapType);
  const setMapType = useStrikeStore((state) => state.setMapType);

  const { spotLat, spotLng } = useLocalSearchParams<{ spotLat?: string; spotLng?: string }>();

  const mapRef = useRef<MapView>(null);

  const [timeMode, setTimeMode] = useState<TimeMode>("24h");
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [customSince, setCustomSince] = useState<string | null>(null);
  const [customUntil, setCustomUntil] = useState<string | null>(null);
  const [speciesFilter, setSpeciesFilter] = useState<string>("havoerred");
  const [eventTypeFilter, setEventTypeFilter] = useState<string[]>([]);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [hexes, setHexes] = useState<HexActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });

  // Spots
  const [spots, setSpots] = useState<Spot[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [spotForm, setSpotForm] = useState<SpotForm | null>(null);

  const [initialMapRegion] = useState<MapRegion>(() => {
    const loc = useStrikeStore.getState().currentLocation;
    return {
      latitude: loc?.latitude ?? ALS_CENTER.latitude,
      longitude: loc?.longitude ?? ALS_CENTER.longitude,
      latitudeDelta: INITIAL_LAT_DELTA,
      longitudeDelta: INITIAL_LAT_DELTA
    };
  });

  const [liveRegion, setLiveRegion] = useState<MapRegion>(initialMapRegion);

  // Load heatmap data
  const load = useCallback(async (
    mode: TimeMode,
    since: string | null,
    until: string | null,
    species: string,
    eventTypes: string[]
  ) => {
    const filter: BiteMapFilter = {
      since: since ?? modeToSince(mode),
      until: until ?? undefined,
      species: species || null,
      eventTypes: eventTypes.length > 0 ? eventTypes : undefined,
    };
    const data = await getBiteMapData(filter);
    setHexes(data);
  }, []);

  // Restore sticky filter prefs on mount
  useEffect(() => {
    AsyncStorage.multiGet([SPECIES_PREF_KEY, EVENT_TYPES_PREF_KEY])
      .then(([[, sp], [, et]]) => {
        if (sp) setSpeciesFilter(sp);
        if (et) { try { setEventTypeFilter(JSON.parse(et) as string[]); } catch { /* ignore */ } }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (timeMode === "custom") return;
    setLoading(true);
    load(timeMode, null, null, speciesFilter, eventTypeFilter).finally(() => setLoading(false));
  }, [timeMode, speciesFilter, eventTypeFilter, load]);

  // Reload on tab focus so catches logged on other screens appear immediately.
  useFocusEffect(useCallback(() => {
    if (timeMode === "custom") return;
    load(timeMode, null, null, speciesFilter, eventTypeFilter).catch(() => null);
  }, [timeMode, speciesFilter, eventTypeFilter, load]));

  // Load spots
  useEffect(() => {
    getDb()
      .then(getSpots)
      .then(setSpots)
      .catch(() => null);
  }, []);

  // Animate to a spot when navigated from "Mine spots" in Profile
  useEffect(() => {
    if (!spotLat || !spotLng) return;
    const lat = parseFloat(spotLat);
    const lng = parseFloat(spotLng);
    if (!isFinite(lat) || !isFinite(lng)) return;
    mapRef.current?.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: 0.05, longitudeDelta: 0.05 },
      600
    );
  }, [spotLat, spotLng]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(timeMode, customSince, customUntil, speciesFilter, eventTypeFilter);
    setRefreshing(false);
  }, [timeMode, customSince, customUntil, speciesFilter, eventTypeFilter, load]);

  const totalActivity = hexes.reduce((sum, h) => sum + h.total, 0);
  const selectedHex = hexes.find((h) => h.h3_cell === selectedCell) ?? null;

  const hexPositions = useMemo(() => {
    if (mapSize.width === 0 || mapSize.height === 0) return [];
    return hexes
      .filter((hex) => inViewport(hex.lat, hex.lng, liveRegion))
      .map((hex) => ({
        cell: hex.h3_cell,
        ...latLngToXY(hex.lat, hex.lng, liveRegion, mapSize.width, mapSize.height)
      }));
  }, [hexes, mapSize, liveRegion]);

  const heatPoints: HeatPoint[] = useMemo(() => {
    if (liveRegion.latitudeDelta > MAX_LAT_DELTA_FOR_OVERLAY) return [];
    if (mapSize.width === 0 || mapSize.height === 0) return [];

    const sizeScale = timeMode === "7d" ? 1.15 : 1;
    const zoomScale = INITIAL_LAT_DELTA / liveRegion.latitudeDelta;

    return hexPositions
      .map((pos) => {
        const total = hexes.find((h) => h.h3_cell === pos.cell)?.total ?? 0;
        const value = Math.min(total / 9, 1);
        return { ...pos, value };
      })
      .filter(() => true)
      .map((point, idx) => {
        const radius = lerp(35, 90, point.value) * sizeScale * zoomScale;
        return { id: idx, x: point.x, y: point.y, rx: radius, ry: radius, value: point.value };
      });
  }, [hexPositions, hexes, timeMode, mapSize, liveRegion]);

  // Top 8 hex cells by activity — rendered as numbered markers
  const hotspots = useMemo(
    () => [...hexes].sort((a, b) => b.total - a.total).filter((h) => h.total >= 4).slice(0, 8),
    [hexes]
  );

  const handleMapPress = useCallback(
    (event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
      // Tapping the map background clears spot selection and looks for a hex.
      setSelectedSpot(null);
      setSpotForm(null);
      const { latitude, longitude } = event.nativeEvent.coordinate;
      const threshold = mapSize.height > 0
        ? (40 / mapSize.height) * liveRegion.latitudeDelta
        : liveRegion.latitudeDelta * 0.05;
      let nearestCell: string | null = null;
      let nearestDist = threshold;
      for (const hex of hexes) {
        const d = Math.hypot(hex.lat - latitude, hex.lng - longitude);
        if (d <= nearestDist) {
          nearestDist = d;
          nearestCell = hex.h3_cell;
        }
      }
      setSelectedCell(nearestCell);
    },
    [hexes, liveRegion.latitudeDelta, mapSize.height]
  );

  // ── Spot CRUD ───────────────────────────────────────────────────────────────

  const handleSaveSpot = useCallback(async () => {
    if (!spotForm || !spotForm.name.trim()) return;
    const now = new Date().toISOString();
    const spot: Spot = {
      id: spotForm.id ?? uid(),
      name: spotForm.name.trim(),
      lat: spotForm.lat,
      lng: spotForm.lng,
      note: spotForm.note.trim() || undefined,
      createdAt: spotForm.id
        ? (spots.find((s) => s.id === spotForm.id)?.createdAt ?? now)
        : now
    };
    const db = await getDb();
    await upsertSpot(db, spot);
    setSpots((prev) => {
      const without = prev.filter((s) => s.id !== spot.id);
      return [spot, ...without];
    });
    setSpotForm(null);
    setSelectedSpot(spot);
  }, [spotForm, spots]);

  const handleDeleteSpot = useCallback(async (id: string) => {
    const db = await getDb();
    await deleteSpot(db, id);
    setSpots((prev) => prev.filter((s) => s.id !== id));
    setSelectedSpot(null);
  }, []);

  const openEditSpot = useCallback((spot: Spot) => {
    setSpotForm({ id: spot.id, lat: spot.lat, lng: spot.lng, name: spot.name, note: spot.note ?? "" });
    setSelectedSpot(null);
  }, []);

  const hasActiveFilters = speciesFilter !== "havoerred" || eventTypeFilter.length > 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.textMuted} />
      }
    >
      <View style={styles.nav}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
          <Text style={styles.backText}>{t("common.home")}</Text>
        </Pressable>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.kicker}>{t("bitemap.kicker")}</Text>
        <Text style={styles.title}>{t("bitemap.title")}</Text>
        <Text style={styles.subtitle}>{subLabel(timeMode, t, customSince && customUntil ? `${customFrom} – ${customTo}` : undefined)}</Text>
      </View>

      {/* Time window + filter button — single control row */}
      <View style={styles.controlRow}>
        <GlassCard style={styles.toggleControl}>
          {TIME_TABS.map(({ val, labelKey }) => (
            <Pressable
              key={val}
              style={[styles.togglePill, timeMode === val && styles.togglePillActive]}
              onPress={() => {
                setSelectedCell(null);
                if (val === "custom") { setCustomOpen(true); }
                else { setTimeMode(val); }
              }}
            >
              <Text style={[styles.toggleText, timeMode === val && styles.toggleTextActive]}>
                {t(labelKey)}
              </Text>
            </Pressable>
          ))}
        </GlassCard>
        <Pressable
          style={[styles.filterBtn, hasActiveFilters && styles.filterBtnActive]}
          onPress={() => setFilterSheetOpen(true)}
        >
          <Ionicons
            name="options-outline"
            size={18}
            color={hasActiveFilters ? Colors.textOnAmber : Colors.textMuted}
          />
          {hasActiveFilters && <View style={styles.filterDot} />}
        </Pressable>
      </View>

      {/* Map — hero element; map-type button floats top-right */}
      <View
        style={styles.mapShell}
        onLayout={(event) =>
          setMapSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })
        }
      >
      <ErrorBoundary>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={initialMapRegion}
          mapType={mapType}
          customMapStyle={mapType === "standard" ? mapStyle : undefined}
          rotateEnabled={false}
          pitchEnabled={false}
          showsCompass={false}
          onRegionChangeComplete={(region) => setLiveRegion(region)}
          onPress={handleMapPress}
        >
          {spots.map((spot) => (
            <Marker
              key={spot.id}
              coordinate={{ latitude: spot.lat, longitude: spot.lng }}
              onPress={() => {
                setSelectedSpot(spot);
                setSelectedCell(null);
                setSpotForm(null);
              }}
              anchor={{ x: 0.5, y: 1 }}
            >
              <View style={styles.spotPin}>
                <Ionicons name="location" size={30} color={Colors.amber} />
              </View>
            </Marker>
          ))}
          {hotspots.map((hex) => {
            const ringColor = hex.total >= 9 ? "#FF3800" : hex.total >= 4 ? "#F4C84F" : "#35D48F";
            return (
              <Marker
                key={`hotspot-${hex.h3_cell}`}
                coordinate={{ latitude: hex.lat, longitude: hex.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={[styles.hotspotCircle, { borderColor: ringColor }]}>
                  <Text style={styles.hotspotCount}>{hex.total}</Text>
                </View>
              </Marker>
            );
          })}
        </MapView>
      </ErrorBoundary>
        {/* Heatmap overlay — touch passes through */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <HeatmapOverlay width={mapSize.width} height={mapSize.height} points={heatPoints} />
        </View>
      </View>

      {/* Save-spot-here action — pins the current map centre */}
      <Pressable
        style={styles.saveSpotRow}
        onPress={() => {
          setSpotForm({ lat: liveRegion.latitude, lng: liveRegion.longitude, name: "", note: "" });
          setSelectedSpot(null);
          setSelectedCell(null);
        }}
      >
        <Ionicons name="location-outline" size={16} color={Colors.amber} />
        <Text style={styles.saveSpotText}>{t("spots.saveHere")}</Text>
      </Pressable>

      {/* Bottom sheet area — priority: form > spot detail > hex info > hint */}
      {spotForm ? (
        <GlassCard style={styles.formCard}>
          <Text style={styles.formTitle}>
            {spotForm.id ? t("spots.editTitle") : t("spots.saveHere")}
          </Text>
          <TextInput
            value={spotForm.name}
            onChangeText={(v) => setSpotForm((f) => f && { ...f, name: v })}
            placeholder={t("spots.namePlaceholder")}
            placeholderTextColor="#647a72"
            style={styles.spotInput}
            autoFocus
            returnKeyType="next"
          />
          <TextInput
            value={spotForm.note}
            onChangeText={(v) => setSpotForm((f) => f && { ...f, note: v })}
            placeholder={t("spots.notePlaceholder")}
            placeholderTextColor="#647a72"
            style={styles.spotInput}
            returnKeyType="done"
            onSubmitEditing={() => void handleSaveSpot()}
          />
          <View style={styles.formActions}>
            <Pressable
              style={[styles.formSaveBtn, !spotForm.name.trim() && styles.formSaveBtnDisabled]}
              disabled={!spotForm.name.trim()}
              onPress={() => void handleSaveSpot()}
            >
              <Text style={styles.formSaveBtnText}>{t("spots.save")}</Text>
            </Pressable>
            <Pressable hitSlop={8} onPress={() => setSpotForm(null)}>
              <Text style={styles.formCancelText}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
          <Text style={styles.spotPrivacyNote}>{t("spots.privateNote")}</Text>
        </GlassCard>
      ) : selectedSpot ? (
        <GlassCard glow style={styles.spotCard}>
          <View style={styles.spotCardHeader}>
            <Ionicons name="location" size={20} color={Colors.amber} />
            <Text style={styles.spotCardName} numberOfLines={1}>{selectedSpot.name}</Text>
            <Pressable hitSlop={10} onPress={() => openEditSpot(selectedSpot)}>
              <Ionicons name="pencil-outline" size={18} color={Colors.textMuted} />
            </Pressable>
            <Pressable hitSlop={10} onPress={() => void handleDeleteSpot(selectedSpot.id)}>
              <Ionicons name="trash-outline" size={18} color={Colors.danger} />
            </Pressable>
          </View>
          {selectedSpot.note ? (
            <Text style={styles.spotCardNote}>{selectedSpot.note}</Text>
          ) : null}
          <Text style={styles.spotPrivacyNote}>{t("spots.privateNote")}</Text>
        </GlassCard>
      ) : selectedHex ? (
        <GlassCard glow style={styles.infoCard}>
          <View style={styles.sheetHeader}>
            <View style={[styles.activityBubble, { borderColor: getActivityColor(selectedHex.total) }]}>
              <Text style={[styles.activityTotal, { color: getActivityColor(selectedHex.total) }]}>
                {selectedHex.total}
              </Text>
            </View>
            <View style={styles.sheetHeaderText}>
              <Text style={[styles.activityLabel, { color: getActivityColor(selectedHex.total) }]}>
                {getActivityLabel(selectedHex.total, t)}
              </Text>
              <Text style={styles.sheetSubKicker}>{subLabel(timeMode, t, customSince && customUntil ? `${customFrom} – ${customTo}` : undefined)}</Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.counterRow}>
            <View style={styles.counterCell}>
              <View style={[styles.sheetIconBubble, styles.sheetIconCatch]}>
                <Ionicons name="fish-outline" size={14} color="#35d48f" />
              </View>
              <Text style={styles.counterValue}>{selectedHex.catches}</Text>
              <Text style={styles.counterLabel}>{t("bitemap.sheetCatches")}</Text>
            </View>
            <View style={styles.counterDivider} />
            <View style={styles.counterCell}>
              <View style={[styles.sheetIconBubble, styles.sheetIconContact]}>
                <Ionicons name="flash-outline" size={14} color="#f4c84f" />
              </View>
              <Text style={styles.counterValue}>{selectedHex.contacts}</Text>
              <Text style={styles.counterLabel}>{t("bitemap.sheetContacts")}</Text>
            </View>
          </View>
        </GlassCard>
      ) : (
        <Text style={styles.hint}>{t("bitemap.tapHint")}</Text>
      )}

      {!loading && totalActivity === 0 ? (
        <GlassCard style={styles.emptyCard}>
          <Ionicons name="fish-outline" size={28} color={Colors.textMuted} />
          <Text style={styles.emptyText}>{t("bitemap.empty")}</Text>
        </GlassCard>
      ) : null}

      <GradientLegend />

      {/* Filter bottom sheet */}
      <Modal
        visible={filterSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterSheetOpen(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setFilterSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => { /* absorb touches */ }}>
            <View style={styles.sheetHandle} />

            <Text style={styles.sheetTitle}>{t("bitemap.filterTitle")}</Text>

            {/* Species */}
            <Text style={styles.sheetSectionTitle}>{t("bitemap.filterSpecies")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterStrip}>
              {ALL_SPECIES.map((sp) => (
                <Pressable
                  key={sp.key}
                  style={[styles.filterChip, speciesFilter === sp.key && styles.filterChipActive]}
                  onPress={() => {
                    setSpeciesFilter(sp.key);
                    void AsyncStorage.setItem(SPECIES_PREF_KEY, sp.key);
                  }}
                >
                  <Text style={[styles.filterChipText, speciesFilter === sp.key && styles.filterChipTextActive]}>
                    {sp.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Activity type */}
            <Text style={styles.sheetSectionTitle}>{t("bitemap.filterEventType")}</Text>
            <View style={styles.filterRow}>
              {EVENT_TYPE_OPTIONS.map(({ key, labelKey }) => {
                const active = eventTypeFilter.includes(key);
                return (
                  <Pressable
                    key={key}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => {
                      const next = active
                        ? eventTypeFilter.filter((k) => k !== key)
                        : [...eventTypeFilter, key];
                      setEventTypeFilter(next);
                      void AsyncStorage.setItem(EVENT_TYPES_PREF_KEY, JSON.stringify(next));
                    }}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {t(labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Map type */}
            <Text style={styles.sheetSectionTitle}>{t("bitemap.filterMapType")}</Text>
            <View style={styles.filterRow}>
              {MAP_TYPES.map((type) => (
                <Pressable
                  key={type}
                  style={[styles.filterChip, mapType === type && styles.filterChipActive]}
                  onPress={() => setMapType(type)}
                >
                  <Text style={[styles.filterChipText, mapType === type && styles.filterChipTextActive]}>
                    {t(MAP_TYPE_LABEL_KEY[type] as never)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.sheetDoneBtn} onPress={() => setFilterSheetOpen(false)}>
              <Text style={styles.sheetDoneBtnText}>{t("bitemap.filterDone")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Custom date range modal */}
      <Modal
        visible={customOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("bitemap.customRange")}</Text>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>{t("bitemap.customRangeFrom")}</Text>
              <TextInput
                value={customFrom}
                onChangeText={setCustomFrom}
                placeholder="DD/MM/YYYY"
                placeholderTextColor="#647a72"
                style={styles.modalInput}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>{t("bitemap.customRangeTo")}</Text>
              <TextInput
                value={customTo}
                onChangeText={setCustomTo}
                placeholder="DD/MM/YYYY"
                placeholderTextColor="#647a72"
                style={styles.modalInput}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalApplyBtn}
                onPress={() => {
                  const from = parseDMY(customFrom);
                  const to = parseDMY(customTo);
                  if (!from || !to || from > to) return;
                  const toEnd = new Date(to.getTime() + 86400000);
                  const sinceStr = from.toISOString();
                  const untilStr = toEnd.toISOString();
                  setCustomSince(sinceStr);
                  setCustomUntil(untilStr);
                  setTimeMode("custom");
                  setCustomOpen(false);
                  setSelectedCell(null);
                  setLoading(true);
                  load("custom", sinceStr, untilStr, speciesFilter, eventTypeFilter)
                    .finally(() => setLoading(false));
                }}
              >
                <Text style={styles.modalApplyText}>{t("bitemap.customRangeApply")}</Text>
              </Pressable>
              <Pressable hitSlop={8} onPress={() => setCustomOpen(false)}>
                <Text style={styles.modalCancelText}>{t("common.cancel")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: "row",
    alignItems: "center"
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
  titleBlock: {
    gap: 2
  },
  kicker: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 0
  },
  title: {
    color: Colors.textBright,
    fontSize: 35,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  subtitle: {
    color: Colors.textMuted,
    marginTop: 2,
    fontSize: 14,
    fontFamily: Fonts.body
  },
  toggleControl: {
    flex: 1,
    flexDirection: "row",
    borderRadius: 16,
    padding: 4,
    gap: 4,
  },
  togglePill: {
    flex: 1,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.field
  },
  togglePillActive: {
    backgroundColor: Colors.amber
  },
  toggleText: {
    color: Colors.text,
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.4
  },
  toggleTextActive: {
    color: Colors.textOnAmber
  },
  // ── Control row (time + filter button) ──
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.glassBg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  filterBtnActive: {
    backgroundColor: Colors.amber,
    borderColor: Colors.amber,
  },
  filterDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textOnAmber,
  },
  mapShell: {
    height: 520,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border
  },
  // ── Filter bottom sheet ──
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.52)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
    gap: 14,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 4,
  },
  sheetTitle: {
    color: Colors.textBright,
    fontFamily: Fonts.heading,
    fontSize: 18,
    letterSpacing: 0,
  },
  sheetSectionTitle: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodySemibold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: -6,
  },
  sheetDoneBtn: {
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.amber,
    marginTop: 4,
  },
  sheetDoneBtnText: {
    color: Colors.textOnAmber,
    fontFamily: Fonts.heading,
    fontSize: 16,
    letterSpacing: 0,
  },
  spotPin: {
    alignItems: "center",
    justifyContent: "center"
  },
  saveSpotRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6
  },
  saveSpotText: {
    color: Colors.amber,
    fontFamily: Fonts.bodySemibold,
    fontSize: 13,
    letterSpacing: 0
  },
  // ── Spot form ──
  formCard: {
    padding: 18,
    gap: 12
  },
  formTitle: {
    color: Colors.textBright,
    fontFamily: Fonts.heading,
    fontSize: 16,
    letterSpacing: 0
  },
  spotInput: {
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: Colors.field,
    color: Colors.textBright,
    fontFamily: Fonts.body,
    fontSize: 15,
    letterSpacing: 0
  },
  formActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  formSaveBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.amber
  },
  formSaveBtnDisabled: {
    opacity: 0.4
  },
  formSaveBtnText: {
    color: Colors.textOnAmber,
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 0
  },
  formCancelText: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 14,
    letterSpacing: 0
  },
  spotPrivacyNote: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 12,
    letterSpacing: 0
  },
  // ── Spot detail card ──
  spotCard: {
    padding: 18,
    gap: 10
  },
  spotCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  spotCardName: {
    flex: 1,
    color: Colors.textBright,
    fontFamily: Fonts.heading,
    fontSize: 17,
    letterSpacing: 0
  },
  spotCardNote: {
    color: Colors.text,
    fontFamily: Fonts.body,
    fontSize: 14,
    letterSpacing: 0,
    lineHeight: 20
  },
  // ── Hex info card ──
  infoCard: {
    padding: 18,
    gap: 14
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  activityBubble: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.glassBg
  },
  activityTotal: {
    fontFamily: Fonts.black,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: 0
  },
  sheetHeaderText: {
    flex: 1,
    gap: 1
  },
  activityLabel: {
    fontFamily: Fonts.black,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  sheetSubKicker: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 12,
    letterSpacing: 0
  },
  infoDivider: {
    height: 1,
    backgroundColor: Colors.glassBorder
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  counterCell: {
    flex: 1,
    alignItems: "center",
    gap: 6
  },
  counterDivider: {
    width: 1,
    height: 48,
    backgroundColor: Colors.glassBorder
  },
  sheetIconBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center"
  },
  sheetIconCatch: {
    backgroundColor: "rgba(53,212,143,0.15)"
  },
  sheetIconContact: {
    backgroundColor: "rgba(244,200,79,0.15)"
  },
  counterValue: {
    color: Colors.textBright,
    fontFamily: Fonts.heading,
    fontSize: 22,
    letterSpacing: 0
  },
  counterLabel: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodySemibold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase"
  },
  hint: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: Fonts.body
  },
  emptyCard: {
    padding: 22,
    gap: 10,
    alignItems: "center"
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 15,
    fontFamily: Fonts.bodyMedium,
    textAlign: "center"
  },
  // ── Hotspot numbered markers ──
  hotspotCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2.5,
    backgroundColor: "#0D1B2AF0",
    alignItems: "center",
    justifyContent: "center"
  },
  hotspotCount: {
    color: "#FFFFFF",
    fontFamily: Fonts.heading,
    fontSize: 15,
    letterSpacing: 0
  },
  // ── Filter strips ──
  filterStrip: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingVertical: 2,
  },
  filterRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  filterChip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "transparent",
  },
  filterChipActive: {
    backgroundColor: Colors.amber,
    borderColor: Colors.amber,
  },
  filterChipText: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 0,
  },
  filterChipTextActive: {
    color: Colors.textOnAmber,
  },
  // ── Custom date range modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 24,
    gap: 16,
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: {
    color: Colors.textBright,
    fontFamily: Fonts.heading,
    fontSize: 18,
    letterSpacing: 0,
  },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modalLabel: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 14,
    width: 44,
    letterSpacing: 0,
  },
  modalInput: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: Colors.field,
    color: Colors.textBright,
    fontFamily: Fonts.body,
    fontSize: 15,
    letterSpacing: 0,
  },
  modalActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 4,
  },
  modalApplyBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.amber,
  },
  modalApplyText: {
    color: Colors.textOnAmber,
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 0,
  },
  modalCancelText: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 14,
    letterSpacing: 0,
  },
});
