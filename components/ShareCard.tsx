import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Line,
  Path,
  Polyline,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import type { WeatherSnapshot } from "@/database/queries";
import { useTranslation } from "@/i18n";
import type { Coordinate, Trip } from "@/store/useStrikeStore";
import { formatDistance, formatDuration } from "@/store/useStrikeStore";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

// Instagram Story ratio: 9:16. At 3× device scale this captures at 1080×1920px.
export const CARD_WIDTH = 360;
export const CARD_HEIGHT = 640;

type Props = {
  trip: Trip;
  weather: WeatherSnapshot | null;
  contactsLabel: string;
  catchesLabel: string;
  showRoute?: boolean;
  showStats?: boolean;
  showLocation?: boolean;
  firstCatchPhotoUri?: string;
};

/** Nautical-chart SVG background with the route as the hero. captureRef-safe (no MapView). */
function RoutePreview({ route, width, height }: { route: Coordinate[]; width: number; height: number }) {
  const AMBER = "#FF6A00";
  const START_COLOR = "#3DDBA0";

  // Grid lines: subtle nautical depth contours
  const gridLines: React.ReactElement[] = [];
  const gridStep = 28;
  for (let x = 0; x < width; x += gridStep) {
    gridLines.push(<Line key={`v${x}`} x1={x} y1={0} x2={x} y2={height} stroke="#1e4a5c" strokeWidth={0.6} opacity={0.5} />);
  }
  for (let y = 0; y < height; y += gridStep) {
    gridLines.push(<Line key={`h${y}`} x1={0} y1={y} x2={width} y2={y} stroke="#1e4a5c" strokeWidth={0.6} opacity={0.5} />);
  }

  // Depth contour ellipses — abstract, not real geography
  const contours = [
    { cx: width * 0.55, cy: height * 0.45, rx: width * 0.38, ry: height * 0.22 },
    { cx: width * 0.5,  cy: height * 0.45, rx: width * 0.52, ry: height * 0.33 },
    { cx: width * 0.48, cy: height * 0.48, rx: width * 0.65, ry: height * 0.44 },
  ];

  const contourEls = contours.map((c, i) => (
    <Path
      key={`c${i}`}
      d={`M ${c.cx - c.rx} ${c.cy} A ${c.rx} ${c.ry} 0 1 0 ${c.cx + c.rx} ${c.cy} A ${c.rx} ${c.ry} 0 1 0 ${c.cx - c.rx} ${c.cy}`}
      fill="none"
      stroke="#1e5a70"
      strokeWidth={1}
      opacity={0.35}
      strokeDasharray={[6, 8]}
    />
  ));

  // No route: just the styled background
  if (route.length < 2) {
    return (
      <Svg width={width} height={height}>
        <Rect width={width} height={height} fill="#0D1B2A" />
        <Rect width={width} height={height} fill="#0a2e3a" opacity={0.45} />
        {gridLines}
        {contourEls}
      </Svg>
    );
  }

  const lats = route.map((p) => p.latitude);
  const lngs = route.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const pad = 40;
  const drawW = width - pad * 2;
  const drawH = height - pad * 2;
  const latSpan = maxLat - minLat || 0.001;
  const lngSpan = maxLng - minLng || 0.001;
  const scale = Math.min(drawW / lngSpan, drawH / latSpan);
  const usedW = lngSpan * scale;
  const usedH = latSpan * scale;
  const ox = pad + (drawW - usedW) / 2;
  const oy = pad + (drawH - usedH) / 2;

  const pts = route
    .map((p) => {
      const x = ox + (p.longitude - minLng) * scale;
      const y = oy + (maxLat - p.latitude) * scale;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const first = route[0];
  const last = route[route.length - 1];
  const sx = ox + (first.longitude - minLng) * scale;
  const sy = oy + (maxLat - first.latitude) * scale;
  const ex = ox + (last.longitude - minLng) * scale;
  const ey = oy + (maxLat - last.latitude) * scale;

  // Compass N indicator — bottom-right corner
  const cx = width - 24;
  const cy = height - 24;
  const cr = 13;

  return (
    <Svg width={width} height={height}>
      {/* Background — two Rects instead of LinearGradient to avoid url(#id) in captureRef */}
      <Rect width={width} height={height} fill="#0D1B2A" />
      <Rect width={width} height={height} fill="#0a2e3a" opacity={0.45} />

      {/* Nautical texture */}
      {gridLines}
      {contourEls}

      {/* Route glow — wide, low-opacity duplicate */}
      <Polyline
        points={pts}
        fill="none"
        stroke={AMBER}
        strokeWidth={14}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.18}
      />

      {/* Route line */}
      <Polyline
        points={pts}
        fill="none"
        stroke={AMBER}
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Start dot */}
      <Circle cx={sx} cy={sy} r={7} fill={START_COLOR} opacity={0.9} />
      <Circle cx={sx} cy={sy} r={3.5} fill="#fff" />

      {/* End dot */}
      <Circle cx={ex} cy={ey} r={7} fill={AMBER} opacity={0.95} />
      <Circle cx={ex} cy={ey} r={3.5} fill="#fff" />

      {/* Compass — subtle, bottom-right */}
      <Circle cx={cx} cy={cy} r={cr} fill="#0d2535" opacity={0.75} />
      <Circle cx={cx} cy={cy} r={cr} fill="none" stroke="#2a6070" strokeWidth={1} />
      {/* N pointer */}
      <Path
        d={`M ${cx} ${cy - cr + 3} L ${cx - 3} ${cy + 2} L ${cx} ${cy - 2} L ${cx + 3} ${cy + 2} Z`}
        fill={AMBER}
        opacity={0.9}
      />
      {/* S pointer */}
      <Path
        d={`M ${cx} ${cy + cr - 3} L ${cx - 2.5} ${cy - 1} L ${cx} ${cy + 2} L ${cx + 2.5} ${cy - 1} Z`}
        fill="#2a6070"
        opacity={0.7}
      />
      <SvgText
        x={cx}
        y={cy - cr - 3}
        fontSize={8}
        fill={AMBER}
        textAnchor="middle"
        opacity={0.9}
      >
        N
      </SvgText>
    </Svg>
  );
}

export const ShareCard = React.forwardRef<View, Props>(
  ({ trip, weather, contactsLabel, catchesLabel, showRoute = true, showStats = true, showLocation = false, firstCatchPhotoUri }, ref) => {
    const { t } = useTranslation();
    const catches = trip.events.filter((e) => e.type === "catch");
    const contacts = trip.events.filter((e) => e.type === "contact").length;

    // Headline: biggest catch length if available, else contacts count.
    const biggestCatch = catches
      .filter((e) => e.lengthCm != null)
      .sort((a, b) => (b.lengthCm ?? 0) - (a.lengthCm ?? 0))[0];

    const headlineNumber = biggestCatch?.lengthCm != null
      ? `${biggestCatch.lengthCm}`
      : `${contacts}`;
    const headlineUnit = biggestCatch?.lengthCm != null
      ? "cm"
      : contactsLabel;
    const headlineSub = biggestCatch?.species
      ? biggestCatch.species.toUpperCase()
      : null;

    // Conditions string: distance · catches · water temp · wind
    const parts: string[] = [];
    const dist = formatDistance(trip.distanceMeters);
    parts.push(dist);
    if (catches.length > 0) {
      parts.push(`${catches.length} ${catchesLabel}`);
    }
    if (weather?.waterTemp != null) {
      parts.push(t("weather.water", { v: Math.round(weather.waterTemp) }));
    }
    if (weather?.windSpeed != null && weather?.windDirection) {
      parts.push(`${weather.windDirection} ${Math.round(weather.windSpeed)} m/s`);
    }
    const conditionsStr = parts.join(" · ");

    const dateStr = new Date(trip.startedAt).toLocaleDateString([], {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const durationStr = formatDuration(trip.startedAt, trip.endedAt);

    return (
      <View ref={ref} style={card.root} collapsable={false}>
        {/* Wordmark */}
        <View style={card.header}>
          <Text style={card.wordmark}>STRIKE</Text>
          <Text style={card.tagline}>FISH. OBSERVE. DATA.</Text>
        </View>

        {/* Hero: photo → route → dark placeholder */}
        <View style={card.mapWrap}>
          {firstCatchPhotoUri ? (
            <Image source={{ uri: firstCatchPhotoUri }} style={card.heroPhoto} resizeMode="cover" />
          ) : showRoute ? (
            <RoutePreview route={trip.route} width={CARD_WIDTH} height={220} />
          ) : (
            <View style={card.heroPlaceholder} />
          )}
        </View>

        {/* Headline stat */}
        {showStats ? (
          <>
            <View style={card.statBlock}>
              <View style={card.statRow}>
                <Text style={card.statNumber}>{headlineNumber}</Text>
                <Text style={card.statUnit}>{headlineUnit.toUpperCase()}</Text>
              </View>
              {headlineSub ? <Text style={card.statSub}>{headlineSub}</Text> : null}
            </View>

            <View style={card.divider} />

            {/* Duration + distance */}
            <View style={card.metaRow}>
              <Text style={card.metaItem}>{durationStr}</Text>
              <Text style={card.metaDot}>·</Text>
              <Text style={card.metaItem}>{dist}</Text>
            </View>

            {/* Conditions */}
            {conditionsStr ? (
              <Text style={card.conditions} numberOfLines={2}>
                {conditionsStr}
              </Text>
            ) : null}
          </>
        ) : null}

        {/* Location badge */}
        {showLocation ? (
          <View style={card.locationBadge}>
            <Text style={card.locationText}>📍 Location shared</Text>
          </View>
        ) : null}

        {/* Date */}
        <Text style={card.date}>{dateStr}</Text>
      </View>
    );
  }
);

ShareCard.displayName = "ShareCard";

const card = StyleSheet.create({
  root: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: Colors.navy,
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 28,
    paddingTop: 44,
    paddingBottom: 20,
    gap: 2,
  },
  wordmark: {
    color: Colors.amber,
    fontFamily: Fonts.black,
    fontSize: 32,
    letterSpacing: 4,
  },
  tagline: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodySemibold,
    fontSize: 10,
    letterSpacing: 2,
  },
  mapWrap: {
    width: CARD_WIDTH,
    height: 220,
    overflow: "hidden",
  },
  heroPhoto: {
    width: CARD_WIDTH,
    height: 220,
  },
  heroPlaceholder: {
    width: CARD_WIDTH,
    height: 220,
    backgroundColor: "#0c1a17",
  },
  locationBadge: {
    marginHorizontal: 28,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignSelf: "flex-start",
  },
  locationText: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 12,
    letterSpacing: 0,
  },
  statBlock: {
    paddingHorizontal: 28,
    paddingTop: 28,
    gap: 4,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  statNumber: {
    color: Colors.textBright,
    fontFamily: Fonts.black,
    fontSize: 80,
    lineHeight: 84,
    letterSpacing: -2,
  },
  statUnit: {
    color: Colors.amber,
    fontFamily: Fonts.black,
    fontSize: 22,
    letterSpacing: 1,
    paddingBottom: 10,
  },
  statSub: {
    color: Colors.amber,
    fontFamily: Fonts.heading,
    fontSize: 16,
    letterSpacing: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 28,
    marginTop: 20,
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 28,
    gap: 8,
    marginBottom: 8,
  },
  metaItem: {
    color: Colors.textBright,
    fontFamily: Fonts.heading,
    fontSize: 16,
    letterSpacing: 0,
  },
  metaDot: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 16,
  },
  conditions: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 13,
    letterSpacing: 0,
    paddingHorizontal: 28,
    lineHeight: 19,
  },
  date: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 12,
    paddingHorizontal: 28,
    marginTop: 10,
    letterSpacing: 0,
  },
});
