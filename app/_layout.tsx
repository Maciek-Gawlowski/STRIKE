import "react-native-gesture-handler";
import {
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_900Black,
  useFonts
} from "@expo-google-fonts/montserrat";
import {
  Raleway_400Regular,
  Raleway_500Medium,
  Raleway_600SemiBold
} from "@expo-google-fonts/raleway";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TripWatcher } from "@/components/TripWatcher";
import { Colors } from "@/theme/colors";

// Keep the native splash up only until the first mount, then drop it.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * How long the splash screen may stay up waiting for the brand fonts.
 *
 * An earlier version waited forever and shipped a build that hung on a blank
 * screen, so the version after it waited not at all — and that turned out to be
 * just as bad in a quieter way. React Native measures a line of text with
 * whatever font is active at that moment. Render before Montserrat has loaded
 * and every heading is measured in the system font, which is narrower: the
 * layout decides the line fits, the brand font swaps in underneath, and the end
 * of the word is simply cut off. "Dine spots forbliver private" became "Dine
 * spots forbliver p" on a first install, and only on a first install, because
 * expo-font caches the files afterwards. Nobody on the team could reproduce it.
 *
 * Two seconds is long enough for a cold start on a slow connection and short
 * enough that a failed font download still lets the angler into the app.
 */
const FONT_WAIT_MS = 2000;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Montserrat_700Bold,
    Montserrat_900Black,
    Montserrat_600SemiBold,
    Montserrat_500Medium,
    Raleway_400Regular,
    Raleway_500Medium,
    Raleway_600SemiBold
  });

  const [waitedLongEnough, setWaitedLongEnough] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setWaitedLongEnough(true), FONT_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  // Fonts ready, fonts failed, or we have waited long enough — in all three
  // cases the app starts. Only the first one is the happy path; the other two
  // trade correct typography for never being stuck, which is the right trade.
  const ready = fontsLoaded || fontError != null || waitedLongEnough;

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  // The native splash is still covering the screen here, so this renders as
  // the splash rather than as a blank app.
  if (!ready) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <TripWatcher />
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
            contentStyle: { backgroundColor: Colors.navy }
          }}
        />
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
