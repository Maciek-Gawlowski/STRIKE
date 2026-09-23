import { PropsWithChildren, ReactElement } from "react";
import { RefreshControlProps, ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "@/theme/colors";

type ScreenProps = PropsWithChildren<{
  contentStyle?: ViewStyle;
  refreshControl?: ReactElement<RefreshControlProps>;
}>;

export function Screen({ children, contentStyle, refreshControl }: ScreenProps) {
  return (
    <View style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    // One flat ground instead of a three-stop gradient. The gradient was
    // subtle enough to look like a rendering artefact on some screens and
    // obvious enough to tint cards differently top and bottom on others.
    backgroundColor: Colors.bgMid
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 22
  }
});
