import { LinearGradient } from "expo-linear-gradient";
import { PropsWithChildren, ReactElement } from "react";
import { RefreshControlProps, ScrollView, StyleSheet, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "@/theme/colors";

type ScreenProps = PropsWithChildren<{
  contentStyle?: ViewStyle;
  refreshControl?: ReactElement<RefreshControlProps>;
}>;

export function Screen({ children, contentStyle, refreshControl }: ScreenProps) {
  return (
    <LinearGradient colors={[Colors.bgTop, Colors.bgMid, Colors.bgBottom]} style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 36,
    gap: 18
  }
});
