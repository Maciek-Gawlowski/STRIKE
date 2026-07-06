import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { setOnboardingCompleted } from "@/database/preferences";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

type Slide = {
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: string;
  descKey: string;
};

const SLIDES: Slide[] = [
  { icon: "navigate-circle-outline", titleKey: "onboarding.slide1Title", descKey: "onboarding.slide1Desc" },
  { icon: "flash-outline", titleKey: "onboarding.slide2Title", descKey: "onboarding.slide2Desc" },
  { icon: "map-outline", titleKey: "onboarding.slide3Title", descKey: "onboarding.slide3Desc" }
];

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const complete = async () => {
    await setOnboardingCompleted(true);
    router.replace("/");
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== index) {
      setIndex(next);
    }
  };

  const handleNext = () => {
    if (index < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: width * (index + 1), animated: true });
      setIndex(index + 1);
    } else {
      void complete();
    }
  };

  const isLast = index === SLIDES.length - 1;

  return (
    <LinearGradient
      colors={["#0D1B2A", "#1B3A4B", "#12283A"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.fill}
    >
      <SafeAreaView style={styles.fill}>
        <View style={styles.topBar}>
          <Pressable hitSlop={12} onPress={() => void complete()}>
            <Text style={styles.skip}>{t("onboarding.skip")}</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          style={styles.fill}
        >
          {SLIDES.map((slide) => (
            <View key={slide.titleKey} style={[styles.slide, { width }]}>
              <View style={styles.iconCircle}>
                <Ionicons name={slide.icon} size={68} color={Colors.amber} />
              </View>
              <Text style={styles.title}>{t(slide.titleKey)}</Text>
              <Text style={styles.desc}>{t(slide.descKey)}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {SLIDES.map((slide, i) => (
              <View key={slide.titleKey} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>

          <Pressable style={styles.button} onPress={handleNext}>
            <Text style={styles.buttonText}>
              {isLast ? t("onboarding.getStarted") : t("onboarding.next")}
            </Text>
            <Ionicons
              name={isLast ? "checkmark-circle-outline" : "arrow-forward"}
              size={22}
              color={Colors.textOnAmber}
            />
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 22,
    paddingTop: 8,
    minHeight: 44
  },
  skip: {
    color: Colors.textMuted,
    fontFamily: Fonts.bodySemi,
    fontSize: 16,
    letterSpacing: 0
  },
  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    gap: 26
  },
  iconCircle: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.amberSoft,
    borderWidth: 1,
    borderColor: "rgba(255, 186, 0, 0.25)"
  },
  title: {
    color: Colors.textBright,
    fontFamily: Fonts.headingBlack,
    fontSize: 30,
    textAlign: "center",
    letterSpacing: 0
  },
  desc: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 17,
    lineHeight: 25,
    textAlign: "center"
  },
  footer: {
    paddingHorizontal: 22,
    paddingBottom: 24,
    gap: 22
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(217, 218, 213, 0.25)"
  },
  dotActive: {
    width: 22,
    backgroundColor: Colors.amber
  },
  button: {
    minHeight: 60,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.amber
  },
  buttonText: {
    color: Colors.textOnAmber,
    fontFamily: Fonts.heading,
    fontSize: 17,
    letterSpacing: 0
  }
});
