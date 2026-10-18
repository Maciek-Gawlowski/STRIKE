import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SALTWATER_SPECIES } from "@/constants/species";
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
export function SpeciesPrompt({ event, onPick, onDismiss, onMoreDetails }: Props) {
  const { t } = useTranslation();

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
            {SALTWATER_SPECIES.map((sp) => (
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
            <Pressable hitSlop={8} onPress={onMoreDetails}>
              <Text style={styles.moreText}>{t("catch.moreDetails")}</Text>
            </Pressable>
            <Pressable hitSlop={8} onPress={onDismiss}>
              <Text style={styles.skipText}>{t("common.skip")}</Text>
            </Pressable>
          </View>
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
  }
});
