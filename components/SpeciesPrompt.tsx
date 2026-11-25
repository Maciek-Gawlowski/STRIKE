import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { FRESHWATER_SPECIES, SALTWATER_SPECIES } from "@/constants/species";
import { getDb } from "@/database/db";
import { getProfile } from "@/database/lures";
import { useTranslation } from "@/i18n";
import type { StrikeEvent } from "@/store/useStrikeStore";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

type Props = {
  /** The catch waiting for a species, or null when nothing is being asked. */
  event: StrikeEvent | null;
  onPick: (speciesKey: string) => void;
  onDismiss: () => void;
  onMoreDetails: () => void;
  /**
   * Takes the catch back. The prompt opens the instant the catch button is
   * touched, so it sits on top of the undo strip — the mis-tap has to be
   * undoable from here or it cannot be undone at all.
   */
  onUndo?: () => void;
};

/**
 * Asks which fish was just landed, right after the catch is already saved.
 *
 * This lives in its own component because the catch button exists on two
 * screens — Home and the trip map — and the first version of the prompt was
 * written into Home alone. The result shipped in build 38: an angler who
 * logged a catch from the map, which is where anglers actually are during a
 * trip, was never asked for the species and had no way to add it. The same
 * copy-paste drift had already split the map marker colours in two. One
 * prompt, one place, both screens.
 */
export function SpeciesPrompt({ event, onPick, onDismiss, onMoreDetails, onUndo }: Props) {
  const { t } = useTranslation();

  /*
   * The profile asks for fresh or salt water and the angler's species — and
   * until now nothing read either. A freshwater angler was offered the sea
   * list. The prompt now offers the water they fish, with the species they
   * picked in their profile first. Re-read each time it opens, so a profile
   * edited mid-trip applies to the next catch.
   */
  const [profileWater, setProfileWater] = useState<string>("");
  const [preferred, setPreferred] = useState<string[]>([]);
  const visible = event !== null;
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    getDb()
      .then(getProfile)
      .then((profile) => {
        if (cancelled) return;
        setProfileWater(profile.waterType);
        setPreferred(profile.preferredSpecies);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const species = useMemo(() => {
    const list = profileWater === "fresh" ? FRESHWATER_SPECIES : SALTWATER_SPECIES;
    const rank = (key: string) => {
      const i = preferred.indexOf(key);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    // Stable: unpicked species keep their usual order after the picked ones.
    return list
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => rank(a.entry.key) - rank(b.entry.key) || a.index - b.index)
      .map(({ entry }) => entry);
  }, [profileWater, preferred]);

  return (
    <Modal
      visible={event !== null}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      {/* Tapping outside dismisses without a species. The catch is already
          saved, so skipping costs the angler nothing but the detail. */}
      <Pressable style={styles.scrim} onPress={onDismiss}>
        <View style={styles.card}>
          <Text style={styles.title}>{t("catch.whatDidYouCatch")}</Text>

          {/* A grid rather than a list: nine species in one glance beats
              scrolling a column with wet hands, and the tap targets stay
              comfortably past 44 px. */}
          <View style={styles.grid}>
            {species.map((sp) => (
              <Pressable key={sp.key} style={styles.chip} onPress={() => onPick(sp.key)}>
                <Text style={styles.chipText} numberOfLines={1}>
                  {t(sp.labelKey as never)}
                </Text>
              </Pressable>
            ))}
            <Pressable style={styles.chip} onPress={() => onPick("other")}>
              <Text style={styles.chipText} numberOfLines={1}>
                {t("catch.speciesList.other")}
              </Text>
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Pressable hitSlop={8} onPress={onMoreDetails} accessibilityRole="button">
              <Text style={styles.moreText}>{t("catch.moreDetails")}</Text>
            </Pressable>
            <Pressable hitSlop={8} onPress={onDismiss} accessibilityRole="button">
              <Text style={styles.skipText}>{t("common.skip")}</Text>
            </Pressable>
          </View>
          {onUndo ? (
            <Pressable hitSlop={8} onPress={onUndo} style={styles.undoRow} accessibilityRole="button">
              <Text style={styles.undoText}>{t("undo.catchMistake")}</Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
    backgroundColor: "rgba(0, 0, 0, 0.68)"
  },
  card: {
    borderRadius: 16,
    padding: 18,
    gap: 13,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border
  },
  title: {
    color: Colors.textBright,
    fontSize: 26,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    paddingHorizontal: 14,
    minHeight: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.field
  },
  chipText: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: Fonts.bodySemibold
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 4
  },
  moreText: {
    color: Colors.amber,
    fontSize: 14,
    fontFamily: Fonts.bodySemibold
  },
  skipText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontFamily: Fonts.body
  },
  undoRow: {
    alignSelf: "center",
    paddingVertical: 6
  },
  undoText: {
    color: Colors.danger,
    fontSize: 14,
    fontFamily: Fonts.bodySemibold
  }
});
