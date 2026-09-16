import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Circle, G, Line, Path, Rect, Svg, Text as SvgText } from "react-native-svg";
import { GlassCard } from "@/components/GlassCard";
import { MetricCard } from "@/components/MetricCard";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { getStatistics, getBestConditions, getLureStats, type Statistics, type WindDirectionCount, type WaterTempBucket, type BestConditions, type LureStat } from "@/services/statistics";
import { useStrikeStore } from "@/store/useStrikeStore";
import { LureColourDot } from "@/components/LureColourDot";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

// ── Compass rose — catches by wind direction ──────────────────────────────────

const DIRS_16 = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"] as const;
const LABEL_DIRS = new Set(["N","NE","E","SE","S","SW","W","NW"]);
const CX = 100, CY = 100, MAX_R = 68, INNER_R = 12;

function CompassRose({ data }: { data: WindDirectionCount[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const countFor = (dir: string) => data.find((x) => x.direction === dir)?.count ?? 0;

  return (
    <Svg width={200} height={200} viewBox="0 0 200 200">
      {/* Concentric guide rings */}
      {[0.33, 0.67, 1].map((t) => (
        <Circle key={t} cx={CX} cy={CY} r={MAX_R * t}
          fill="none" stroke="rgba(217,218,213,0.07)" strokeWidth={1} />
      ))}

      {/* Direction spokes + bars */}
      {DIRS_16.map((dir, i) => {
        const count = countFor(dir);
        const rad = ((i * 22.5) - 90) * (Math.PI / 180);
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const barLen = INNER_R + (count / maxCount) * (MAX_R - INNER_R);
        const hasData = count > 0;
        // reference spoke end
        const tx1 = CX + INNER_R * cos, ty1 = CY + INNER_R * sin;
        const tx2 = CX + (INNER_R + 4) * cos, ty2 = CY + (INNER_R + 4) * sin;
        // amber bar end
        const bx2 = CX + barLen * cos, by2 = CY + barLen * sin;
        // label position
        const LR = MAX_R + 15;
        const lx = CX + LR * cos, ly = CY + LR * sin + 4;

        return (
          <G key={dir}>
            {/* dim tick at inner radius for all directions */}
            <Line x1={tx1} y1={ty1} x2={tx2} y2={ty2}
              stroke="rgba(217,218,213,0.14)" strokeWidth={1.5} />
            {/* amber bar where count > 0 */}
            {hasData && (
              <Line
                x1={CX + INNER_R * cos} y1={CY + INNER_R * sin}
                x2={bx2} y2={by2}
                stroke={Colors.amber}
                strokeWidth={i % 2 === 0 ? 5 : 3.5}
                strokeLinecap="round"
                opacity={0.45 + 0.55 * (count / maxCount)}
              />
            )}
            {/* label for 8 main directions */}
            {LABEL_DIRS.has(dir) && (
              <SvgText
                x={lx} y={ly}
                fill={count > 0 ? Colors.text : Colors.textMuted}
                fontSize={9}
                textAnchor="middle"
                fontFamily={Fonts.heading}
              >
                {dir}
              </SvgText>
            )}
          </G>
        );
      })}

      {/* Centre dot */}
      <Circle cx={CX} cy={CY} r={5} fill={Colors.amber} opacity={0.9} />
    </Svg>
  );
}

// ── Vertical bar chart — catches by water temp ────────────────────────────────

const BAR_W = 46, BAR_GAP = 10;
const CHART_W = 4 * BAR_W + 3 * BAR_GAP; // 214
const CHART_H = 90;
const CHART_BOTTOM = 22, CHART_TOP = 10;
const CHART_USABLE_H = CHART_H - CHART_BOTTOM - CHART_TOP;
const CHART_START_X = 0;

function TempBarChart({ data }: { data: WaterTempBucket[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <Svg width={CHART_W} height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
      {data.map((bucket, i) => {
        const barH = bucket.count > 0
          ? Math.max((bucket.count / maxCount) * CHART_USABLE_H, 6)
          : 0;
        const x = CHART_START_X + i * (BAR_W + BAR_GAP);
        const y = CHART_H - CHART_BOTTOM - barH;
        const opacity = bucket.count > 0 ? 0.3 + 0.7 * (bucket.count / maxCount) : 0.1;

        return (
          <G key={bucket.range}>
            {/* background slot */}
            <Rect x={x} y={CHART_TOP} width={BAR_W} height={CHART_USABLE_H}
              fill="rgba(217,218,213,0.05)" rx={6} />
            {/* amber bar */}
            <Rect x={x} y={y} width={BAR_W} height={Math.max(barH, bucket.count > 0 ? 1 : 0)}
              fill={Colors.amber} opacity={opacity} rx={6} />
            {/* count label above bar */}
            {bucket.count > 0 && (
              <SvgText x={x + BAR_W / 2} y={y - 3}
                fill={Colors.textBright} fontSize={11}
                textAnchor="middle" fontFamily={Fonts.heading}>
                {bucket.count}
              </SvgText>
            )}
            {/* range label below */}
            <SvgText x={x + BAR_W / 2} y={CHART_H - 5}
              fill={Colors.textMuted} fontSize={8}
              textAnchor="middle" fontFamily={Fonts.bodySemibold}>
              {bucket.range}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ── 24h density strip ─────────────────────────────────────────────────────────

const STRIP_W = 280, STRIP_H = 28, STRIP_LABEL_H = 15;
const SEG_W = STRIP_W / 24;

function DayStrip({
  hourCounts,
  bestTimeOfDay,
}: {
  hourCounts: number[];
  bestTimeOfDay: string | null;
}) {
  const maxCount = Math.max(...hourCounts, 1);
  const hasData = hourCounts.some((c) => c > 0);

  // Parse best window boundaries e.g. "06:00-09:00"
  let bestStart = -1, bestEnd = -1;
  if (bestTimeOfDay) {
    bestStart = parseInt(bestTimeOfDay.slice(0, 2), 10);
    bestEnd   = parseInt(bestTimeOfDay.slice(6, 8), 10);
  }

  return (
    <Svg width={STRIP_W} height={STRIP_H + STRIP_LABEL_H}
      viewBox={`0 0 ${STRIP_W} ${STRIP_H + STRIP_LABEL_H}`}>
      {/* segments */}
      {hourCounts.map((count, hour) => {
        const opacity = hasData
          ? (count > 0 ? 0.18 + 0.82 * (count / maxCount) : 0.06)
          : 0.06;
        return (
          <Rect key={hour}
            x={hour * SEG_W + 0.5}
            y={0}
            width={SEG_W - 1}
            height={STRIP_H}
            fill={Colors.amber}
            opacity={opacity}
            rx={2}
          />
        );
      })}

      {/* Best-window bracket */}
      {bestStart >= 0 && (
        <Rect
          x={bestStart * SEG_W + 0.5}
          y={0.5}
          width={(bestEnd - bestStart) * SEG_W - 1}
          height={STRIP_H - 1}
          fill="none"
          stroke={Colors.amber}
          strokeWidth={1.5}
          rx={3}
          opacity={0.9}
        />
      )}

      {/* Hour labels */}
      {[0, 6, 12, 18].map((hour) => (
        <SvgText key={hour}
          x={hour * SEG_W + SEG_W / 2}
          y={STRIP_H + STRIP_LABEL_H - 2}
          fill={Colors.textMuted}
          fontSize={9}
          textAnchor="middle"
          fontFamily={Fonts.body}>
          {String(hour).padStart(2, "0")}
        </SvgText>
      ))}
      <SvgText
        x={STRIP_W}
        y={STRIP_H + STRIP_LABEL_H - 2}
        fill={Colors.textMuted}
        fontSize={9}
        textAnchor="end"
        fontFamily={Fonts.body}>
        24
      </SvgText>
    </Svg>
  );
}

// ── Time-of-day donut ring ────────────────────────────────────────────────────

const TOD_PERIODS = [
  { key: "morning",   i18nKey: "stats.timeOfDay.morning",   hours: [5,6,7,8,9,10,11],     color: "#F5A623" },
  { key: "afternoon", i18nKey: "stats.timeOfDay.afternoon", hours: [12,13,14,15,16,17],   color: "#FF6A00" },
  { key: "evening",   i18nKey: "stats.timeOfDay.evening",   hours: [18,19,20],            color: "#3A86B0" },
  { key: "night",     i18nKey: "stats.timeOfDay.night",     hours: [21,22,23,0,1,2,3,4],  color: "#4a5e6e" },
] as const;

function polarToCart(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function donutArcPath(cx: number, cy: number, outerR: number, innerR: number, startDeg: number, endDeg: number): string {
  const [ox1, oy1] = polarToCart(cx, cy, outerR, startDeg);
  const [ox2, oy2] = polarToCart(cx, cy, outerR, endDeg);
  const [ix2, iy2] = polarToCart(cx, cy, innerR, endDeg);
  const [ix1, iy1] = polarToCart(cx, cy, innerR, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${ox1.toFixed(2)} ${oy1.toFixed(2)} A ${outerR} ${outerR} 0 ${large} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)} L ${ix2.toFixed(2)} ${iy2.toFixed(2)} A ${innerR} ${innerR} 0 ${large} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)} Z`;
}

const RING_SIZE = 140, RING_CX = 70, RING_CY = 70, RING_OUTER = 58, RING_INNER = 36;

function TimeOfDayRing({ hourCounts, t }: { hourCounts: number[]; t: (k: string) => string }) {
  const counts = TOD_PERIODS.map((p) => ({
    ...p,
    label: t(p.i18nKey),
    count: p.hours.reduce((s: number, h) => s + (hourCounts[h] ?? 0), 0),
  }));
  const total = counts.reduce((s, c) => s + c.count, 0);
  const best = counts.reduce((a, b) => (b.count > a.count ? b : a), counts[0]);

  let cursor = 0;
  const segments = counts.map((seg) => {
    const fraction = total > 0 ? seg.count / total : 0.25;
    const sweep = fraction * 360;
    const start = cursor;
    const end = cursor + Math.max(sweep, sweep > 0 ? 2 : 0);
    cursor += sweep > 0 ? sweep : 90;
    return { ...seg, start, end };
  });

  return (
    <View style={styles.ringWrap}>
      <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        {/* background track */}
        <Circle cx={RING_CX} cy={RING_CY} r={(RING_OUTER + RING_INNER) / 2}
          fill="none" stroke="rgba(217,218,213,0.07)"
          strokeWidth={RING_OUTER - RING_INNER} />
        {segments.map((seg) => {
          if (seg.end - seg.start < 0.5) return null;
          return (
            <Path
              key={seg.key}
              d={donutArcPath(RING_CX, RING_CY, RING_OUTER, RING_INNER, seg.start, seg.end)}
              fill={seg.color}
              opacity={total > 0 ? 0.9 : 0.2}
            />
          );
        })}
        {/* centre label */}
        <SvgText x={RING_CX} y={RING_CY - 5} textAnchor="middle"
          fill={total > 0 ? best.color : Colors.textMuted}
          fontSize={10} fontFamily={Fonts.bodySemibold}>
          {total > 0 ? best.label : "–"}
        </SvgText>
        {total > 0 && (
          <SvgText x={RING_CX} y={RING_CY + 9} textAnchor="middle"
            fill={Colors.textMuted} fontSize={8} fontFamily={Fonts.body}>
            {best.count} {t("metrics.catches").toLowerCase()}
          </SvgText>
        )}
      </Svg>
      {/* Legend */}
      <View style={styles.ringLegend}>
        {counts.map((seg) => (
          <View key={seg.key} style={styles.ringLegendRow}>
            <View style={[styles.ringLegendDot, { backgroundColor: seg.color }]} />
            <Text style={styles.ringLegendLabel}>{seg.label}</Text>
            <Text style={[styles.ringLegendCount, { color: seg.color }]}>{seg.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Monthly stacked bar chart ─────────────────────────────────────────────────
type MonthBucket = { key: string; label: string; catches: number; contacts: number; following: number };
type SpeciesBucket = { species: string; count: number };

const N_MONTHS = 6;
const MBAR_W = 288, MBAR_H = 130;
const MBAR_BOTTOM = 20, MBAR_TOP = 8, MBAR_GAP = 7;
const MBAR_USABLE = MBAR_H - MBAR_BOTTOM - MBAR_TOP;
const MBAR_BAR = (MBAR_W - (N_MONTHS - 1) * MBAR_GAP) / N_MONTHS;

// "Lost" was removed on Claus's call (Sept 2026): a contact already IS a fish
// that wasn't landed, so counting it again as "lost" double-counted the same
// fish in the stacked bar — the bar showed 20 events for 13 registrations.
const SEG_COLORS = {
  catches:  "#3DDBA0",
  contacts: "#FF6A00",
  following: "#3A86B0",
} as const;

function StackedMonthlyChart({ data }: { data: MonthBucket[] }) {
  const maxTotal = Math.max(...data.map((d) => d.catches + d.contacts + d.following), 1);

  return (
    <Svg width={MBAR_W} height={MBAR_H} viewBox={`0 0 ${MBAR_W} ${MBAR_H}`}>
      {data.map((bucket, i) => {
        const total = bucket.catches + bucket.contacts + bucket.following;
        const x = i * (MBAR_BAR + MBAR_GAP);
        const totalH = total > 0 ? Math.max((total / maxTotal) * MBAR_USABLE, 4) : 0;

        // Background slot
        const bgY = MBAR_TOP;
        const bgH = MBAR_USABLE;

        // Segment heights (bottom-up: following, contacts, catches)
        const segments: { key: keyof typeof SEG_COLORS; h: number }[] = [];
        const keys: (keyof typeof SEG_COLORS)[] = ["following", "contacts", "catches"];
        for (const key of keys) {
          const count = bucket[key];
          if (count > 0 && total > 0) {
            segments.push({ key, h: (count / total) * totalH });
          }
        }

        let curY = MBAR_H - MBAR_BOTTOM;
        const segEls: React.ReactElement[] = [];
        for (const seg of segments) {
          curY -= seg.h;
          segEls.push(
            <Rect
              key={seg.key}
              x={x}
              y={curY}
              width={MBAR_BAR}
              height={seg.h}
              fill={SEG_COLORS[seg.key]}
              opacity={0.88}
            />
          );
        }

        return (
          <G key={bucket.key}>
            {/* background slot */}
            <Rect x={x} y={bgY} width={MBAR_BAR} height={bgH}
              fill="rgba(217,218,213,0.05)" rx={5} />
            {/* stacked segments with rounded top on the topmost */}
            {segEls}
            {/* total label above bar */}
            {total > 0 && (
              <SvgText
                x={x + MBAR_BAR / 2}
                y={MBAR_H - MBAR_BOTTOM - totalH - 3}
                fill={Colors.textBright}
                fontSize={9}
                textAnchor="middle"
                fontFamily={Fonts.heading}
              >
                {total}
              </SvgText>
            )}
            {/* month label */}
            <SvgText x={x + MBAR_BAR / 2} y={MBAR_H - 4}
              fill={Colors.textMuted} fontSize={8}
              textAnchor="middle" fontFamily={Fonts.bodySemibold}>
              {bucket.label}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

function StackedChartLegend({ t }: { t: (k: string) => string }) {
  const items: { color: string; label: string }[] = [
    { color: SEG_COLORS.catches,  label: t("metrics.catches") },
    { color: SEG_COLORS.contacts, label: t("metrics.contacts") },
    { color: SEG_COLORS.following, label: t("stats.following") },
  ];
  return (
    <View style={styles.stackLegend}>
      {items.map((item) => (
        <View key={item.color} style={styles.stackLegendRow}>
          <View style={[styles.stackLegendDot, { backgroundColor: item.color }]} />
          <Text style={styles.stackLegendLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function SpeciesChart({ data }: { data: SpeciesBucket[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  return (
    <View style={styles.speciesList}>
      {data.map(({ species, count }) => (
        <View key={species} style={styles.speciesRow}>
          <Text style={styles.speciesName} numberOfLines={1}>{species}</Text>
          <View style={styles.speciesBarTrack}>
            <View style={[styles.speciesBarFill, { flex: count }]} />
            <View style={{ flex: Math.max(maxCount - count, 0) }} />
          </View>
          <Text style={styles.speciesCount}>{count}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Shared empty placeholder ──────────────────────────────────────────────────

function ChartNoData({ label }: { label: string }) {
  return (
    <View style={styles.noData}>
      <Text style={styles.noDataText}>{label}</Text>
    </View>
  );
}

// ── Hero stat tile (icon + big number + label) ────────────────────────────────

function StatTileHero({
  icon, value, label, color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
  color?: string;
}) {
  return (
    <View style={styles.heroTile}>
      <Ionicons name={icon} size={22} color={color ?? Colors.amber} style={styles.heroIcon} />
      <Text style={[styles.heroValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.heroLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// ── Avg stat tile ─────────────────────────────────────────────────────────────

function AvgTile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.avgTile}>
      <Text style={styles.avgValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.avgLabel}>{label}</Text>
    </View>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function timeOfDayKey(range: string): string {
  const startHour = parseInt(range.slice(0, 2), 10);
  if (startHour >= 5 && startHour < 9) return "earlyMorning";
  if (startHour >= 9 && startHour < 12) return "lateMorning";
  if (startHour >= 12 && startHour < 15) return "midday";
  if (startHour >= 15 && startHour < 18) return "afternoon";
  if (startHour >= 18 && startHour < 21) return "evening";
  return "night";
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const { t } = useTranslation();
  const trips = useStrikeStore((state) => state.trips);
  const activeTrip = useStrikeStore((state) => state.activeTrip);
  const [stats, setStats] = useState<Statistics | null>(null);
  const [bestCond, setBestCond] = useState<BestConditions | null>(null);
  const [lureStats, setLureStats] = useState<LureStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Completed trips only — the tiles above come from getStatistics(), which
  // counts finished trips. Folding the trip that is running right now into the
  // charts below made the same screen show two different totals for catches.
  const allEvents = useMemo(
    () => trips.flatMap((trip) => trip.events),
    [trips]
  );

  const monthlyData = useMemo((): MonthBucket[] => {
    const now = new Date();
    return Array.from({ length: N_MONTHS }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (N_MONTHS - 1 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString([], { month: "short" });
      const catches   = allEvents.filter((e) => e.type === "catch"     && e.timestamp.startsWith(key)).length;
      const contacts  = allEvents.filter((e) => e.type === "contact"   && e.timestamp.startsWith(key)).length;
      const following = allEvents.filter((e) => e.type === "following" && e.timestamp.startsWith(key)).length;
      return { key, label, catches, contacts, following };
    });
  }, [allEvents]);

  const speciesData = useMemo((): SpeciesBucket[] => {
    const counts: Record<string, number> = {};
    let unspecified = 0;
    for (const e of allEvents) {
      if (e.type !== "catch") continue;
      const sp = e.species?.trim();
      if (sp) counts[sp] = (counts[sp] ?? 0) + 1;
      else unspecified += 1;
    }
    const named = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([species, count]) => ({ species, count }));
    // Catches logged without a species used to be dropped silently, so this
    // list added up to less than the catch count on the same screen. They get
    // their own row instead, always last.
    return unspecified > 0
      ? [...named, { species: t("stats.speciesUnspecified"), count: unspecified }]
      : named;
  }, [allEvents, t]);

  const load = useCallback(async () => {
    const [result, cond, lures] = await Promise.all([
      getStatistics(),
      getBestConditions(),
      getLureStats(),
    ]);
    setStats(result);
    setBestCond(cond);
    setLureStats(lures);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.textMuted} />
  );

  if (loading) {
    return (
      <Screen refreshControl={refreshControl}>
        <View style={styles.titleBlock}>
          <Text style={styles.kicker}>{t("stats.kicker")}</Text>
          <Text style={styles.title}>{t("stats.title")}</Text>
        </View>
        <Text style={styles.subtle}>{t("stats.loading")}</Text>
      </Screen>
    );
  }

  if (!stats) {
    return (
      <Screen refreshControl={refreshControl}>
        <View style={styles.titleBlock}>
          <Text style={styles.kicker}>{t("stats.kicker")}</Text>
          <Text style={styles.title}>{t("stats.title")}</Text>
        </View>
        <GlassCard style={styles.emptyCard}>
          <Ionicons name="bar-chart-outline" size={36} color={Colors.textMuted} />
          <Text style={styles.emptyText}>{t("stats.empty")}</Text>
          <Text style={styles.emptyHint}>{t("stats.emptyHint")}</Text>
          <Pressable style={styles.emptyBtn} onPress={() => router.replace("/")}>
            <Ionicons name="navigate-circle-outline" size={18} color={Colors.textOnAmber} />
            <Text style={styles.emptyBtnText}>{t("actions.startTrip")}</Text>
          </Pressable>
        </GlassCard>
      </Screen>
    );
  }

  const hoursPerCatch = stats.totalCatches > 0 ? stats.totalHours / stats.totalCatches : null;
  const noDataLabel = t("stats.noData");

  const hasWindData = stats.catchesByWindDirection.length > 0;
  const hasTempData = stats.catchesByWaterTemp.some((b) => b.count > 0);
  const hasHourData = stats.catchHourCounts.some((c) => c > 0);

  return (
    <Screen refreshControl={refreshControl}>
      <View style={styles.titleBlock}>
        <Text style={styles.kicker}>{t("stats.kicker")}</Text>
        <Text style={styles.title}>{t("stats.title")}</Text>
      </View>

      {/* a) Overview — 3 hero tiles (tiles are flex:1, so they widen to fill the row) */}
      <View style={styles.heroGrid}>
        <StatTileHero icon="eye-outline"   value={stats.totalFollowing} label={t("stats.following")} color={SEG_COLORS.following} />
        <StatTileHero icon="flash-outline" value={stats.totalContacts}  label={t("stats.tileHug")}   color={SEG_COLORS.contacts} />
        <StatTileHero icon="fish-outline"  value={stats.totalCatches}   label={t("metrics.catches")} color={SEG_COLORS.catches} />
      </View>

      {/* b) Averages — stat tiles */}
      <SectionHeader title={t("stats.averages")} />
      <View style={styles.avgGrid}>
        <AvgTile
          value={stats.catchesPerTrip.toFixed(1)}
          label={t("stats.avgTileCatchesPerTrip")}
        />
        <AvgTile
          value={hoursPerCatch != null ? hoursPerCatch.toFixed(1) : "–"}
          label={t("stats.avgTileHoursPerCatch")}
        />
        <AvgTile
          value={stats.avgDistanceBetweenContacts != null
            ? stats.avgDistanceBetweenContacts.toFixed(1)
            : "–"}
          label={t("stats.avgTileKmPerContact")}
        />
        <AvgTile
          value={stats.avgTimeBetweenContacts != null
            ? (stats.avgTimeBetweenContacts / 60).toFixed(1)
            : "–"}
          label={t("stats.avgTileHoursPerContact")}
        />
      </View>
      <Text style={styles.totalsMuted}>
        {t("stats.totals", {
          km: stats.totalDistance.toFixed(1),
          h: stats.totalHours.toFixed(1),
        })}
      </Text>

      {/* c) Monthly stacked chart */}
      <SectionHeader title={t("stats.monthlyChart")} />
      <GlassCard style={styles.panel}>
        {monthlyData.some((b) => b.catches + b.contacts + b.following > 0) ? (
          <View style={styles.stackedChartWrap}>
            <StackedMonthlyChart data={monthlyData} />
            <StackedChartLegend t={t} />
          </View>
        ) : (
          <ChartNoData label={noDataLabel} />
        )}
      </GlassCard>

      {/* c2) By species */}
      <SectionHeader title={t("stats.chartBySpecies")} />
      <GlassCard style={styles.panel}>
        {speciesData.length > 0
          ? <SpeciesChart data={speciesData} />
          : <ChartNoData label={noDataLabel} />}
      </GlassCard>

      {/* d) Most active times — donut ring by period */}
      <SectionHeader title={t("stats.bestTime")} />
      <GlassCard style={styles.panel}>
        {hasHourData
          ? <TimeOfDayRing hourCounts={stats.catchHourCounts} t={t} />
          : <ChartNoData label={noDataLabel} />}
      </GlassCard>

      {/* d) Catches by wind direction — compass rose */}
      <SectionHeader title={t("stats.byWind")} />
      <GlassCard style={styles.panel}>
        {hasWindData ? (
          <View style={styles.roseWrap}>
            <CompassRose data={stats.catchesByWindDirection} />
            {/* top-3 directions as a legend beside the rose */}
            <View style={styles.roseLegend}>
              {stats.catchesByWindDirection.slice(0, 4).map((item) => (
                <View key={item.direction} style={styles.legendRow}>
                  <View style={styles.legendDot} />
                  <Text style={styles.legendDir}>{item.direction}</Text>
                  <Text style={styles.legendCount}>{item.count}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <ChartNoData label={noDataLabel} />
        )}
      </GlassCard>

      {/* e) Catches by water temperature — bar chart */}
      <SectionHeader title={t("stats.byWaterTemp")} />
      <GlassCard style={styles.panel}>
        {hasTempData ? (
          <View style={styles.barChartWrap}>
            <TempBarChart data={stats.catchesByWaterTemp} />
          </View>
        ) : (
          <ChartNoData label={noDataLabel} />
        )}
      </GlassCard>

      {/* f) Top conditions */}
      <SectionHeader title={t("stats.bestConditionsTitle")} />
      <GlassCard style={styles.panel}>
        {bestCond && (bestCond.waterTempRange || bestCond.windDirection || bestCond.pressureAvg) ? (
          <View style={styles.condRows}>
            {bestCond.waterTempRange ? (
              <View style={styles.condRow}>
                <Ionicons name="thermometer-outline" size={18} color={Colors.amber} />
                <Text style={styles.condLabel}>{t("stats.condTemp")}</Text>
                <Text style={styles.condValue}>{bestCond.waterTempRange}</Text>
              </View>
            ) : null}
            {bestCond.windDirection ? (
              <View style={styles.condRow}>
                <Ionicons name="navigate-outline" size={18} color={Colors.amber} />
                <Text style={styles.condLabel}>{t("stats.condWind")}</Text>
                <Text style={styles.condValue}>
                  {bestCond.windDirection}
                  {bestCond.windSpeedAvg != null ? `  ${bestCond.windSpeedAvg} m/s` : ""}
                </Text>
              </View>
            ) : null}
            {bestCond.pressureAvg != null ? (
              <View style={styles.condRow}>
                <Ionicons name="speedometer-outline" size={18} color={Colors.amber} />
                <Text style={styles.condLabel}>{t("stats.condPressure")}</Text>
                <Text style={styles.condValue}>{bestCond.pressureAvg} hPa</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <Text style={styles.lineMuted}>{t("stats.bestConditionsNoData")}</Text>
        )}
      </GlassCard>

      {/* g) Catches by lure */}
      <SectionHeader title={t("stats.byLure")} />
      <GlassCard style={styles.panel}>
        {lureStats.length > 0 ? (
          <View style={styles.lureList}>
            {lureStats.map((lure, idx) => (
              <View key={lure.lureId} style={[styles.lureRow, idx > 0 && styles.lureRowBorder]}>
                <View style={styles.lureRank}>
                  <Text style={styles.lureRankNum}>{idx + 1}</Text>
                </View>
                <LureColourDot colourKey={lure.colour ?? undefined} colourSecondaryKey={lure.colourSecondary ?? undefined} size={12} />
                <Text style={styles.lureName} numberOfLines={1}>{lure.name}</Text>
                <Text style={styles.lureCatches}>{lure.catches}</Text>
              </View>
            ))}
          </View>
        ) : (
          <ChartNoData label={t("stats.noLureData")} />
        )}
      </GlassCard>

      {/* h) Records */}
      <SectionHeader title={t("stats.records")} />
      {stats.longestTrip ? (
        <GlassCard style={styles.panel}>
          <Text style={styles.recordLabel}>{t("stats.longestTrip")}</Text>
          <Text style={styles.recordValue}>
            {stats.longestTrip.distance.toFixed(2)} km / {stats.longestTrip.duration}
          </Text>
          <Text style={styles.lineMuted}>{formatDate(stats.longestTrip.date)}</Text>
        </GlassCard>
      ) : null}
      {stats.bestTrip ? (
        <GlassCard style={styles.panel}>
          <Text style={styles.recordLabel}>{t("stats.bestTrip")}</Text>
          <Text style={styles.recordValue}>
            {t("stats.bestTripValue", {
              catches: stats.bestTrip.catches,
              contacts: stats.bestTrip.contacts,
            })}
          </Text>
          <Text style={styles.lineMuted}>{formatDate(stats.bestTrip.date)}</Text>
        </GlassCard>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: {
    alignSelf: "flex-start",
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.field,
  },
  backText: {
    color: Colors.text,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 0,
  },
  titleBlock: {
    gap: 2,
  },
  kicker: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 0,
  },
  title: {
    color: Colors.textBright,
    fontSize: 35,
    fontFamily: Fonts.heading,
    letterSpacing: 0,
  },
  subtle: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.body,
  },
  gridRow: {
    flexDirection: "row",
    gap: 9,
  },

  // ── Averages tiles ──
  avgGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  avgTile: {
    width: "47%",
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  avgValue: {
    color: Colors.textBright,
    fontFamily: Fonts.black,
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -1,
  },
  avgLabel: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodySemibold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  totalsMuted: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.body,
    marginTop: 2,
  },

  // ── Monthly chart selector ──
  chartSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chartPill: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.field,
  },
  chartPillActive: {
    backgroundColor: Colors.amber,
  },
  chartPillText: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodySemibold,
    fontSize: 12,
    letterSpacing: 0,
  },
  chartPillTextActive: {
    color: Colors.textOnAmber,
  },
  monthlyWrap: {
    alignItems: "center",
  },

  // ── Species breakdown ──
  speciesList: {
    gap: 10,
  },
  speciesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  speciesName: {
    width: 82,
    color: Colors.text,
    fontFamily: Fonts.bodySemibold,
    fontSize: 12,
    letterSpacing: 0,
  },
  speciesBarTrack: {
    flex: 1,
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(217,218,213,0.08)",
    overflow: "hidden",
  },
  speciesBarFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.amber,
    opacity: 0.85,
  },
  speciesCount: {
    width: 26,
    textAlign: "right",
    color: Colors.amber,
    fontFamily: Fonts.black,
    fontSize: 15,
    letterSpacing: 0,
  },

  // ── Panel (shared GlassCard content wrapper) ──
  panel: {
    padding: 16,
    gap: 12,
  },
  lineStrong: {
    color: Colors.amber,
    fontSize: 16,
    fontFamily: Fonts.heading,
    letterSpacing: 0,
  },
  timeRange: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 14,
  },
  lineMuted: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: Fonts.body,
  },

  // ── 24h strip ──
  stripWrap: {
    marginTop: 4,
  },

  // ── Compass rose ──
  roseWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  roseLegend: {
    flex: 1,
    gap: 10,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.amber,
  },
  legendDir: {
    flex: 1,
    color: Colors.text,
    fontFamily: Fonts.heading,
    fontSize: 13,
    letterSpacing: 0,
  },
  legendCount: {
    color: Colors.amber,
    fontFamily: Fonts.black,
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: 0,
  },

  // ── Bar chart ──
  barChartWrap: {
    alignItems: "center",
  },

  // ── No data placeholder ──
  noData: {
    paddingVertical: 16,
    alignItems: "center",
  },
  noDataText: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 13,
    letterSpacing: 0,
  },

  // ── Lure list ──
  lureList: {
    gap: 0,
  },
  lureRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 10,
  },
  lureRowBorder: {
    borderTopWidth: 1,
    borderTopColor: "rgba(217,218,213,0.08)",
  },
  lureRank: {
    width: 22,
    alignItems: "center",
  },
  lureRankNum: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
  },
  lureName: {
    flex: 1,
    color: Colors.text,
    fontFamily: Fonts.bodySemibold,
    fontSize: 14,
    letterSpacing: 0,
  },
  lureCatches: {
    color: Colors.amber,
    fontFamily: Fonts.black,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: 0,
  },

  // ── Records ──
  recordLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: Fonts.bodySemibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recordValue: {
    color: Colors.textBright,
    fontSize: 18,
    fontFamily: Fonts.heading,
    letterSpacing: 0,
  },

  // ── Empty state ──
  emptyCard: {
    padding: 28,
    gap: 12,
    alignItems: "center",
  },
  emptyText: {
    color: Colors.textBright,
    fontSize: 17,
    fontFamily: Fonts.heading,
    textAlign: "center",
    letterSpacing: 0,
  },
  emptyHint: {
    color: Colors.textMuted,
    fontSize: 14,
    fontFamily: Fonts.body,
    textAlign: "center",
    lineHeight: 20,
    letterSpacing: 0,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 48,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: Colors.amber,
    marginTop: 4
  },
  emptyBtnText: {
    color: Colors.textOnAmber,
    fontFamily: Fonts.heading,
    fontSize: 14,
    letterSpacing: 0
  },

  // ── Time-of-day ring ──
  ringWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  ringLegend: {
    flex: 1,
    gap: 10,
  },
  ringLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ringLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ringLegendLabel: {
    flex: 1,
    color: Colors.text,
    fontFamily: Fonts.body,
    fontSize: 13,
    letterSpacing: 0,
  },
  ringLegendCount: {
    fontFamily: Fonts.black,
    fontSize: 16,
    letterSpacing: 0,
  },

  // ── Top conditions ──
  condRows: {
    gap: 12,
  },
  condRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  condLabel: {
    flex: 1,
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 13,
    letterSpacing: 0,
  },
  condValue: {
    color: Colors.text,
    fontFamily: Fonts.bodySemibold,
    fontSize: 13,
    letterSpacing: 0,
    textAlign: "right",
  },

  // ── Hero stat tiles ──
  heroGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  heroTile: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  heroIcon: {
    marginBottom: 2,
  },
  heroValue: {
    color: Colors.text,
    fontFamily: Fonts.black,
    fontSize: 22,
    letterSpacing: 0,
    lineHeight: 26,
  },
  heroLabel: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    textAlign: "center",
  },

  // ── Stacked chart ──
  stackedChartWrap: {
    gap: 10,
  },
  stackLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  stackLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  stackLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stackLegendLabel: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 11,
    letterSpacing: 0,
  },
});
