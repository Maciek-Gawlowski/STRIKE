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
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TripWatcher } from "@/components/TripWatcher";
import { Colors } from "@/theme/colors";

// Keep the native splash up only until the first mount, then drop it.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  // Load the brand fonts in the background. CRITICAL: we deliberately ignore the
  // [loaded, error] result and DO NOT gate rendering on it. If the fonts are
  // ready they apply; if not, the app renders with the system-font fallback and
  // swaps in the brand fonts when they finish (expo-font caches them for the next
  // launch). This is the key difference from the previous version that hung on a
  // blank screen — nothing ever waits on fonts.
  useFonts({
    Montserrat_700Bold,
    Montserrat_900Black,
    Montserrat_600SemiBold,
    Montserrat_500Medium,
    Raleway_400Regular,
    Raleway_500Medium,
    Raleway_600SemiBold
  });

  useEffect(() => {
    // Hide the native splash immediately on mount — never wait for fonts.
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

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
