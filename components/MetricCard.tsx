import { StyleSheet, Text, View } from "react-native";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

type MetricCardProps = {
  label: string;
  value: string | number;
};

export function MetricCard({ label, value }: MetricCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: "30%",
    borderRadius: 16,
    padding: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border
  },
  value: {
    color: Colors.textBright,
    fontSize: 20,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  label: {
    color: Colors.text,
    fontSize: 12,
    fontFamily: Fonts.bodySemibold,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0
  }
});
