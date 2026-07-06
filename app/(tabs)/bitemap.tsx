import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GestureResponderEvent } from "react-native";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import MapView from "react-native-maps";
import { GlassCard } from "@/components/GlassCard";
import { GradientLegend } from "@/components/GradientLegend";
import { HeatmapOverlay, type HeatPoint } from "@/components/HeatmapOverlay";
import { Screen } from "@/components/Screen";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";
import { getBiteMapData, type BiteMapHours, type ZoneActivity } from "@/services/biteMap";
import { latLngToXY } from "@/services/heatmapGeo";
import { MOCK_BITE_MAP_ACTIVITY, MOCK_HEAT_POINTS } from "@/services/mockBiteMapHexes";
import { getBiteMapContribution } from "@/database/preferences";
import { useTranslation } from "@/i18n";
import { ALS_CENTER, ZONES } from "@/services/zones";

type MapLayer = "activity" | "waterTemp" | "wind";

const mapStyle = [
  { elementType: "geometry", stylers: [{ color: "#16313F" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8A99A6" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0D1B2A" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0B1622" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1B3A4B" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#1B3A4B" }] }
];

const INITIAL_REGION = {
  latitude: ALS_CENTER.latitude,
  longitude: ALS_CENTER.longitude,
  latitudeDelta: 0.4,
  longitudeDelta: 0.4
};

type TimeTab = { val: BiteMapHours; labelKey: "bitemap.toggle2" | "bitemap.toggle24" | "bitemap.toggle7" };
const TIME_TABS: TimeTab[] = [
  { val: 2, labelKey: "bitemap.toggle2" },
  { val: 24, labelKey: "bitemap.toggle24" },
  { val: 168, labelKey: "bitemap.toggle7" }
];

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

function subLabel(hours: BiteMapHours, t: (key: string) => string): string {
  if (hours === 2) return t("bitemap.sub2");
  if (hours === 24) return t("bitemap.sub24");
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

export default function BiteMapScreen() {
  const { t } = useTranslation();
  const [hours, setHours] = useState<BiteMapHours>(24);
  const [activeLayer, setActiveLayer] = useState<MapLayer>("activity");
  const [zones, setZones] = useState<ZoneActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [contributing, setContributing] = useState(true);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [usingMock, setUsingMock] = useState(false);

  const load = useCallback(async (window: BiteMapHours) => {
    const data = await getBiteMapData(window);
    // TODO: remove fallback after alpha.
    setUsingMock(data.length === 0);
    setZones(data.length > 0 ? data : MOCK_BITE_MAP_ACTIVITY);
  }, []);

  useEffect(() => {
    setLoading(true);
    load(hours).finally(() => setLoading(false));
  }, [hours, load]);

  useEffect(() => {
    getBiteMapContribution().then(setContributing);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(hours);
    setContributing(await getBiteMapContribution());
    setRefreshing(false);
  }, [hours, load]);

  const totalActivity = zones.reduce((sum, zone) => sum + zone.total, 0);
  const selectedZone = zones.find((zone) => zone.zone_id === selectedZoneId) ?? null;

  // Pixel position of each zone center inside the map container — shared by
  // the heatmap blob layout and tap-hit-testing below.
  const zonePositions = useMemo(() => {
    if (mapSize.width === 0 || mapSize.height === 0) return [];
    return ZONES.map((zone) => ({
      id: zone.id,
      ...latLngToXY(zone.latitude, zone.longitude, INITIAL_REGION, mapSize.width, mapSize.height)
    }));
  }, [mapSize]);

  const heatPoints: HeatPoint[] = useMemo(() => {
    const sizeScale = hours === 2 ? 0.8 : hours === 168 ? 1.15 : 1;

    // TODO: remove mock heat-point branch after alpha.
    if (usingMock) {
      if (mapSize.width === 0 || mapSize.height === 0) return [];
      return MOCK_HEAT_POINTS.filter((point) => (hours === 2 ? point.value > 0.4 : true)).map((point) => {
        const { x, y } = latLngToXY(point.latitude, point.longitude, INITIAL_REGION, mapSize.width, mapSize.height);
        const radius = lerp(35, 90, point.value) * sizeScale;
        return { id: point.id, x, y, rx: radius, ry: radius, value: point.value };
      });
    }

    return zonePositions
      .map((pos) => {
        const total = zones.find((z) => z.zone_id === pos.id)?.total ?? 0;
        const value = Math.min(total / 9, 1);
        return { ...pos, value };
      })
      .filter((point) => (hours === 2 ? point.value > 0.4 : true))
      .map((point) => {
        const radius = lerp(35, 90, point.value) * sizeScale;
        return { id: point.id, x: point.x, y: point.y, rx: radius, ry: radius, value: point.value };
      });
  }, [zonePositions, zones, hours, usingMock, mapSize]);

  const handleMapPress = useCallback(
    (event: GestureResponderEvent) => {
      const { locationX, locationY } = event.nativeEvent;
      let nearestId: number | null = null;
      let nearestDist = 40;
      for (const pos of zonePositions) {
        const d = Math.hypot(pos.x - locationX, pos.y - locationY);
        if (d <= nearestDist) {
          nearestDist = d;
          nearestId = pos.id;
        }
      }
      setSelectedZoneId(nearestId);
    },
    [zonePositions]
  );

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
        <Text style={styles.subtitle}>{subLabel(hours, t)}</Text>
      </View>

      {/* 3-segment time control */}
      <GlassCard style={styles.toggleControl}>
        {TIME_TABS.map(({ val, labelKey }) => (
          <Pressable
            key={val}
            style={[styles.togglePill, hours === val && styles.togglePillActive]}
            onPress={() => {
              setSelectedZoneId(null);
              setHours(val);
            }}
          >
            <Text style={[styles.toggleText, hours === val && styles.toggleTextActive]}>
              {t(labelKey)}
            </Text>
          </Pressable>
        ))}
      </GlassCard>

      {/* Layer selector — Vandtemp and Vind are disabled pending data */}
      <GlassCard style={styles.layerControl}>
        <Pressable
          style={[styles.layerPill, activeLayer === "activity" && styles.layerPillActive]}
          onPress={() => setActiveLayer("activity")}
        >
          <Text style={[styles.layerText, activeLayer === "activity" && styles.layerTextActive]}>
            {t("bitemap.layerActivity")}
          </Text>
        </Pressable>
        <View style={[styles.layerPill, styles.layerPillDisabled]}>
          <Text style={styles.layerTextDisabled}>{t("bitemap.layerWaterTemp")}</Text>
          <Text style={styles.comingSoon}>{t("bitemap.comingSoon")}</Text>
        </View>
        <View style={[styles.layerPill, styles.layerPillDisabled]}>
          <Text style={styles.layerTextDisabled}>{t("bitemap.layerWind")}</Text>
          <Text style={styles.comingSoon}>{t("bitemap.comingSoon")}</Text>
        </View>
      </GlassCard>

      <View
        style={styles.mapShell}
        onLayout={(event) =>
          setMapSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })
        }
      >
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={INITIAL_REGION}
          customMapStyle={mapStyle}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          showsCompass={false}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={handleMapPress}>
          <HeatmapOverlay width={mapSize.width} height={mapSize.height} points={heatPoints} />
        </Pressable>
      </View>

      {/* Hotspot detail sheet */}
      {selectedZone ? (
        <GlassCard glow style={styles.infoCard}>
          {/* Activity bubble + zone name */}
          <View style={styles.sheetHeader}>
            <View style={[styles.activityBubble, { borderColor: getActivityColor(selectedZone.total) }]}>
              <Text style={[styles.activityTotal, { color: getActivityColor(selectedZone.total) }]}>
                {selectedZone.total}
              </Text>
            </View>
            <View style={styles.sheetHeaderText}>
              <Text style={styles.infoZone}>{selectedZone.zone_name}</Text>
              <Text style={[styles.activityLabel, { color: getActivityColor(selectedZone.total) }]}>
                {getActivityLabel(selectedZone.total, t)}
              </Text>
              <Text style={styles.sheetSubKicker}>{subLabel(hours, t)}</Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          {/* 3-counter horizontal row */}
          <View style={styles.counterRow}>
            <View style={styles.counterCell}>
              <View style={[styles.sheetIconBubble, styles.sheetIconCatch]}>
                <Ionicons name="fish-outline" size={14} color="#35d48f" />
              </View>
              <Text style={styles.counterValue}>{selectedZone.catches}</Text>
              <Text style={styles.counterLabel}>{t("bitemap.sheetCatches")}</Text>
            </View>
            <View style={styles.counterDivider} />
            <View style={styles.counterCell}>
              <View style={[styles.sheetIconBubble, styles.sheetIconContact]}>
                <Ionicons name="flash-outline" size={14} color="#f4c84f" />
              </View>
              <Text style={styles.counterValue}>{selectedZone.contacts}</Text>
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

      {!contributing ? (
        <Text style={styles.privacyNote}>{t("bitemap.notContributing")}</Text>
      ) : null}
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
  // Time tabs
  toggleControl: {
    flexDirection: "row",
    borderRadius: 20,
    padding: 6,
    gap: 6
  },
  togglePill: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
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
    fontSize: 12,
    letterSpacing: 0.5
  },
  toggleTextActive: {
    color: Colors.textOnAmber
  },
  // Layer selector
  layerControl: {
    flexDirection: "row",
    borderRadius: 20,
    padding: 6,
    gap: 6
  },
  layerPill: {
    flex: 1,
    minHeight: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: Colors.field
  },
  layerPillActive: {
    backgroundColor: Colors.teal,
    borderWidth: 1,
    borderColor: Colors.glassBorder
  },
  layerPillDisabled: {
    opacity: 0.45
  },
  layerText: {
    color: Colors.text,
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 0
  },
  layerTextActive: {
    color: Colors.textBright
  },
  layerTextDisabled: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 0
  },
  comingSoon: {
    color: Colors.amber,
    fontFamily: Fonts.bodySemibold,
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: "uppercase"
  },
  // Map
  mapShell: {
    height: 380,
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border
  },
  // Hotspot sheet
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
  infoZone: {
    color: Colors.textBright,
    fontFamily: Fonts.heading,
    fontSize: 18,
    letterSpacing: 0
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
  privacyNote: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: Fonts.body,
    textAlign: "center"
  }
});
