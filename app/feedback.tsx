import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "@/components/Screen";
import { getDb } from "@/database/db";
import { queueFeedback } from "@/database/queries";
import { getOrCreateLocalUserId } from "@/database/preferences";
import { sendFeedback } from "@/services/feedback";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

const appVersion = Constants.expoConfig?.version ?? "?";
const buildNumber =
  (Constants.expoConfig?.ios?.buildNumber ??
    String(Constants.expoConfig?.android?.versionCode ?? "")) ||
  "?";
const deviceModel =
  (Platform.constants as Record<string, unknown>)?.Model as string | undefined ??
  Platform.OS;

const uid = () =>
  Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

export default function FeedbackScreen() {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSend() {
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setSending(true);

    const localUserId = await getOrCreateLocalUserId();
    const row = {
      id: uid(),
      message: trimmed,
      appVersion,
      buildNumber,
      platform: Platform.OS,
      deviceModel,
      localUserId
    };

    try {
      await sendFeedback(row);
    } catch {
      // Offline — queue for retry on next launch.
      try {
        const db = await getDb();
        await queueFeedback(db, row);
      } catch {
        // DB failure — feedback is lost, but never crash the screen.
      }
    }

    setSending(false);
    setDone(true);
  }

  if (done) {
    return (
      <Screen>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
        <View style={styles.thankYou}>
          <Ionicons name="checkmark-circle" size={56} color={Colors.amber} />
          <Text style={styles.thankYouTitle}>{t("feedback.thankYouTitle")}</Text>
          <Text style={styles.thankYouBody}>{t("feedback.thankYouBody")}</Text>
          <Pressable style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>{t("feedback.done")}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Pressable style={styles.back} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={22} color={Colors.text} />
        <Text style={styles.backText}>{t("common.back")}</Text>
      </Pressable>

      <View>
        <Text style={styles.kicker}>{t("feedback.kicker")}</Text>
        <Text style={styles.title}>{t("feedback.title")}</Text>
      </View>

      <TextInput
        style={styles.input}
        value={message}
        onChangeText={setMessage}
        placeholder={t("feedback.placeholder")}
        placeholderTextColor={Colors.textMuted}
        multiline
        textAlignVertical="top"
        autoFocus
      />

      <View style={styles.meta}>
        <Text style={styles.metaText}>
          {appVersion} ({buildNumber}) · {Platform.OS} · {deviceModel}
        </Text>
      </View>

      <Pressable
        style={[styles.sendBtn, (!message.trim() || sending) && styles.sendBtnDisabled]}
        onPress={() => void handleSend()}
        disabled={!message.trim() || sending}
      >
        {sending ? (
          <ActivityIndicator color={Colors.textOnAmber} />
        ) : (
          <>
            <Ionicons name="send-outline" size={18} color={Colors.textOnAmber} />
            <Text style={styles.sendBtnText}>{t("feedback.send")}</Text>
          </>
        )}
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: {
    alignSelf: "flex-start",
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.field
  },
  backText: { color: Colors.text, fontFamily: Fonts.bodyBold, letterSpacing: 0 },
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
  input: {
    flex: 1,
    minHeight: 160,
    maxHeight: 320,
    borderRadius: 16,
    padding: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textBright,
    fontFamily: Fonts.body,
    fontSize: 16,
    letterSpacing: 0,
    lineHeight: 24
  },
  meta: {
    alignItems: "center"
  },
  metaText: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 12,
    letterSpacing: 0
  },
  sendBtn: {
    height: 62,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: Colors.amber
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: {
    color: Colors.textOnAmber,
    fontFamily: Fonts.heading,
    fontSize: 17,
    letterSpacing: 0
  },
  thankYou: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 24
  },
  thankYouTitle: {
    color: Colors.textBright,
    fontFamily: Fonts.heading,
    fontSize: 32,
    letterSpacing: 0,
    textAlign: "center"
  },
  thankYouBody: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0,
    textAlign: "center"
  },
  doneBtn: {
    marginTop: 8,
    height: 52,
    paddingHorizontal: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.amber
  },
  doneBtnText: {
    color: Colors.textOnAmber,
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 0
  }
});
