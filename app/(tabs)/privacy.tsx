import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import {
  getBiteMapContribution,
  setBiteMapContribution,
  setOnboardingCompleted
} from "@/database/preferences";
import { useTranslation, type Locale } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

const LANGUAGE_OPTIONS: { value: Locale; labelKey: string }[] = [
  { value: "da", labelKey: "settings.danish" },
  { value: "en", labelKey: "settings.english" }
];

export default function PrivacyScreen() {
  const { t, locale, setLocale } = useTranslation();
  const [biteMap, setBiteMap] = useState(true);

  useEffect(() => {
    getBiteMapContribution().then(setBiteMap);
  }, []);

  const toggleBiteMap = (value: boolean) => {
    setBiteMap(value);
    void setBiteMapContribution(value);
  };

  const replayOnboarding = async () => {
    await setOnboardingCompleted(false);
    router.push("/onboarding");
  };

  return (
    <Screen>
      <Pressable style={styles.back} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={22} color={Colors.text} />
        <Text style={styles.backText}>{t("common.home")}</Text>
      </Pressable>

      <View style={styles.titleBlock}>
        <Text style={styles.kicker}>{t("settings.kicker")}</Text>
        <Text style={styles.title}>{t("settings.title")}</Text>
      </View>

      {/* Language */}
      <Text style={styles.sectionTitle}>{t("settings.language")}</Text>
      <View style={styles.panel}>
        <View style={styles.pillRow}>
          {LANGUAGE_OPTIONS.map((option) => {
            const active = locale === option.value;
            return (
              <Pressable
                key={option.value}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => setLocale(option.value)}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* b) Your data */}
      <Text style={styles.sectionTitle}>{t("settings.yourData")}</Text>
      <View style={styles.panel}>
        <Text style={styles.bodyText}>{t("settings.yourDataBody")}</Text>
      </View>

      {/* c) Bite Map contribution */}
      <Text style={styles.sectionTitle}>{t("settings.biteMap")}</Text>
      <View style={styles.panel}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{t("settings.biteMapToggle")}</Text>
          <Switch
            value={biteMap}
            onValueChange={toggleBiteMap}
            trackColor={{ false: "rgba(217, 218, 213, 0.16)", true: Colors.amber }}
            thumbColor={biteMap ? Colors.textOnAmber : Colors.grey}
            ios_backgroundColor="rgba(217, 218, 213, 0.16)"
          />
        </View>
      </View>

      {/* Onboarding (re-trigger for testing/demo) */}
      <Text style={styles.sectionTitle}>{t("settings.intro")}</Text>
      <View style={styles.panel}>
        <Pressable style={styles.introButton} onPress={replayOnboarding}>
          <Ionicons name="play-circle-outline" size={20} color={Colors.text} />
          <Text style={styles.introButtonText}>{t("settings.showIntro")}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: {
    alignSelf: "flex-start",
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.field
  },
  backText: {
    color: Colors.text,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 0
  },
  titleBlock: {
    gap: 2
  },
  kicker: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 0
  },
  title: {
    color: Colors.textBright,
    fontSize: 35,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  sectionTitle: {
    color: Colors.textBright,
    fontSize: 18,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  panel: {
    borderRadius: 24,
    padding: 16,
    gap: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border
  },
  panelText: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.body
  },
  bodyText: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: Fonts.bodyMedium
  },
  pillRow: {
    flexDirection: "row",
    gap: 8
  },
  pill: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    backgroundColor: Colors.field
  },
  pillActive: {
    backgroundColor: Colors.amber
  },
  pillText: {
    color: Colors.text,
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 0
  },
  pillTextActive: {
    color: Colors.textOnAmber
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  toggleLabel: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: Fonts.bodyMedium,
    flex: 1,
    lineHeight: 20,
    letterSpacing: 0
  },
  introButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  introButtonText: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 0
  }
});
