import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

type Props = {
  title: string;
  linkLabel?: string;
  onLinkPress?: () => void;
};

/** Section title row with an optional amber action link on the right. */
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
    color: Colors.textBright,
    fontSize: 18,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  link: {
    color: Colors.amber,
    fontSize: 13,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 0
  }
});
