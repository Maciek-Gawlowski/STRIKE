import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

type Props = {
  title: string;
  linkLabel?: string;
  onLinkPress?: () => void;
};

/** Section chrome row: amber left-bar + small-caps title + optional right link. */
export function SectionHeader({ title, linkLabel, onLinkPress }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.titleGroup}>
        <View style={styles.bar} />
        <Text style={styles.title}>{title}</Text>
      </View>
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
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  bar: {
    width: 2,
    height: 14,
    borderRadius: 1,
    backgroundColor: Colors.amber
  },
  title: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 1.5,
    textTransform: "uppercase"
  },
  link: {
    color: Colors.amber,
    fontSize: 13,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 0
  }
});
