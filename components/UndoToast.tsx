import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "@/i18n";
import { useStrikeStore } from "@/store/useStrikeStore";
import { useUndo } from "@/store/useUndo";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

/** Long enough to notice a mis-tap with wet hands, short enough to stay out of the way. */
const VISIBLE_MS = 5000;

type Props = {
  /** Distance from the bottom of the screen, e.g. to clear a tab bar. */
  bottomOffset?: number;
  /** Told which event was taken back, so the screen can close a prompt about it. */
  onUndone?: (eventId: string) => void;
};

/**
 * "Contact logged · Undo" strip after a one-tap log.
 *
 * The quick buttons write the moment they are touched — that is the point of
 * them — so a contact logged by a sleeve or a wet thumb used to stay in the
 * trip, and on the shared map, until the angler found it in the timeline
 * after the trip. This gives them five seconds to take it back on the spot.
 */
export function UndoToast({ bottomOffset = 16, onUndone }: Props) {
  const { t } = useTranslation();
  const pending = useUndo((state) => state.pending);
  const clear = useUndo((state) => state.clear);
  const removeActiveEvent = useStrikeStore((state) => state.removeActiveEvent);
  const activeTripId = useStrikeStore((state) => state.activeTrip?.id ?? null);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!pending) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        // Only clear if nothing newer replaced it while fading.
        if (useUndo.getState().pending?.token === pending.token) clear();
      });
    }, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [pending, opacity, clear]);

  // A trip that ends takes its undo with it: the event now belongs to a saved
  // trip and is edited from there.
  useEffect(() => {
    if (!activeTripId) clear();
  }, [activeTripId, clear]);

  if (!pending) return null;

  const what = t(`events.${pending.type}`);

  const undo = () => {
    const { eventId } = pending;
    clear();
    removeActiveEvent(eventId);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onUndone?.(eventId);
  };

  return (
    <Animated.View style={[styles.wrap, { bottom: bottomOffset, opacity }]} pointerEvents="box-none">
      <View style={styles.toast} accessibilityLiveRegion="polite">
        <Ionicons name="checkmark-circle" size={20} color={Colors.amber} />
        <Text style={styles.text} numberOfLines={1}>
          {t("undo.logged", { what })}
        </Text>
        <Pressable
          onPress={undo}
          hitSlop={10}
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel={t("undo.a11y", { what })}
        >
          <Text style={styles.buttonText}>{t("undo.action")}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: 14,
    backgroundColor: Colors.teal,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6
  },
  text: {
    flex: 1,
    color: Colors.text,
    fontFamily: Fonts.bodyMedium,
    fontSize: 15,
    letterSpacing: 0
  },
  button: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonText: {
    color: Colors.amber,
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 0
  }
});
