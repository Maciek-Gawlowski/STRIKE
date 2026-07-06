import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { formatDistance, formatDuration, useStrikeStore } from "@/store/useStrikeStore";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

export default function LogbookScreen() {
  const { t } = useTranslation();
  const trips = useStrikeStore((state) => state.trips);

  return (
    <Screen>
      <View style={styles.nav}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
      </View>

      <View>
        <Text style={styles.kicker}>{t("logbook.kicker")}</Text>
        <Text style={styles.title}>{t("logbook.title")}</Text>
      </View>

      <View style={styles.list}>
        {trips.map((trip) => {
          const catches = trip.events.filter((event) => event.type === "catch").length;
          const contacts = trip.events.filter((event) => event.type === "contact").length;

          return (
            <Pressable key={trip.id} style={styles.card} onPress={() => router.push(`/trip/${trip.id}`)}>
              <View style={styles.cardTop}>
                <View>
                  <Text style={styles.date}>{trip.title}</Text>
                  <Text style={styles.place}>{new Date(trip.startedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
              </View>
              <View style={styles.stats}>
                <Text style={styles.stat}>{formatDuration(trip.startedAt, trip.endedAt)}</Text>
                <Text style={styles.stat}>{formatDistance(trip.distanceMeters)}</Text>
                <Text style={styles.stat}>{t("logbook.catchesCount", { count: catches })}</Text>
                <Text style={styles.stat}>{t("logbook.contactsCount", { count: contacts })}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
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
  list: {
    gap: 12
  },
  card: {
    minHeight: 130,
    borderRadius: 24,
    padding: 17,
    justifyContent: "space-between",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  cardTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  date: {
    color: Colors.textBright,
    fontSize: 19,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  place: {
    color: Colors.textMuted,
    marginTop: 2,
    fontFamily: Fonts.body
  },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  stat: {
    color: Colors.text,
    fontSize: 12,
    fontFamily: Fonts.bodySemibold,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: Colors.pill,
    letterSpacing: 0
  }
});
