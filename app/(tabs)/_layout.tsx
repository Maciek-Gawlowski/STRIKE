import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

/**
 * Tab labels are rendered by hand rather than left to React Navigation's
 * default label.
 *
 * The default one was truncating short words ("Home" → "Ho…", "Me" → "M…")
 * on a real device. Two things can cause that and we can't rule either out
 * from the layout alone, so this guards against both:
 *
 *  1. Dynamic Type — a user with larger system text scales a 10 px label up
 *     until it no longer fits its fifth of the tab bar. `allowFontScaling`
 *     is off here: this label is chrome sized to a fixed slot, not body copy.
 *  2. Font swap — the brand fonts load asynchronously and deliberately never
 *     block rendering (see app/_layout.tsx), so the label can be measured in
 *     the system fallback and rendered in Montserrat, or the reverse.
 *     `adjustsFontSizeToFit` lets the text shrink a little instead of losing
 *     characters if the two disagree.
 */
function TabLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.85}
      allowFontScaling={false}
      style={{
        width: "100%",
        textAlign: "center",
        color,
        fontFamily: Fonts.headingMedium,
        fontSize: 10,
        letterSpacing: 0
      }}
    >
      {label}
    </Text>
  );
}

export default function TabLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.navy,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 62,
          paddingBottom: 10,
          paddingTop: 6
        },
        tabBarItemStyle: {
          paddingHorizontal: 2
        },
        tabBarActiveTintColor: Colors.amber,
        tabBarInactiveTintColor: Colors.textMuted
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.home"),
          tabBarLabel: ({ color }) => <TabLabel label={t("tabs.home")} color={color} />,
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="logbook"
        options={{
          title: t("tabs.trips"),
          tabBarLabel: ({ color }) => <TabLabel label={t("tabs.trips")} color={color} />,
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="bitemap"
        options={{
          title: t("tabs.biteMap"),
          tabBarLabel: ({ color }) => <TabLabel label={t("tabs.biteMap")} color={color} />,
          tabBarIcon: ({ color, size }) => <Ionicons name="map-outline" size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: t("tabs.stats"),
          tabBarLabel: ({ color }) => <TabLabel label={t("tabs.stats")} color={color} />,
          tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart-outline" size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="privacy"
        options={{
          title: t("tabs.profile"),
          tabBarLabel: ({ color }) => <TabLabel label={t("tabs.profile")} color={color} />,
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />
        }}
      />
    </Tabs>
  );
}
