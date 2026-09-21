import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MetricCard } from "@/components/MetricCard";
import { Screen } from "@/components/Screen";
import { TripMap } from "@/components/TripMap";
import { useTranslation } from "@/i18n";
import { formatDistance, formatDuration, useStrikeStore } from "@/store/useStrikeStore";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

export default function TripReviewScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const trip = useStrikeStore((state) => state.trips.find((item) => item.id === id));
  const deleteCompletedTrip = useStrikeStore((state) => state.deleteCompletedTrip);
  const removeEvent = useStrikeStore((state) => state.removeEvent);
  const renameTrip = useStrikeStore((state) => state.renameTrip);

  const trips = useStrikeStore((state) => state.trips);

  const [editingName, setEditingName] = useState(false);
  const [nameText, setNameText] = useState("");
  const [replayTick, setReplayTick] = useState<number | undefined>(undefined);

  if (!trip) {
    return (
      <Screen>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
        <Text style={styles.title}>{t("errors.tripNotFound" as never)}</Text>
      </Screen>
    );
  }

  // Find the most recent previous trip that started within 2 km
  const tripStart = trip.route[0] ?? null;
  const nearbyPrevTrip = tripStart ? trips
    .filter((t) => t.id !== trip.id)
    .find((t) => {
      const start = t.route[0];
      if (!start) return false;
      const R = 6371000;
      const toRad = (v: number) => (v * Math.PI) / 180;
      const dLat = toRad(start.latitude - tripStart.latitude);
      const dLon = toRad(start.longitude - tripStart.longitude);
      const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(tripStart.latitude)) * Math.cos(toRad(start.latitude)) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) <= 2000;
    }) : null;

  const catches = trip.events.filter((e) => e.type === "catch").length;
  const contacts = trip.events.filter((e) => e.type === "contact").length;
  const following = trip.events.filter((e) => e.type === "following").length;

  function handleDeleteTrip() {
    Alert.alert(
      t("trip.deleteConfirmTitle"),
      t("trip.deleteTripConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("trip.deleteBtn"),
          style: "destructive",
          onPress: () => {
            deleteCompletedTrip(trip!.id);
            router.back();
          }
        }
      ]
    );
  }

  function handleRemoveEvent(eventId: string) {
    Alert.alert(
      t("trip.removeEventConfirmTitle"),
      t("trip.removeEventConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("trip.removeEventBtn"),
          style: "destructive",
          onPress: () => removeEvent(trip!.id, eventId)
        }
      ]
    );
  }

  function handleStartRename() {
    setNameText(trip!.title);
    setEditingName(true);
  }

  function handleSaveRename() {
    const trimmed = nameText.trim();
    if (trimmed) renameTrip(trip!.id, trimmed);
    setEditingName(false);
  }

  return (
    <Screen>
      <View style={styles.nav}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
        <View style={styles.navRight}>
          <Pressable style={styles.iconBtn} onPress={() => router.push(`/share?tripId=${trip.id}` as never)}>
            <Ionicons name="share-outline" size={18} color={Colors.textMuted} />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={handleDeleteTrip}>
            <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
          </Pressable>
        </View>
      </View>

      <View>
        <Text style={styles.kicker}>{t("trip.reviewKicker")}</Text>
        {editingName ? (
          <View style={styles.renameRow}>
            <TextInput
              style={styles.renameInput}
              value={nameText}
              onChangeText={setNameText}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveRename}
            />
            <Pressable style={styles.saveBtn} onPress={handleSaveRename}>
              <Text style={styles.saveBtnText}>{t("trip.saveName")}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={handleStartRename} style={styles.titleRow}>
            <Text style={styles.title}>{trip.title}</Text>
            <Ionicons name="pencil-outline" size={15} color={Colors.textMuted} style={styles.pencil} />
          </Pressable>
        )}
        <Text style={styles.subtitle}>
          {new Date(trip.startedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
        </Text>
        {nearbyPrevTrip ? (
          <View style={styles.lastTimeChip}>
            <Ionicons name="time-outline" size={12} color={Colors.amber} />
            <Text style={styles.lastTimeText}>
              {t("trip.lastTimeHere", {
                catches: nearbyPrevTrip.events.filter((e) => e.type === "catch").length,
                contacts: nearbyPrevTrip.events.filter((e) => e.type === "contact").length,
              })}
            </Text>
          </View>
        ) : null}
      </View>

      <TripMap route={trip.route} events={trip.events} height={340} replayTick={replayTick} />
      <Pressable style={styles.replayBtn} onPress={() => setReplayTick((t) => (t ?? 0) + 1)}>
        <Ionicons name="play-outline" size={16} color={Colors.textMuted} />
        <Text style={styles.replayText}>{t("trip.replay")}</Text>
      </Pressable>

      <View style={styles.metrics}>
        <MetricCard label={t("metrics.duration")} value={formatDuration(trip.startedAt, trip.endedAt)} />
        <MetricCard label={t("metrics.distance")} value={formatDistance(trip.distanceMeters)} />
        <MetricCard label={t("metrics.catches")} value={catches} />
        <MetricCard label={t("metrics.contacts")} value={contacts} />
        <MetricCard label={t("metrics.following")} value={following} />
      </View>

      <View style={styles.timeline}>
        <Text style={styles.sectionTitle}>{t("trip.timeline")}</Text>
        {trip.events.map((event, index) => {
          const isLast = index === trip.events.length - 1;
          const typeColor =
            event.type === "catch" ? Colors.catchGreen :
            event.type === "following" ? "#5AA9E6" :
            event.type === "photo" ? "#9B59B6" :
            event.type === "lure" ? "#a78bfa" : "#f4c84f";
          const typeIcon: React.ComponentProps<typeof Ionicons>["name"] =
            event.type === "catch" ? "fish-outline" :
            event.type === "following" ? "eye-outline" :
            event.type === "photo" ? "camera-outline" :
            event.type === "lure" ? "pricetag-outline" : "flash-outline";
          const typeLabel =
            event.type === "catch" ? (event.species ?? t("events.catch")) :
            event.type === "following" ? t("events.following") :
            event.type === "photo" ? t("events.photo") :
            event.type === "lure" ? t("events.lure", { name: event.comment ?? "" }) :
            t("events.contact");
          const timeStr = new Date(event.timestamp).toLocaleTimeString([], {
            hour: "2-digit", minute: "2-digit"
          });
          const catchMeta = event.type === "catch" && event.lengthCm != null
            ? `${event.lengthCm} cm${event.weightKg != null ? ` · ${event.weightKg} kg` : ""}`
            : null;

          return (
            <View key={event.id} style={styles.tlRow}>
              {/* Left spine: icon bubble + connector line */}
              <View style={styles.tlSpine}>
                <View style={[styles.tlBubble, { backgroundColor: typeColor + "22", borderColor: typeColor }]}>
                  <Ionicons name={typeIcon} size={15} color={typeColor} />
                </View>
                {!isLast && <View style={styles.tlConnector} />}
              </View>

              {/* Content — fully tappable */}
              <Pressable
                style={[styles.tlContent, !isLast && styles.tlContentBorder]}
                onPress={() => router.push(`/event/${event.id}`)}
              >
                <View style={styles.tlHeader}>
                  <Text style={styles.tlLabel}>{typeLabel}</Text>
                  <Text style={styles.tlTime}>{timeStr}</Text>
                </View>
                {catchMeta ? <Text style={styles.tlMeta}>{catchMeta}</Text> : null}
                {event.comment ? (
                  <Text style={styles.tlComment} numberOfLines={1}>{event.comment}</Text>
                ) : null}
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={Colors.textMuted}
                  style={styles.tlChevron}
                />
              </Pressable>

              {/* Trash */}
              <Pressable style={styles.removeBtn} onPress={() => handleRemoveEvent(event.id)}>
                <Ionicons name="trash-outline" size={15} color={Colors.textMuted} />
              </Pressable>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  navRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  iconBtn: {
    height: 44,
    width: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.field
  },
  kicker: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 0
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  title: {
    color: Colors.textBright,
    fontSize: 35,
    fontFamily: Fonts.heading,
    letterSpacing: 0,
    flexShrink: 1
  },
  pencil: {
    marginTop: 8
  },
  renameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  renameInput: {
    flex: 1,
    color: Colors.textBright,
    fontSize: 28,
    fontFamily: Fonts.heading,
    letterSpacing: 0,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderStrong,
    paddingVertical: 4
  },
  saveBtn: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: Colors.amber,
    alignItems: "center",
    justifyContent: "center"
  },
  saveBtnText: {
    color: Colors.textOnAmber,
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 0
  },
  subtitle: {
    color: Colors.textMuted,
    marginTop: 4,
    fontSize: 14,
    fontFamily: Fonts.body
  },
  lastTimeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: Colors.field,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  lastTimeText: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodySemibold,
    fontSize: 11,
    letterSpacing: 0,
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9
  },
  // ── Timeline ──
  timeline: {
    borderRadius: 16,
    padding: 16,
    paddingBottom: 4,
    gap: 0,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border
  },
  sectionTitle: {
    color: Colors.textBright,
    fontFamily: Fonts.heading,
    fontSize: 18,
    letterSpacing: 0,
    marginBottom: 14
  },
  tlRow: {
    flexDirection: "row",
    alignItems: "flex-start"
  },
  tlSpine: {
    width: 44,
    alignItems: "center",
    alignSelf: "stretch"
  },
  tlBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center"
  },
  tlConnector: {
    flex: 1,
    width: 1.5,
    backgroundColor: Colors.border,
    marginTop: 4,
    marginBottom: 0
  },
  tlContent: {
    flex: 1,
    paddingBottom: 20,
    paddingRight: 4,
    minHeight: 40
  },
  tlContentBorder: {
    // visual separation handled by connector line, no extra border needed
  },
  tlHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 5
  },
  tlLabel: {
    color: Colors.textBright,
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 0,
    flex: 1
  },
  tlTime: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 13,
    letterSpacing: 0
  },
  tlMeta: {
    color: Colors.amber,
    fontFamily: Fonts.bodySemibold,
    fontSize: 13,
    marginTop: 3,
    letterSpacing: 0
  },
  tlComment: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 13,
    marginTop: 3,
    letterSpacing: 0
  },
  tlChevron: {
    marginTop: 6
  },
  removeBtn: {
    height: 36,
    width: 36,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2
  },
  replayBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 6,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: Colors.field,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: -8,
  },
  replayText: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodySemibold,
    fontSize: 12,
    letterSpacing: 0,
  }
});
