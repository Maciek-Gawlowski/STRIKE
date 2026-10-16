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
  if (width <= 0 || height <= 0 || points.length === 0) return null;

  // The blur has to track blob size. A fixed 22 px radius swallowed small
  // blobs whole when the map was zoomed out and barely softened large ones
  // when it was zoomed in, so the layer never looked like the same thing
  // twice.
  const meanRadius = points.reduce((sum, point) => sum + point.rx, 0) / points.length;
  const blur = Math.max(4, Math.min(30, meanRadius * 0.3));

  return (
    <Svg width={width} height={height} pointerEvents="none">
      <Defs>
        <Filter id="heatBlur" x="-80%" y="-80%" width="260%" height="260%">
          <FeGaussianBlur in="SourceGraphic" stdDeviation={blur} />
        </Filter>
        {points.map((point) => {
          // Opacity scaled straight off `value` meant a cell that had just
          // cleared the display threshold was drawn at a third of full
          // strength — over a dark map that reads as a grey-purple smudge
          // rather than activity. Anything shown at all has earned enough
          // observations to be worth seeing, so intensity starts well above
          // zero and `value` separates the busy cells from the quiet ones.
          const intensity = 0.45 + 0.55 * point.value;
          return (
            <RadialGradient key={point.id} id={`heatGrad-${point.id}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0"    stopColor="#FF1400" stopOpacity={intensity * 0.46} />
              <Stop offset="0.20" stopColor="#FF5500" stopOpacity={intensity * 0.30} />
              <Stop offset="0.42" stopColor="#FF9900" stopOpacity={intensity * 0.18} />
              <Stop offset="0.65" stopColor="#AADD00" stopOpacity={intensity * 0.08} />
              <Stop offset="1.0"  stopColor="#00CC44" stopOpacity={0} />
            </RadialGradient>
          );
        })}
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
