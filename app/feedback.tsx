import { Ionicons } from "@expo/vector-icons";
import { appBuild, appVersion } from "@/services/appInfo";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "@/components/Screen";
import { getDb } from "@/database/db";
import { queueFeedback } from "@/database/queries";
import { clearLastCrash, getLastCrash, getOrCreateLocalUserId } from "@/database/preferences";
import { sendFeedback } from "@/services/feedback";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

const deviceModel =
  (Platform.constants as Record<string, unknown>)?.Model as string | undefined ??
  Platform.OS;

const uid = () =>
  Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

export default function FeedbackScreen() {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  // A crash the app caught but nobody could report. Offered, not attached
  // silently — it is their message, and it carries a stack trace.
  const [lastCrash, setLastCrash] = useState<{ at: string; message: string } | null>(null);
  const [attachCrash, setAttachCrash] = useState(true);
  useEffect(() => {
    void getLastCrash().then(setLastCrash);
  }, []);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  // Queued means it is on the phone waiting for signal, not with us. Telling
  // someone standing on a beach with no bars that their message "went straight
  // to the team" is a small lie that costs real feedback: they close the app
  // believing it was delivered.
  const [queued, setQueued] = useState(false);

  async function handleSend() {
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setSending(true);

    const localUserId = await getOrCreateLocalUserId();
    const row = {
      id: uid(),
      message:
        lastCrash && attachCrash
          ? `${trimmed}\n\n--- last crash (${lastCrash.at}) ---\n${lastCrash.message}`
          : trimmed,
      appVersion,
      buildNumber: appBuild,
      platform: Platform.OS,
      deviceModel,
      localUserId
    };

    try {
      await sendFeedback(row);
    } catch (error) {
      console.warn(
        `[strike/feedback] send failed: ${error instanceof Error ? error.message : String(error)}`
      );
      // Offline — queue for retry on next launch.
      setQueued(true);
      try {
        const db = await getDb();
        await queueFeedback(db, row);
      } catch {
        // DB failure — feedback is lost, but never crash the screen.
      }
    }

    if (lastCrash && attachCrash) {
      void clearLastCrash();
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
          <Ionicons
            name={queued ? "cloud-offline-outline" : "checkmark-circle"}
            size={56}
            color={queued ? Colors.textMuted : Colors.amber}
          />
          <Text style={styles.thankYouTitle}>{t("feedback.thankYouTitle")}</Text>
          <Text style={styles.thankYouBody}>
            {t(queued ? "feedback.queuedBody" : "feedback.thankYouBody")}
          </Text>
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

      {lastCrash ? (
        <Pressable style={styles.crashRow} onPress={() => setAttachCrash((v) => !v)}>
          <Ionicons
            name={attachCrash ? "checkbox-outline" : "square-outline"}
            size={20}
            color={attachCrash ? Colors.amber : Colors.textMuted}
          />
          <Text style={styles.crashText}>{t("feedback.attachCrash")}</Text>
        </Pressable>
      ) : null}

      <View style={styles.meta}>
        <Text style={styles.metaText}>
          {appVersion} ({appBuild}) · {Platform.OS} · {deviceModel}
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
  crashRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4
  },
  crashText: {
    flex: 1,
    color: Colors.text,
    fontFamily: Fonts.body,
    fontSize: 13
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
