import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import { I18n } from "i18n-js";
import { create } from "zustand";
import da from "./da.json";
import en from "./en.json";

/**
 * i18n for STRIKE.
 *
 * Default language is Danish (the target market); English is the fallback.
 * The active locale is held in a tiny Zustand store so that `useTranslation()`
 * consumers re-render the moment the language changes — every screen updates
 * live. The choice is persisted to AsyncStorage.
 */

export type Locale = "da" | "en";

const STORAGE_KEY = "strike.locale";

export const i18n = new I18n({ da, en });
i18n.enableFallback = true;
i18n.defaultLocale = "en";

function detectDeviceLocale(): Locale {
  try {
    const code = Localization.getLocales()[0]?.languageCode;
    // English devices get English; everything else defaults to Danish.
    return code === "en" ? "en" : "da";
  } catch {
    return "da";
  }
}

i18n.locale = detectDeviceLocale();

type I18nState = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

export const useI18nStore = create<I18nState>((set) => ({
  locale: i18n.locale as Locale,
  setLocale: (locale) => {
    i18n.locale = locale;
    set({ locale });
    void AsyncStorage.setItem(STORAGE_KEY, locale).catch(() => undefined);
  }
}));

// Restore the persisted language (overrides the device default) on launch.
void (async () => {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved === "da" || saved === "en") {
      i18n.locale = saved;
      useI18nStore.setState({ locale: saved });
    }
  } catch {
    // ignore — fall back to the device/default locale
  }
})();

export type TranslateOptions = Record<string, unknown>;

/**
 * Hook returning a translation function bound to the active locale. Components
 * that call this re-render automatically when the language changes.
 */
export function useTranslation() {
  const locale = useI18nStore((state) => state.locale);
  const setLocale = useI18nStore((state) => state.setLocale);
  const t = (key: string, options?: TranslateOptions) => i18n.t(key, { locale, ...options });
  return { t, locale, setLocale };
}
