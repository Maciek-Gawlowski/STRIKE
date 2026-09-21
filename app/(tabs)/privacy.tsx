import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { deleteSpot, getSpots, type Spot } from "@/database/spots";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Screen } from "@/components/Screen";
import { getDb } from "@/database/db";
import {
  deleteLure,
  getLures,
  getProfile,
  saveProfile,
  setFavouriteLure,
  upsertLure,
  type GearItem,
  type Lure,
} from "@/database/lures";
import { setOnboardingCompleted } from "@/database/preferences";
import { useTranslation, type Locale } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";
import {
  LURE_COLOUR_KEYS,
  LureColourDot,
  type LureColourKey,
} from "@/components/LureColourDot";

const uid = () => Math.random().toString(36).slice(2, 10);

const LANGUAGE_OPTIONS: { value: Locale; labelKey: string }[] = [
  { value: "da", labelKey: "settings.danish" },
  { value: "en", labelKey: "settings.english" },
];

const FISHING_METHOD_KEYS = ["spin", "flue", "medefiskeri", "andet"] as const;
const FISHING_LOCATION_KEYS = ["kyst", "aa", "soe", "putOgTake"] as const;

import { FRESHWATER_SPECIES, SALTWATER_SPECIES } from "@/constants/species";

type LureFormState = {
  name: string;
  colour: LureColourKey | null;
  colourSecondary: LureColourKey | null;
};
const emptyLureForm = (): LureFormState => ({ name: "", colour: null, colourSecondary: null });

function ColourPicker({
  label, selected, onSelect, t,
}: {
  label: string;
  selected: LureColourKey | null;
  onSelect: (key: LureColourKey | null) => void;
  t: (key: string) => string;
}) {
  return (
    <View style={pickerStyles.root}>
      <Text style={pickerStyles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={pickerStyles.strip}>
        {LURE_COLOUR_KEYS.map((key) => {
          const isSelected = selected === key;
          return (
            <Pressable
              key={key}
              hitSlop={6}
              onPress={() => onSelect(isSelected ? null : key)}
              style={[pickerStyles.dot, { backgroundColor: Colors[key] }, isSelected && pickerStyles.dotSelected]}
            />
          );
        })}
      </ScrollView>
      {selected ? <Text style={pickerStyles.name}>{t(`profile.colours.${selected}`)}</Text> : null}
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  root: { gap: 6 },
  label: { color: Colors.textMuted, fontSize: 11, fontFamily: Fonts.bodySemibold, letterSpacing: 0, textTransform: "uppercase" },
  strip: { flexDirection: "row", gap: 10, paddingVertical: 2 },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  dotSelected: { borderWidth: 2.5, borderColor: Colors.textBright },
  name: { color: Colors.textMuted, fontFamily: Fonts.body, fontSize: 12, letterSpacing: 0 },
});

export default function ProfileScreen() {
  const { t, locale, setLocale } = useTranslation();

  const [displayName, setDisplayName] = useState("");
  const [fishingMethods, setFishingMethods] = useState<string[]>([]);
  const [waterType, setWaterType] = useState<"fresh" | "salt" | "">("");
  const [speciesKeys, setSpeciesKeys] = useState<string[]>([]);
  const [andenActive, setAndenActive] = useState(false);
  const [customSpeciesText, setCustomSpeciesText] = useState("");
  const [fishingLocations, setFishingLocations] = useState<string[]>([]);
  const [profilePhotoUri, setProfilePhotoUri] = useState("");
  const [gear, setGear] = useState<GearItem[]>([]);
  const [gearInput, setGearInput] = useState("");
  const [lures, setLures] = useState<Lure[]>([]);
  const [langChanged, setLangChanged] = useState(false);
  const [addForm, setAddForm] = useState<LureFormState>(emptyLureForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<LureFormState>(emptyLureForm());
  const [spots, setSpots] = useState<Spot[]>([]);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    Promise.all([getDb().then(getProfile), getDb().then(getLures), getDb().then(getSpots)])
      .then(([profile, lureList, spotList]) => {
        if (!mountedRef.current) return;
        setDisplayName(profile.displayName);
        setFishingMethods(profile.fishingMethods);
        setWaterType((profile.waterType as "fresh" | "salt" | "") || "");
        const andenEntry = profile.preferredSpecies.find((s) => s.startsWith("anden"));
        setSpeciesKeys(profile.preferredSpecies.filter((s) => !s.startsWith("anden")));
        setAndenActive(Boolean(andenEntry));
        setCustomSpeciesText(andenEntry?.startsWith("anden:") ? andenEntry.slice(6) : "");
        setFishingLocations(profile.fishingLocations);
        setProfilePhotoUri(profile.photoUri);
        setGear(profile.gear);
        setLures(lureList);
        setSpots(spotList);
      })
      .catch(() => null);
    return () => { mountedRef.current = false; };
  }, []);

  const handleSaveProfile = async () => {
    const speciesForSave = [...speciesKeys];
    if (andenActive) speciesForSave.push(customSpeciesText.trim() ? `anden:${customSpeciesText.trim()}` : "anden:");
    const db = await getDb();
    await saveProfile(db, {
      displayName,
      fishingMethods,
      preferredSpecies: speciesForSave,
      waterType,
      fishingLocations,
      photoUri: profilePhotoUri,
      gear,
    });
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ── Profile photo ──────────────────────────────────────────────────────────
  const applyPhotoResult = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const tempUri = result.assets[0].uri;
    try {
      const dest = `${FileSystem.documentDirectory}strike_profile_${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: tempUri, to: dest });
      setProfilePhotoUri(dest);
    } catch {
      setProfilePhotoUri(tempUri);
    }
  };

  const handlePickPhoto = () => {
    Alert.alert(t("profile.sectionPhoto"), undefined, [
      {
        text: t("catch.takePhoto"), onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (perm.status !== "granted") return;
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.82 });
          await applyPhotoResult(result);
        }
      },
      {
        text: t("catch.chooseLibrary"), onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.82 });
          await applyPhotoResult(result);
        }
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  };

  // ── Species ────────────────────────────────────────────────────────────────
  const toggleSpecies = (key: string) => {
    setSpeciesKeys((prev) => prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]);
  };

  const toggleAnden = () => {
    if (andenActive) { setAndenActive(false); setCustomSpeciesText(""); }
    else setAndenActive(true);
  };

  // ── Fishing methods (multi-select) ─────────────────────────────────────────
  const toggleMethod = (key: string) => {
    setFishingMethods((prev) => prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]);
  };

  // ── Fishing locations (multi-select) ──────────────────────────────────────
  const toggleLocation = (key: string) => {
    setFishingLocations((prev) => prev.includes(key) ? prev.filter((l) => l !== key) : [...prev, key]);
  };

  // ── Gear ───────────────────────────────────────────────────────────────────
  const addGear = () => {
    const name = gearInput.trim();
    if (!name) return;
    setGear((prev) => [...prev, { id: uid(), name }]);
    setGearInput("");
  };

  const removeGear = (id: string) => setGear((prev) => prev.filter((g) => g.id !== id));

  // ── Lure CRUD ──────────────────────────────────────────────────────────────
  const addLure = async () => {
    const name = addForm.name.trim();
    if (!name) return;
    const lure: Lure = { id: uid(), name, isFavourite: false, createdAt: new Date().toISOString(), colour: addForm.colour ?? undefined, colourSecondary: addForm.colourSecondary ?? undefined };
    const db = await getDb();
    await upsertLure(db, lure);
    setLures((prev) => [...prev, lure]);
    setAddForm(emptyLureForm());
  };

  const openEdit = (lure: Lure) => {
    setEditingId(lure.id);
    setEditForm({ name: lure.name, colour: (lure.colour as LureColourKey) ?? null, colourSecondary: (lure.colourSecondary as LureColourKey) ?? null });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const existing = lures.find((l) => l.id === editingId);
    if (!existing) return;
    const updated: Lure = { ...existing, name: editForm.name.trim() || existing.name, colour: editForm.colour ?? undefined, colourSecondary: editForm.colourSecondary ?? undefined };
    const db = await getDb();
    await upsertLure(db, updated);
    setLures((prev) => prev.map((l) => l.id === editingId ? updated : l));
    setEditingId(null);
    setEditForm(emptyLureForm());
    await Haptics.selectionAsync();
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(emptyLureForm()); };

  const removeLure = async (id: string) => {
    const db = await getDb();
    await deleteLure(db, id);
    setLures((prev) => prev.filter((l) => l.id !== id));
    if (editingId === id) cancelEdit();
  };

  const toggleFavourite = async (id: string) => {
    const lure = lures.find((l) => l.id === id);
    if (!lure) return;
    const newFavId = lure.isFavourite ? null : id;
    const db = await getDb();
    await setFavouriteLure(db, newFavId);
    setLures((prev) => prev.map((l) => ({ ...l, isFavourite: l.id === newFavId })));
  };

  const removeSpot = async (id: string) => {
    const db = await getDb();
    await deleteSpot(db, id);
    setSpots((prev) => prev.filter((s) => s.id !== id));
  };

  const replayOnboarding = async () => {
    await setOnboardingCompleted(false);
    router.push("/onboarding");
  };

  const activeSpeciesList = waterType === "fresh" ? FRESHWATER_SPECIES : waterType === "salt" ? SALTWATER_SPECIES : [];

  return (
    <Screen>
      <View style={styles.titleBlock}>
        <Text style={styles.kicker}>{t("profile.kicker")}</Text>
        <Text style={styles.title}>{t("profile.title")}</Text>
      </View>

      {/* ── Profilbillede ── */}
      <Text style={styles.sectionTitle}>{t("profile.sectionPhoto")}</Text>
      <View style={styles.panel}>
        <Pressable style={styles.photoSection} onPress={handlePickPhoto}>
          {profilePhotoUri ? (
            <Image source={{ uri: profilePhotoUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person-outline" size={36} color={Colors.textMuted} />
            </View>
          )}
          <Text style={styles.photoLabel}>
            {profilePhotoUri ? t("profile.changePhoto") : t("profile.addPhoto")}
          </Text>
        </Pressable>
      </View>

      {/* ── Navn ── */}
      <Text style={styles.sectionTitle}>{t("profile.sectionName")}</Text>
      <View style={styles.panel}>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder={t("profile.namePlaceholder")}
          placeholderTextColor="#647a72"
          style={styles.nameInput}
        />
      </View>

      {/* ── Fiskemetoder (multi-select) ── */}
      <Text style={styles.sectionTitle}>{t("profile.sectionFishingType")}</Text>
      <View style={styles.panel}>
        <View style={styles.pillWrap}>
          {FISHING_METHOD_KEYS.map((key) => {
            const active = fishingMethods.includes(key);
            return (
              <Pressable key={key} style={[styles.pillSpecies, active && styles.pillActive]} onPress={() => toggleMethod(key)}>
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{t(`profile.fishingTypes.${key}`)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Vandtype ── */}
      <Text style={styles.sectionTitle}>{t("profile.sectionWaterType")}</Text>
      <View style={styles.panel}>
        <View style={styles.pillRow}>
          {(["fresh", "salt"] as const).map((type) => {
            const active = waterType === type;
            return (
              <Pressable key={type} style={[styles.pill, active && styles.pillActive]} onPress={() => setWaterType(active ? "" : type)}>
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {type === "fresh" ? t("profile.waterTypeFresh") : t("profile.waterTypeSalt")}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Foretrukne arter — only shown when water type is set ── */}
      {!waterType ? (
        <Text style={styles.hintText}>{t("profile.waterTypeHint")}</Text>
      ) : null}
      {waterType ? (
        <>
          <Text style={styles.sectionTitle}>{t("profile.sectionSpecies")}</Text>
          <View style={styles.panel}>
            <View style={styles.pillWrap}>
              {activeSpeciesList.map((sp) => {
                const active = speciesKeys.includes(sp.key);
                return (
                  <Pressable key={sp.key} style={[styles.pillSpecies, active && styles.pillActive]} onPress={() => toggleSpecies(sp.key)}>
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>{t(sp.labelKey as never)}</Text>
                  </Pressable>
                );
              })}
              <Pressable style={[styles.pillSpecies, andenActive && styles.pillActive]} onPress={toggleAnden}>
                <Text style={[styles.pillText, andenActive && styles.pillTextActive]}>{t("profile.speciesOther")}</Text>
              </Pressable>
            </View>
            {andenActive ? (
              <TextInput
                value={customSpeciesText}
                onChangeText={setCustomSpeciesText}
                placeholder={t("profile.speciesCustomPlaceholder")}
                placeholderTextColor="#647a72"
                style={styles.textField}
                autoFocus
              />
            ) : null}
          </View>
        </>
      ) : null}

      {/* ── Fiskested (multi-select) ── */}
      <Text style={styles.sectionTitle}>{t("profile.sectionFishingLocation")}</Text>
      <View style={styles.panel}>
        <View style={styles.pillWrap}>
          {FISHING_LOCATION_KEYS.map((key) => {
            const active = fishingLocations.includes(key);
            return (
              <Pressable key={key} style={[styles.pillSpecies, active && styles.pillActive]} onPress={() => toggleLocation(key)}>
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{t(`profile.fishingLocations.${key}`)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Grej ── */}
      <Text style={styles.sectionTitle}>{t("profile.sectionGear")}</Text>
      <View style={styles.panel}>
        {gear.length === 0 ? (
          <Text style={styles.emptyText}>{t("profile.noGear")}</Text>
        ) : (
          gear.map((item) => (
            <View key={item.id} style={styles.lureRow}>
              <Ionicons name="construct-outline" size={16} color={Colors.textMuted} />
              <Text style={styles.lureName}>{item.name}</Text>
              <Pressable hitSlop={8} onPress={() => removeGear(item.id)}>
                <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
              </Pressable>
            </View>
          ))
        )}
        <View style={[styles.addLureRow, gear.length > 0 && styles.addLureRowBordered]}>
          <TextInput
            value={gearInput}
            onChangeText={setGearInput}
            placeholder={t("profile.gearPlaceholder")}
            placeholderTextColor="#647a72"
            style={styles.addLureInput}
            onSubmitEditing={addGear}
            returnKeyType="done"
          />
          <Pressable style={[styles.addLureBtn, !gearInput.trim() && styles.addLureBtnDisabled]} onPress={addGear} disabled={!gearInput.trim()}>
            <Text style={styles.addLureBtnText}>{t("profile.addGear")}</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Mine agn ── */}
      <Text style={styles.sectionTitle}>{t("profile.sectionLures")}</Text>
      <View style={styles.panel}>
        {lures.length === 0 ? (
          <Text style={styles.emptyText}>{t("profile.noLures")}</Text>
        ) : (
          lures.map((lure) => {
            const isEditing = editingId === lure.id;
            if (isEditing) {
              return (
                <View key={lure.id} style={styles.editBlock}>
                  <TextInput value={editForm.name} onChangeText={(v) => setEditForm((f) => ({ ...f, name: v }))} style={styles.addLureInput} placeholderTextColor="#647a72" autoFocus />
                  <ColourPicker label={t("profile.colourPrimary")} selected={editForm.colour} onSelect={(k) => setEditForm((f) => ({ ...f, colour: k }))} t={t} />
                  <ColourPicker label={t("profile.colourSecondary")} selected={editForm.colourSecondary} onSelect={(k) => setEditForm((f) => ({ ...f, colourSecondary: k }))} t={t} />
                  <View style={styles.editActions}>
                    <Pressable style={styles.editSaveBtn} onPress={() => void saveEdit()}>
                      <Text style={styles.editSaveBtnText}>{t("profile.saveLure")}</Text>
                    </Pressable>
                    <Pressable hitSlop={8} onPress={cancelEdit}>
                      <Text style={styles.editCancelText}>{t("common.cancel")}</Text>
                    </Pressable>
                    <Pressable hitSlop={8} onPress={() => void removeLure(lure.id)}>
                      <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                    </Pressable>
                  </View>
                </View>
              );
            }
            return (
              <Pressable key={lure.id} style={styles.lureRow} onPress={() => openEdit(lure)}>
                <Pressable hitSlop={8} onPress={() => void toggleFavourite(lure.id)}>
                  <Ionicons name={lure.isFavourite ? "star" : "star-outline"} size={20} color={lure.isFavourite ? Colors.amber : Colors.textMuted} />
                </Pressable>
                <LureColourDot colourKey={lure.colour} colourSecondaryKey={lure.colourSecondary} size={14} />
                <Text style={styles.lureName}>{lure.name}</Text>
                <Ionicons name="pencil-outline" size={16} color={Colors.textMuted} />
              </Pressable>
            );
          })
        )}
        <View style={[styles.addLureRow, lures.length > 0 && styles.addLureRowBordered]}>
          <TextInput value={addForm.name} onChangeText={(v) => setAddForm((f) => ({ ...f, name: v }))} placeholder={t("profile.lurePlaceholder")} placeholderTextColor="#647a72" style={styles.addLureInput} onSubmitEditing={() => void addLure()} returnKeyType="done" />
          <Pressable style={[styles.addLureBtn, !addForm.name.trim() && styles.addLureBtnDisabled]} onPress={() => void addLure()} disabled={!addForm.name.trim()}>
            <Text style={styles.addLureBtnText}>{t("profile.addLure")}</Text>
          </Pressable>
        </View>
        <ColourPicker label={t("profile.colourPrimary")} selected={addForm.colour} onSelect={(k) => setAddForm((f) => ({ ...f, colour: k }))} t={t} />
        <ColourPicker label={t("profile.colourSecondary")} selected={addForm.colourSecondary} onSelect={(k) => setAddForm((f) => ({ ...f, colourSecondary: k }))} t={t} />
      </View>

      {/* ── Mine spots ── */}
      <Text style={styles.sectionTitle}>{t("profile.sectionSpots")}</Text>
      <View style={styles.panel}>
        {spots.length === 0 ? (
          <Text style={styles.emptyText}>{t("spots.noSpots")}</Text>
        ) : (
          spots.map((spot) => (
            <Pressable key={spot.id} style={styles.spotRow} onPress={() => router.push({ pathname: "/(tabs)/bitemap", params: { spotLat: String(spot.lat), spotLng: String(spot.lng) } })}>
              <Ionicons name="location-outline" size={18} color={Colors.amber} />
              <View style={styles.spotRowText}>
                <Text style={styles.spotRowName}>{spot.name}</Text>
                {spot.note ? <Text style={styles.spotRowNote} numberOfLines={1}>{spot.note}</Text> : null}
              </View>
              <Pressable hitSlop={10} onPress={() => void removeSpot(spot.id)}>
                <Ionicons name="trash-outline" size={17} color={Colors.textMuted} />
              </Pressable>
            </Pressable>
          ))
        )}
        <Text style={styles.spotPrivacyNote}>{t("spots.privateNote")}</Text>
      </View>

      {/* Save profile */}
      <Pressable style={styles.saveBtn} onPress={() => void handleSaveProfile()}>
        <Ionicons name="checkmark-circle-outline" size={22} color={Colors.textOnAmber} />
        <Text style={styles.saveBtnText}>{t("profile.save")}</Text>
      </Pressable>

      {/* ── Indstillinger ── */}
      <View style={styles.divider} />
      <Text style={styles.sectionTitle}>{t("profile.sectionSettings")}</Text>

      <Text style={styles.subSectionTitle}>{t("settings.language")}</Text>
      <View style={styles.panel}>
        <View style={styles.pillRow}>
          {LANGUAGE_OPTIONS.map((option) => {
            const active = locale === option.value;
            return (
              <Pressable key={option.value} style={[styles.pill, active && styles.pillActive]} onPress={() => { if (!active) { setLocale(option.value); setLangChanged(true); setTimeout(() => setLangChanged(false), 2500); } }}>
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{t(option.labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>
        {langChanged ? (
          <View style={styles.langConfirm}>
            <Ionicons name="checkmark-circle" size={14} color={Colors.amber} />
            <Text style={styles.langConfirmText}>{t("settings.languageSaved")}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.subSectionTitle}>{t("settings.biteMap")}</Text>
      <View style={styles.panel}>
        <Text style={styles.biteMapInfo}>{t("settings.biteMapInfo")}</Text>
      </View>

      <Text style={styles.subSectionTitle}>{t("settings.intro")}</Text>
      <View style={styles.panel}>
        <Pressable style={styles.introButton} onPress={() => void replayOnboarding()}>
          <Ionicons name="play-circle-outline" size={20} color={Colors.text} />
          <Text style={styles.introButtonText}>{t("settings.showIntro")}</Text>
        </Pressable>
      </View>

      <Text style={styles.subSectionTitle}>{t("feedback.kicker")}</Text>
      <View style={styles.panel}>
        <Pressable style={styles.introButton} onPress={() => router.push("/feedback")}>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={Colors.text} />
          <Text style={styles.introButtonText}>{t("feedback.entryLabel")}</Text>
        </Pressable>
      </View>

      <View style={styles.aboutBlock}>
        <Text style={styles.aboutWordmark}>STRIKE</Text>
        <Text style={styles.aboutVersion}>
          {t("settings.version")} {Constants.expoConfig?.version ?? "—"}
          {"  ·  "}
          {t("settings.build")} {(Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode ?? "—").toString()}
        </Text>
        <Text style={styles.aboutTagline}>{t("home.tagline")}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: "flex-start", height: 48, paddingHorizontal: 14, borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.field },
  backText: { color: Colors.text, fontFamily: Fonts.bodyBold, letterSpacing: 0 },
  titleBlock: { gap: 2 },
  kicker: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.bodySemibold, letterSpacing: 0 },
  title: { color: Colors.textBright, fontSize: 35, fontFamily: Fonts.heading, letterSpacing: 0 },
  sectionTitle: { color: Colors.textBright, fontSize: 18, fontFamily: Fonts.heading, letterSpacing: 0 },
  hintText: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.body, letterSpacing: 0, marginTop: 2, marginBottom: 4 },
  subSectionTitle: { color: Colors.textMuted, fontSize: 12, fontFamily: Fonts.bodySemibold, letterSpacing: 0, textTransform: "uppercase", marginTop: 4 },
  panel: { borderRadius: 16, padding: 16, gap: 12, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },

  photoSection: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarPlaceholder: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.field, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  photoLabel: { color: Colors.text, fontFamily: Fonts.bodySemibold, fontSize: 14, letterSpacing: 0 },

  nameInput: { color: Colors.textBright, fontFamily: Fonts.bodyBold, fontSize: 16, letterSpacing: 0, height: 44 },
  pillRow: { flexDirection: "row", gap: 8 },
  pillWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { flex: 1, minHeight: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, backgroundColor: Colors.field },
  pillSpecies: { minHeight: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, backgroundColor: Colors.field },
  pillActive: { backgroundColor: Colors.amber },
  pillText: { color: Colors.text, fontFamily: Fonts.bodyBold, fontSize: 13, letterSpacing: 0, textAlign: "center" },
  pillTextActive: { color: Colors.textOnAmber },
  textField: { height: 46, borderRadius: 14, paddingHorizontal: 14, backgroundColor: Colors.field, color: Colors.textBright, fontFamily: Fonts.body, fontSize: 15, letterSpacing: 0 },
  emptyText: { color: Colors.textMuted, fontFamily: Fonts.body, fontSize: 14, letterSpacing: 0 },
  lureRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  lureName: { flex: 1, color: Colors.textBright, fontFamily: Fonts.bodyMedium, fontSize: 15, letterSpacing: 0 },
  editBlock: { gap: 10, paddingBottom: 4 },
  editActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  editSaveBtn: { flex: 1, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.amber },
  editSaveBtnText: { color: Colors.textOnAmber, fontFamily: Fonts.bodyBold, fontSize: 14, letterSpacing: 0 },
  editCancelText: { color: Colors.textMuted, fontFamily: Fonts.body, fontSize: 14, letterSpacing: 0 },
  addLureRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  addLureRowBordered: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
  addLureInput: { flex: 1, height: 46, borderRadius: 14, paddingHorizontal: 14, backgroundColor: Colors.field, color: Colors.textBright, fontFamily: Fonts.body, fontSize: 15, letterSpacing: 0 },
  addLureBtn: { height: 46, paddingHorizontal: 18, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: Colors.amber },
  addLureBtnDisabled: { opacity: 0.4 },
  addLureBtnText: { color: Colors.textOnAmber, fontFamily: Fonts.bodyBold, fontSize: 14, letterSpacing: 0 },
  saveBtn: { height: 62, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: Colors.amber },
  saveBtnText: { color: Colors.textOnAmber, fontFamily: Fonts.heading, fontSize: 17, letterSpacing: 0 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },
  biteMapInfo: { color: Colors.textMuted, fontSize: 14, fontFamily: Fonts.body, lineHeight: 20, letterSpacing: 0 },
  introButton: { flexDirection: "row", alignItems: "center", gap: 10 },
  introButtonText: { color: Colors.text, fontSize: 15, fontFamily: Fonts.bodySemibold, letterSpacing: 0 },
  langConfirm: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  langConfirmText: { color: Colors.amber, fontFamily: Fonts.bodySemibold, fontSize: 13, letterSpacing: 0 },
  aboutBlock: { alignItems: "center", gap: 6, paddingVertical: 20, marginTop: 8 },
  aboutWordmark: { color: Colors.textMuted, fontFamily: Fonts.black, fontSize: 18, letterSpacing: 4 },
  aboutVersion: { color: Colors.textMuted, fontFamily: Fonts.body, fontSize: 12, letterSpacing: 0 },
  aboutTagline: { color: Colors.border, fontFamily: Fonts.bodySemibold, fontSize: 10, letterSpacing: 2 },
  spotRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  spotRowText: { flex: 1, gap: 1 },
  spotRowName: { color: Colors.textBright, fontFamily: Fonts.bodyMedium, fontSize: 15, letterSpacing: 0 },
  spotRowNote: { color: Colors.textMuted, fontFamily: Fonts.body, fontSize: 12, letterSpacing: 0 },
  spotPrivacyNote: { color: Colors.textMuted, fontFamily: Fonts.body, fontSize: 12, letterSpacing: 0, marginTop: 4 },
});
