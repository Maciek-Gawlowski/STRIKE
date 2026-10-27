import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MapView, { Marker, Polygon, Polyline } from "react-native-maps";
import { GlassCard } from "@/components/GlassCard";
import { GradientLegend } from "@/components/GradientLegend";
import { Screen } from "@/components/Screen";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";
import { getDb } from "@/database/db";
import { getBiteMapData, type BiteMapFilter, type HexActivity } from "@/services/biteMap";
import type { MapRegion } from "@/services/heatmapGeo";
import { cellToPolygon, latLngToCell } from "@/services/hexGrid";
import { EVENT_MARKER_COLORS, EVENT_MARKER_ICONS, dominantEventType } from "@/components/eventMarkers";
import { OwnEventPin } from "@/components/OwnEventPin";
import { deleteSpot, getSpots, upsertSpot, type Spot } from "@/database/spots";
import {
  getOwnEventsInWindow,
  getOwnTripRoutesInWindow,
  type OwnEvent,
  type OwnTripRoute
} from "@/database/queries";
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
const MIN_CELL_OBSERVATIONS = 3;
const MIN_HOTSPOT_OBSERVATIONS = MIN_CELL_OBSERVATIONS + 1;
/**
 * Zoom level at which the personal layer switches from one grouped pin per
 * cell to every observation on its own, plus the trip routes. ~0.08° of
 * latitude is roughly 9 km top to bottom: close enough that a single stretch
 * of coast fills the map, so individual pins are worth tapping.
 */
const DETAIL_LAT_DELTA = 0.08;
/** Own trip routes: visible but quieter than both the pins and the community cells. */
const OWN_ROUTE_COLOR = "rgba(242, 243, 239, 0.55)";

type TimeMode = "24h" | "7d" | "30d" | "custom";
type TimeTab = { val: TimeMode; labelKey: string };
const TIME_TABS: TimeTab[] = [
  { val: "24h",    labelKey: "bitemap.toggle24" },
  { val: "7d",     labelKey: "bitemap.toggle7" },
  { val: "30d",    labelKey: "bitemap.toggle30" },
  { val: "custom", labelKey: "bitemap.customRange" },
];

import { ALL_SPECIES } from "@/constants/species";

const EVENT_TYPE_OPTIONS = [
  { key: "catch",     labelKey: "events.catch" },
  { key: "contact",   labelKey: "events.contact" },
  { key: "following", labelKey: "events.following" },
] as const;

const SPECIES_PREF_KEY = "strike.biteMapSpecies";
const LAYERS_PREF_KEY = "strike.biteMapLayers";
const EVENT_TYPES_PREF_KEY = "strike.biteMapEventTypes";

function modeToSince(mode: TimeMode): string {
  if (mode === "7d")  return new Date(Date.now() - 168 * 3600000).toISOString();
  if (mode === "30d") return new Date(Date.now() - 720 * 3600000).toISOString();
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

function subLabel(mode: TimeMode, t: (key: string) => string, customRange?: string): string {
  if (mode === "24h") return t("bitemap.sub24");
  if (mode === "30d") return t("bitemap.sub30");
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

/**
 * Fill strength per activity band, as the alpha half of an 8-digit colour.
 *
 * Stepped rather than continuous: four states a legend can name beat a smooth
 * ramp nobody can read off a map. Kept deliberately light — the outline is
 * what states the shape, and a fill heavy enough to bury the street names
 * underneath makes the map worse at the job people actually use it for, which
 * is working out how to get to the water.
 */
function cellFillAlpha(total: number): string {
  if (total >= 9) return "5C"; // 36%
  if (total >= 4) return "42"; // 26%
  return "2E";                 // 18%
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

  const [timeMode, setTimeMode] = useState<TimeMode>("30d");
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [customSince, setCustomSince] = useState<string | null>(null);
  const [customUntil, setCustomUntil] = useState<string | null>(null);
  // No species filter by default. The server reads a species as "catches of
  // that species only", so defaulting to one hid every follow and contact and
  // left a fresh install staring at an empty map — which is exactly what a
  // tester reads as "the app is broken".
  const [speciesFilter, setSpeciesFilter] = useState<string>("");

  /**
   * Which layers are drawn. Two independent switches rather than one three-way
   * control, because the two layers are not alternatives: they answer different
   * questions and most of the time you want both.
   *
   * It also fixes something dishonest. With only a community layer on screen
   * under a heading that says COMMUNITY DATA, an angler fishing alone on an
   * empty coast sees their own four catches come back as a glowing cell and
   * reads it as other people. Being able to switch our own layer off is how
   * they can tell the difference.
   */
  const [showOwnLayer, setShowOwnLayer] = useState(true);
  const [showCommunityLayer, setShowCommunityLayer] = useState(true);
  const [eventTypeFilter, setEventTypeFilter] = useState<string[]>([]);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [hexes, setHexes] = useState<HexActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });

  // Spots
  const [spots, setSpots] = useState<Spot[]>([]);
  // The user's own events, drawn as a separate layer from the shared heat.
  const [ownEvents, setOwnEvents] = useState<OwnEvent[]>([]);
  // The user's own finished trips in the same window, drawn only when zoomed in.
  const [ownRoutes, setOwnRoutes] = useState<OwnTripRoute[]>([]);
  /**
   * react-native-maps snapshots a marker's child view once and reuses the
   * bitmap. With tracksViewChanges pinned to false from the first render the
   * snapshot is taken before the view has been laid out, so the marker draws
   * as an empty placeholder instead of the dot. Track changes briefly after
   * the set of markers changes, then stop — keeping it on permanently makes
   * every pan re-render every marker.
   */
  const [trackOwnMarkers, setTrackOwnMarkers] = useState(true);
  useEffect(() => {
    setTrackOwnMarkers(true);
    const timer = setTimeout(() => setTrackOwnMarkers(false), 1000);
    return () => clearTimeout(timer);
  }, [ownEvents]);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [spotForm, setSpotForm] = useState<SpotForm | null>(null);

  const [initialMapRegion] = useState<MapRegion>(() => {
    // Only a real GPS fix may seed the map. `currentLocation` is pre-seeded with
    // a demo point near Stevns so the trip screen has something to draw before
    // any fix exists; reading it here opened every fresh install on a coast
    // hundreds of kilometres from the user, which is exactly what a tester
    // reports as "the map shows the wrong country". Als is the honest default
    // for this beta — and the effect below moves to the real position as soon
    // as there is one.
    const { currentLocation, hasGpsFix } = useStrikeStore.getState();
    const loc = hasGpsFix ? currentLocation : null;
    return {
      latitude: loc?.latitude ?? ALS_CENTER.latitude,
      longitude: loc?.longitude ?? ALS_CENTER.longitude,
      latitudeDelta: INITIAL_LAT_DELTA,
      longitudeDelta: INITIAL_LAT_DELTA
    };
  });

  // Centre on the user's real position when the map opens. Permission is only
  // read here, never requested: TripWatcher owns that flow, including the
  // priming alert that explains why STRIKE wants location. Asking from two
  // places would put the system dialog in front of the user with no
  // explanation attached.
  const [showUserLocation, setShowUserLocation] = useState(false);
  const spotParamsRef = useRef({ spotLat, spotLng });
  spotParamsRef.current = { spotLat, spotLng };

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!mounted || permission.status !== "granted") return;
        setShowUserLocation(true);
        // Don't fight the deep link from "Mine spots", which is already
        // animating the map somewhere the user explicitly asked for.
        if (spotParamsRef.current.spotLat && spotParamsRef.current.spotLng) return;
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        if (!mounted) return;
        mapRef.current?.animateToRegion(
          {
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
            latitudeDelta: INITIAL_LAT_DELTA,
            longitudeDelta: INITIAL_LAT_DELTA
          },
          600
        );
      } catch {
        // No fix available (airplane mode, indoors with location services off).
        // The map stays on its initial region rather than showing an error the
        // user can do nothing about.
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

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

    // The personal layer uses the same window as the shared one, so the two
    // always describe the same stretch of time. It is read straight from the
    // local database and never filtered by species or event type: those
    // filters exist to narrow other people's activity, and silently hiding
    // the user's own catches behind them is how the map came to look empty
    // in the first place.
    try {
      const db = await getDb();
      const [own, routes] = await Promise.all([
        getOwnEventsInWindow(db, filter.since, filter.until ?? null),
        getOwnTripRoutesInWindow(db, filter.since, filter.until ?? null)
      ]);
      console.log(
        `[strike/map] personal layer: ${own.length} own events, ${routes.length} routes since ${filter.since}`
      );
      setOwnEvents(own);
      setOwnRoutes(routes);
    } catch (error) {
      // A failed local read must not blank the shared map — but it must not be
      // invisible either. A silent catch around a database read is how this
      // project hid a schema mismatch for weeks while the app looked fine.
      console.warn("[strike/map] personal layer read failed", error);
    }
  }, []);

  // Restore sticky filter prefs on mount
  useEffect(() => {
    AsyncStorage.multiGet([SPECIES_PREF_KEY, EVENT_TYPES_PREF_KEY, LAYERS_PREF_KEY])
      .then(([[, sp], [, et], [, layers]]) => {
        if (sp) setSpeciesFilter(sp);
        if (et) { try { setEventTypeFilter(JSON.parse(et) as string[]); } catch { /* ignore */ } }
        if (layers) {
          try {
            const parsed = JSON.parse(layers) as { own?: boolean; community?: boolean };
            if (typeof parsed.own === "boolean") setShowOwnLayer(parsed.own);
            if (typeof parsed.community === "boolean") setShowCommunityLayer(parsed.community);
          } catch { /* ignore */ }
        }
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
  const visibleActivity = hexes.filter((h) => h.total >= MIN_CELL_OBSERVATIONS).length;
  const selectedHex = hexes.find((h) => h.h3_cell === selectedCell) ?? null;

  /**
   * The visible cells, as real hexagons.
   *
   * This replaced a blurred SVG layer drawn on top of the map. The blur had to
   * guess a radius in pixels from the zoom level, which meant it either
   * vanished or smeared across ground nobody had fished, and at the handful of
   * observations this beta will have for months it read as a smudge rather
   * than as data. A polygon takes map coordinates, so the map draws the cell
   * the server actually reported — no pixel maths, no zoom multiplier, and the
   * shape always covers exactly the right ground.
   */
  /*
   * NOT filtered by viewport or zoom any more. Build 47 crashed natively
   * (NSInvalidArgumentException in RCTLegacyViewManagerInteropComponentView
   * finalizeUpdates) while zooming: react-native-maps 1.20 runs through the
   * New Architecture's legacy interop layer, and that layer aborts when MapView
   * children are mounted and unmounted in quick succession — which is exactly
   * what a viewport filter re-run on every onRegionChangeComplete does. The map
   * clips off-screen overlays itself, so the set of children must only change
   * when the data changes, never when the camera moves.
   */
  const cellPolygons = useMemo(() => {
    return hexes
      .filter((hex) => hex.total >= MIN_CELL_OBSERVATIONS)
      .map((hex) => ({
        cell: hex.h3_cell,
        total: hex.total,
        coordinates: cellToPolygon(hex.h3_cell),
        color: getActivityColor(hex.total),
        alpha: cellFillAlpha(hex.total)
      }));
  }, [hexes]);

  /**
   * The angler's own events, grouped by the cell they fall in. Five catches on
   * one beach drew five pins stacked on each other, which reads as a single
   * pin and throws away the count — the one number that says "this spot keeps
   * producing". One pin per cell, carrying how many.
   */
  const ownClusters = useMemo(() => {
    const byCell = new Map<string, { lat: number; lng: number; types: string[] }>();
    for (const event of ownEvents) {
      const cell = latLngToCell(event.latitude, event.longitude);
      const entry = byCell.get(cell) ?? { lat: 0, lng: 0, types: [] };
      entry.lat += event.latitude;
      entry.lng += event.longitude;
      entry.types.push(event.type);
      byCell.set(cell, entry);
    }
    return Array.from(byCell.entries()).map(([cell, entry]) => ({
      cell,
      // The members' average position, not the cell centre. These are the
      // user's own events shown only to them, so there is nothing to coarsen:
      // they already know which rock they were standing on.
      latitude: entry.lat / entry.types.length,
      longitude: entry.lng / entry.types.length,
      count: entry.types.length,
      type: dominantEventType(entry.types)
    }));
  }, [ownEvents]);

  /**
   * Zoomed in, the grouping above stops helping: one stretch of coast fills
   * the screen and "3" on a pin hides exactly what the angler wants to see —
   * which follow, which strike, which fish, and the route walked between them.
   * So past DETAIL_LAT_DELTA the personal layer draws like the single-trip map:
   * every observation on its own pin (tap → that observation) and each trip's
   * route (tap → that trip). Zoomed out it goes back to grouped pins, because
   * fifty overlapping pins and routes at county scale is noise.
   */
  const detailMode = liveRegion.latitudeDelta <= DETAIL_LAT_DELTA;

  // Not viewport-filtered, for the same reason as cellPolygons above.
  const ownDetailEvents = useMemo(
    () =>
      // Catches drawn last so they sit on top when pins overlap.
      [...ownEvents].sort((a, b) => (a.type === "catch" ? 1 : 0) - (b.type === "catch" ? 1 : 0)),
    [ownEvents]
  );

  /*
   * Layer visibility. Every layer stays mounted and is hidden through its props
   * (opacity / transparent colours / tappable) instead of being conditionally
   * rendered: toggling a layer or crossing DETAIL_LAT_DELTA while zooming used
   * to mount and unmount whole groups of MapView children, which is what
   * crashed the interop layer (see cellPolygons). Changing props on children
   * that already exist is safe.
   */
  const showCells = showCommunityLayer;
  const showOwnDetail = showOwnLayer && detailMode;
  const showOwnClusters = showOwnLayer && !detailMode;
  const HIDDEN = "rgba(0,0,0,0)";

  // Top 8 hex cells by activity — rendered as numbered markers
  const hotspots = useMemo(
    () => [...hexes].sort((a, b) => b.total - a.total).filter((h) => h.total >= MIN_HOTSPOT_OBSERVATIONS).slice(0, 8),
    [hexes]
  );

  const handleMapPress = useCallback(
    (event: {
      nativeEvent: { coordinate: { latitude: number; longitude: number }; action?: string };
    }) => {
      // On iOS a tap on a marker also reaches the map. That tap belongs to the
      // marker (it navigates away), so don't also select whatever cell is near.
      if (event.nativeEvent.action === "marker-press") return;
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

  const setLayers = useCallback((own: boolean, community: boolean) => {
    setShowOwnLayer(own);
    setShowCommunityLayer(community);
    void AsyncStorage.setItem(LAYERS_PREF_KEY, JSON.stringify({ own, community }));
  }, []);

  const hasActiveFilters = speciesFilter !== "" || eventTypeFilter.length > 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.textMuted} />
      }
    >
      <View style={styles.titleBlock}>
        <Text style={styles.kicker}>{t("bitemap.kicker")}</Text>
        <Text style={styles.title}>{t("bitemap.title")}</Text>
        <Text style={styles.subtitle}>
          {subLabel(timeMode, t, customSince && customUntil ? `${customFrom} – ${customTo}` : undefined)}
          {__DEV__
            ? `  ·  own:${ownEvents.length} clusters:${ownClusters.map((c) => `${c.type}x${c.count}`).join(" ")}`
            : ""}
        </Text>
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
          accessibilityRole="button"
          accessibilityLabel={t("bitemap.filterTitle")}
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

      {/* Layers. Kept out on the screen rather than inside the filter sheet:
          which data you are looking at is not a filter, it is the first thing
          you need to know about what is in front of you. */}
      <View style={styles.layerRow}>
        <Pressable
          style={[styles.layerChip, showOwnLayer && styles.layerChipOwn]}
          onPress={() => setLayers(!showOwnLayer, showCommunityLayer)}
        >
          <Ionicons
            name="fish-outline"
            size={14}
            color={showOwnLayer ? Colors.navy : Colors.textMuted}
          />
          <Text style={[styles.layerChipText, showOwnLayer && styles.layerChipTextActive]}>
            {t("bitemap.layerOwn")}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.layerChip, showCommunityLayer && styles.layerChipCommunity]}
          onPress={() => setLayers(showOwnLayer, !showCommunityLayer)}
        >
          <Ionicons
            name="people-outline"
            size={14}
            color={showCommunityLayer ? Colors.navy : Colors.textMuted}
          />
          <Text style={[styles.layerChipText, showCommunityLayer && styles.layerChipTextActive]}>
            {t("bitemap.layerCommunity")}
          </Text>
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
          // customMapStyle is a Google Maps feature and does nothing on iOS,
          // which is why every Apple POI — hospitals, parks, shopping centres —
          // was still painted at full saturation over the activity layer.
          // mutedStandard is Apple's own toned-down style and is the only
          // lever that works there; the custom style stays for Android.
          mapType={mapType === "standard" ? "mutedStandard" : mapType}
          customMapStyle={mapType === "standard" ? mapStyle : undefined}
          showsPointsOfInterest={false}
          rotateEnabled={false}
          pitchEnabled={false}
          showsCompass={false}
          showsUserLocation={showUserLocation}
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
          {/*
            The user's own events. Deliberately small, deliberately not heat:
            this layer answers "where have I been" and must never be mistaken
            for community activity, which is what the blobs and the numbered
            badges are for. A filled dot is a catch, a ring is a contact or a
            follow.
          */}
          {cellPolygons.map((cell) => (
            <Polygon
              key={`cell-${cell.cell}`}
              coordinates={cell.coordinates}
              fillColor={showCells ? `${cell.color}${cell.alpha}` : HIDDEN}
              strokeColor={showCells ? cell.color : HIDDEN}
              strokeWidth={cell.total >= 9 ? 2.5 : 2}
              tappable={showCells}
              onPress={() => {
                if (!showCells) return;
                // The cell is a real shape now, so it can answer for itself.
                // handleMapPress still guesses the nearest cell from a tap on
                // bare map, for the gap between two drawn cells.
                setSelectedSpot(null);
                setSpotForm(null);
                setSelectedCell(cell.cell);
              }}
            />
          ))}
          {/* Own trip routes — only zoomed in, drawn under the pins. */}
          {ownRoutes.map((trip) => (
            <Polyline
              key={`route-${trip.id}`}
              coordinates={trip.route}
              strokeColor={showOwnDetail ? OWN_ROUTE_COLOR : HIDDEN}
              strokeWidth={3}
              lineCap="round"
              lineJoin="round"
              tappable={showOwnDetail}
              onPress={() => {
                if (showOwnDetail) router.push(`/trip/${trip.id}`);
              }}
            />
          ))}
          {/* Zoomed in: every own observation on its own pin, tap opens it. */}
          {ownDetailEvents.map((event) => (
            <Marker
              key={`own-event-${event.id}`}
              coordinate={{ latitude: event.latitude, longitude: event.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              opacity={showOwnDetail ? 1 : 0}
              tracksViewChanges={trackOwnMarkers}
              onPress={() => {
                if (showOwnDetail) router.push(`/event/${event.id}`);
              }}
            >
              <OwnEventPin type={event.type} count={1} />
            </Marker>
          ))}
          {/* Zoomed out: one grouped pin per cell. */}
          {ownClusters.map((cluster) => (
            <Marker
              key={`own-${cluster.cell}`}
              coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              opacity={showOwnClusters ? 1 : 0}
              tracksViewChanges={trackOwnMarkers}
              onPress={() =>
                // A grouped pin zooms in to where its observations become
                // individually tappable instead of doing nothing.
                showOwnClusters &&
                mapRef.current?.animateToRegion(
                  {
                    latitude: cluster.latitude,
                    longitude: cluster.longitude,
                    latitudeDelta: DETAIL_LAT_DELTA * 0.6,
                    longitudeDelta: DETAIL_LAT_DELTA * 0.6
                  },
                  500
                )
              }
            >
              <OwnEventPin type={cluster.type} count={cluster.count} />
            </Marker>
          ))}
          {hotspots.map((hex) => {
            const ringColor = hex.total >= 9 ? "#FF3800" : hex.total >= 4 ? "#F4C84F" : "#35D48F";
            return (
              <Marker
                key={`hotspot-${hex.h3_cell}`}
                coordinate={{ latitude: hex.lat, longitude: hex.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                // Hotspots are community data, so they follow the community
                // switch (they used to stay visible with it off).
                opacity={showCells ? 1 : 0}
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
        {/* Crosshair — marks the map centre used by "Save map centre as spot" */}
        <View style={styles.crosshair} pointerEvents="none">
          <View style={styles.crosshairH} />
          <View style={styles.crosshairV} />
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

      {/* The personal layer's key: all three observation types, since the
          layer shows all three — naming only catches was wrong. */}
      {showOwnLayer && ownEvents.length > 0 ? (
        <View style={styles.ownLayerKeyBlock}>
          <View style={styles.ownLayerKey}>
            {(["catch", "contact", "following"] as const).map((type) => (
              <View key={type} style={[styles.ownLayerChip, { backgroundColor: EVENT_MARKER_COLORS[type] }]}>
                <Ionicons name={EVENT_MARKER_ICONS[type]} size={11} color="#fff" />
              </View>
            ))}
            <Text style={styles.ownLayerKeyText}>{t("bitemap.ownLayer")}</Text>
          </View>
          <Text style={styles.ownLayerKeyHint}>
            {detailMode ? t("bitemap.ownDetailHint") : t("bitemap.zoomForDetail")}
          </Text>
        </View>
      ) : null}

      {!loading && (totalActivity === 0 || visibleActivity === 0) ? (
        <GlassCard style={styles.emptyCard}>
          <Ionicons name="fish-outline" size={28} color={Colors.textMuted} />
          <Text style={styles.emptyText}>
            {ownEvents.length > 0 ? t("bitemap.emptyWithOwn") : t("bitemap.empty")}
          </Text>
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
              {ALL_SPECIES.filter((s) => s.key !== "other").map((sp) => (
                <Pressable
                  key={sp.key}
                  style={[styles.filterChip, speciesFilter === sp.key && styles.filterChipActive]}
                  onPress={() => {
                    // Tapping the active chip clears the filter. There is no
                    // "all species" chip, so without this the filter could be
                    // set but never unset.
                    const next = speciesFilter === sp.key ? "" : sp.key;
                    setSpeciesFilter(next);
                    void AsyncStorage.setItem(SPECIES_PREF_KEY, next);
                  }}
                >
                  <Text style={[styles.filterChipText, speciesFilter === sp.key && styles.filterChipTextActive]}>
                    {t(sp.labelKey as never)}
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
  layerRow: {
    flexDirection: "row",
    gap: 8
  },
  layerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.glassBg,
    borderWidth: 1,
    borderColor: Colors.glassBorder
  },
  layerChipOwn: {
    backgroundColor: Colors.catchGreen,
    borderColor: Colors.catchGreen
  },
  layerChipCommunity: {
    backgroundColor: Colors.amber,
    borderColor: Colors.amber
  },
  layerChipText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 0.3
  },
  layerChipTextActive: {
    color: Colors.navy
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
    borderRadius: 16,
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
  crosshair: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 0,
    height: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  crosshairH: {
    position: "absolute",
    width: 20,
    height: 1.5,
    backgroundColor: Colors.amber,
    opacity: 0.85,
    marginLeft: -10,
  },
  crosshairV: {
    position: "absolute",
    width: 1.5,
    height: 20,
    backgroundColor: Colors.amber,
    opacity: 0.85,
    marginTop: -10,
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
  ownLayerKeyBlock: {
    alignItems: "center",
    gap: 4,
    marginTop: 6
  },
  ownLayerKey: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  ownLayerKeyText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.textMuted,
    marginLeft: 2
  },
  ownLayerKeyHint: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center"
  },
  // The legend's miniature of the pin itself — same icon, same colour, just
  // small enough to sit next to a line of text.
  ownLayerChip: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.25,
    borderColor: "rgba(255,255,255,0.55)"
  },
  hotspotCircle: {
    width: 40,
    height: 40,
    borderRadius: 16,
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
    borderRadius: 16,
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
