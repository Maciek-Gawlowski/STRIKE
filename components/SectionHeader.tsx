import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

type Props = {
  title: string;
  linkLabel?: string;
  onLinkPress?: () => void;
};

/**
 * Section chrome row: small-caps title + optional right link.
 *
 * The amber bar that used to sit in front of every heading is gone. Amber was
 * doing five jobs at once — primary button, section marker, link, active tab,
 * chart series — and a colour used for everything signals nothing. It now means
 * one thing: the thing you tap.
 */
export function SectionHeader({ title, linkLabel, onLinkPress }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {linkLabel && onLinkPress ? (
        <Pressable hitSlop={8} onPress={onLinkPress}>
          <Text style={styles.link}>{linkLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  title: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  link: {
    color: Colors.amber,
    fontSize: 13,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 0
  }
});
