import Svg, { Defs, Ellipse, FeGaussianBlur, Filter, G, RadialGradient, Stop } from "react-native-svg";

export type HeatPoint = {
  id: number;
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** Normalised activity, 0..1 — drives gradient opacity, not color. */
  value: number;
};

type Props = {
  width: number;
  height: number;
  points: HeatPoint[];
};

/**
 * Smooth blob heatmap rendered as a transparent Svg layer above the MapView.
 * Every point shares the same green→yellow→orange→red radial gradient;
 * activity controls how opaque (and how large) the blob is, not which color
 * is used. Overlapping low-activity green smudges naturally blend toward
 * yellow/red near high-activity clusters, which is what avoids the flat
 * "single red blob" look. A shared Gaussian blur softens all edges.
 */
export function HeatmapOverlay({ width, height, points }: Props) {
  if (width <= 0 || height <= 0) return null;

  return (
    <Svg width={width} height={height} pointerEvents="none">
      <Defs>
        <Filter id="heatBlur" x="-60%" y="-60%" width="220%" height="220%">
          <FeGaussianBlur in="SourceGraphic" stdDeviation={14} />
        </Filter>
        {points.map((point) => (
          <RadialGradient key={point.id} id={`heatGrad-${point.id}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FF1400" stopOpacity={point.value * 0.95} />
            <Stop offset="0.3" stopColor="#FF6600" stopOpacity={point.value * 0.8} />
            <Stop offset="0.55" stopColor="#FFCC00" stopOpacity={point.value * 0.6} />
            <Stop offset="0.75" stopColor="#00C040" stopOpacity={point.value * 0.35} />
            <Stop offset="1.0" stopColor="#00C040" stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      <G filter="url(#heatBlur)">
        {points.map((point) => (
          <Ellipse
            key={point.id}
            cx={point.x}
            cy={point.y}
            rx={point.rx}
            ry={point.ry}
            fill={`url(#heatGrad-${point.id})`}
          />
        ))}
      </G>
    </Svg>
  );
}
