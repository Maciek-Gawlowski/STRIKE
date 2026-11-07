import { useMemo } from "react";
import { Alert, Linking } from "react-native";
import { Polygon } from "react-native-maps";
import { isZoneActive, loadZones, type ProtectionZone } from "@/services/protectionZones";

/**
 * Draws the Danish fredningsbælter on a MapView.
 *
 * Every zone, every time. The component takes no position, no region and no
 * zoom level, and the polygon list is built once and memoised forever.
 *
 * That is the entire design and it was arrived at the hard way. Version one
 * filtered by the visible map region and recomputed on onRegionChangeComplete.
 * Version two filtered by a 25 km radius around the angler, snapped to a grid,
 * with a half-second debounce. Both drew correctly. Both crashed the app
 * natively — not a red screen, a straight process death — within seconds of
 * dragging the map near Ishøj, where zones overlap. react-native-maps cannot
 * take overlays appearing and disappearing under a live map, which is also
 * what killed build 47.
 *
 * So nothing here reacts to anything. The cost is in the data file, which is
 * simplified hard enough that 604 polygons can coexist on one map.
 *
 * Zones closed today are drawn solid, seasonal zones currently open are drawn
 * faint. Both are drawn — someone planning next month needs to see what will
 * be shut by then — but they must never look alike.
 */

const ACTIVE_FILL = "rgba(214, 69, 69, 0.22)";
const ACTIVE_STROKE = "rgba(236, 102, 102, 0.85)";
const DORMANT_FILL = "rgba(150, 160, 170, 0.10)";
const DORMANT_STROKE = "rgba(170, 182, 192, 0.40)";

export type ZoneLabels = {
  closed: string;
  open: string;
  period: string;
  law: string;
  readRule: string;
  dismiss: string;
};

const DA: ZoneLabels = {
  closed: "Fredningsbælte",
  open: "Fredningsbælte — ikke aktivt i dag",
  period: "Periode",
  law: "Lovgrundlag",
  readRule: "Se reglen",
  dismiss: "Luk",
};

type Props = {
  /** Date used to decide which zones count as closed. Injectable for tests. */
  date?: Date;
  labels?: ZoneLabels;
};

export function ProtectionZoneLayer({ date, labels = DA }: Props) {
  const polygons = useMemo(() => {
    const when = date ?? new Date();

    const describe = (zone: ProtectionZone, active: boolean) => {
      const lines = [`${labels.period}: ${zone.periodText || "—"}`];
      if (zone.law) lines.push(`${labels.law}: ${zone.law}`);

      const buttons = zone.url
        ? [
            { text: labels.dismiss, style: "cancel" as const },
            { text: labels.readRule, onPress: () => Linking.openURL(zone.url as string) },
          ]
        : [{ text: labels.dismiss, style: "cancel" as const }];

      Alert.alert(`${zone.name} — ${active ? labels.closed : labels.open}`, lines.join("\n"), buttons);
    };

    const out: React.ReactElement[] = [];
    const zones = loadZones();

    for (const zone of zones) {
      const active = isZoneActive(zone, when);
      zone.polygons.forEach((part, index) => {
        out.push(
          <Polygon
            key={`${zone.id}-${index}`}
            coordinates={part.outer.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))}
            holes={
              part.holes.length
                ? part.holes.map((hole) => hole.map(([lng, lat]) => ({ latitude: lat, longitude: lng })))
                : undefined
            }
            fillColor={active ? ACTIVE_FILL : DORMANT_FILL}
            strokeColor={active ? ACTIVE_STROKE : DORMANT_STROKE}
            strokeWidth={1.5}
            tappable
            onPress={() => describe(zone, active)}
          />
        );
      });
    }

    console.log(`[strike/zones] ${zones.length} zones, ${out.length} polygons mounted once`);
    return out;
  }, []);

  return <>{polygons}</>;
}
