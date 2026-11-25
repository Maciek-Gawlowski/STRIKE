import { PropsWithChildren, ReactElement, ReactNode } from "react";
import { RefreshControlProps, ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "@/theme/colors";

type ScreenProps = PropsWithChildren<{
  contentStyle?: ViewStyle;
  refreshControl?: ReactElement<RefreshControlProps>;
  /** Rendered above the scrolling content and not scrolled with it (toasts). */
  overlay?: ReactNode;
}>;

export function Screen({ children, contentStyle, refreshControl, overlay }: ScreenProps) {
  return (
    <View style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          // A tap on a button while the keyboard is up used to only close the
          // keyboard, so every "Save" under a text field needed two taps.
          keyboardShouldPersistTaps="handled"
          // Dragging the page down takes the keyboard with it, as in Mail.
          keyboardDismissMode="interactive"
          // Scrolls a focused field clear of the keyboard instead of leaving
          // the comment box on the catch screen hidden behind it.
          automaticallyAdjustKeyboardInsets
        >
          {children}
        </ScrollView>
        {overlay}
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
