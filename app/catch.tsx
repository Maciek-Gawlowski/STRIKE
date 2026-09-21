import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "@/components/Screen";
import { getDb } from "@/database/db";
import { getLures, type Lure } from "@/database/lures";
import { LureColourDot } from "@/components/LureColourDot";
import { useStrikeStore } from "@/store/useStrikeStore";
import { formatWind } from "@/services/weather";
import { useTranslation } from "@/i18n";
import { Colors } from "@/theme/colors";
import { Fonts } from "@/theme/fonts";

import { ALL_SPECIES } from "@/constants/species";

export default function CatchScreen() {
  const { t } = useTranslation();
  const activeTrip = useStrikeStore((state) => state.activeTrip);
  const currentLocation = useStrikeStore((state) => state.currentLocation);
  const addCatch = useStrikeStore((state) => state.addCatch);
  const weather = useStrikeStore((state) => state.weather);
  const waterLevel = useStrikeStore((state) => state.waterLevel);
  const refreshWeather = useStrikeStore((state) => state.refreshWeather);
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [selectedSpecies, setSelectedSpecies] = useState(() => t("catch.speciesList.havoerred"));
  const [comment, setComment] = useState("");
  const [kept, setKept] = useState(false);
  const [speciesOpen, setSpeciesOpen] = useState(false);
  const [lengthCm, setLengthCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [lures, setLures] = useState<Lure[]>([]);
  const [selectedLureId, setSelectedLureId] = useState<string | null>(null);
  const [lurePickerOpen, setLurePickerOpen] = useState(false);
  const celebAnim = useRef(new Animated.Value(0)).current;

  // Refresh current conditions once when the catch screen opens (offline-safe).
  useEffect(() => {
    refreshWeather();
  }, [refreshWeather]);

  const activeLureId = activeTrip?.currentLureId;

  useEffect(() => {
    getDb()
      .then(getLures)
      .then((list) => {
        setLures(list);
        // Pre-fill with the trip's active lure; fall back to the starred favourite.
        if (activeLureId && list.some((l) => l.id === activeLureId)) {
          setSelectedLureId(activeLureId);
        } else {
          const fav = list.find((l) => l.isFavourite);
          if (fav) setSelectedLureId(fav.id);
        }
      })
      .catch(() => null);
  }, [activeLureId]);

  const applyResult = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets[0]?.uri) return;
    const tempUri = result.assets[0].uri;
    try {
      // Copy to documentDirectory so the URI survives OS cache eviction and reinstalls.
      const dest = `${FileSystem.documentDirectory}strike_catch_${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: tempUri, to: dest });
      setPhotoUri(dest);
    } catch {
      setPhotoUri(tempUri);
    }
  };

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.82
    });
    await applyResult(result);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") return;
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.82
    });
    await applyResult(result);
  };

  // Offer camera or library via a native action sheet (cross-platform via Alert).
  const choosePhoto = async () => {
    await Haptics.selectionAsync();
    Alert.alert(t("catch.addPhoto"), undefined, [
      { text: t("catch.takePhoto"), onPress: () => void takePhoto() },
      { text: t("catch.chooseLibrary"), onPress: () => void pickFromLibrary() },
      { text: t("common.cancel"), style: "cancel" }
    ]);
  };

  const saveCatch = async () => {
    if (!activeTrip) return;
    const parsedLength = parseFloat(lengthCm);
    const parsedWeight = parseFloat(weightKg);
    addCatch({
      photoUri,
      species: selectedSpecies,
      comment,
      kept,
      position: currentLocation ?? undefined,
      lengthCm: isNaN(parsedLength) ? undefined : parsedLength,
      weightKg: isNaN(parsedWeight) ? undefined : parsedWeight,
      lureId: selectedLureId ?? undefined,
    });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Animated.sequence([
      Animated.timing(celebAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(260),
      Animated.timing(celebAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => router.back());
  };

  if (!activeTrip) {
    return (
      <Screen>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
        <View style={styles.empty}>
          <Text style={styles.title}>{t("catch.startTripFirst")}</Text>
          <Text style={styles.subtle}>{t("catch.startTripFirstHint")}</Text>
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
        <Text style={styles.kicker}>{t("catch.kicker")}</Text>
        <Text style={styles.title}>{t("catch.title")}</Text>
        <Text style={styles.subtle}>
          {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} /{" "}
          {currentLocation ? `${currentLocation.latitude.toFixed(5)}, ${currentLocation.longitude.toFixed(5)}` : t("common.gpsPending")}
        </Text>
      </View>

      {(weather !== null || waterLevel !== null) ? (
        <View style={styles.weatherRow}>
          {weather !== null ? (
            <>
              <View style={styles.weatherPill}>
                <Ionicons name="thermometer-outline" size={14} color={Colors.text} />
                <Text style={styles.weatherPillText}>{t("weather.air", { v: Math.round(weather.airTemp) })}</Text>
              </View>
              <View style={styles.weatherPill}>
                <Ionicons name="navigate-outline" size={14} color={Colors.text} />
                <Text style={styles.weatherPillText}>{formatWind(weather)}</Text>
              </View>
              <View style={styles.weatherPill}>
                <Ionicons name="trending-down-outline" size={14} color={Colors.text} />
                <Text style={styles.weatherPillText}>{Math.round(weather.pressure)} hPa</Text>
              </View>
              {weather.waterTemp !== null ? (
                <View style={styles.weatherPill}>
                  <Ionicons name="water-outline" size={14} color={Colors.text} />
                  <Text style={styles.weatherPillText}>{t("weather.water", { v: Math.round(weather.waterTemp) })}</Text>
                </View>
              ) : null}
            </>
          ) : null}
          {waterLevel !== null ? (
            <View style={styles.weatherPill}>
              <Ionicons
                name={
                  waterLevel.trend === "rising"
                    ? "arrow-up-outline"
                    : waterLevel.trend === "falling"
                      ? "arrow-down-outline"
                      : "remove-outline"
                }
                size={14}
                color={Colors.text}
              />
              <Text style={styles.weatherPillText}>
                {waterLevel.level} cm ·{" "}
                {waterLevel.trend === "rising"
                  ? t("weather.rising")
                  : waterLevel.trend === "falling"
                    ? t("weather.falling")
                    : t("weather.stable")}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <Pressable style={styles.photoBox} onPress={choosePhoto}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photo} />
        ) : (
          <View style={styles.photoEmpty}>
            <Ionicons name="camera-outline" size={32} color={Colors.text} />
            <Text style={styles.photoText}>{t("catch.addPhoto")}</Text>
            <Text style={styles.photoOptional}>{t("catch.photoOptional")}</Text>
          </View>
        )}
      </Pressable>

      <View style={styles.form}>
        <Text style={styles.label}>{t("catch.species")}</Text>
        <Pressable style={styles.select} onPress={() => setSpeciesOpen(true)}>
          <Text style={styles.selectText}>{selectedSpecies}</Text>
          <Ionicons name="chevron-down" size={18} color={Colors.text} />
        </Pressable>

        <Text style={styles.label}>{t("catch.comment")}</Text>
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder={t("catch.commentPlaceholder")}
          placeholderTextColor="#647a72"
          multiline
          style={styles.input}
        />

        {lures.length > 0 ? (
          <>
            <Text style={styles.label}>{t("catch.lure")}</Text>
            <Pressable style={styles.select} onPress={() => setLurePickerOpen(true)}>
              <View style={styles.selectInner}>
                <LureColourDot
                  colourKey={lures.find((l) => l.id === selectedLureId)?.colour}
                  colourSecondaryKey={lures.find((l) => l.id === selectedLureId)?.colourSecondary}
                  size={14}
                />
                <Text style={styles.selectText}>
                  {lures.find((l) => l.id === selectedLureId)?.name ?? t("catch.noLure")}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={18} color={Colors.text} />
            </Pressable>
          </>
        ) : null}

        <View style={styles.measureRow}>
          <View style={styles.measureField}>
            <Text style={styles.label}>{t("catch.length")}</Text>
            <TextInput
              value={lengthCm}
              onChangeText={setLengthCm}
              placeholder="—"
              placeholderTextColor="#647a72"
              keyboardType="decimal-pad"
              style={styles.measureInput}
            />
          </View>
          <View style={styles.measureField}>
            <Text style={styles.label}>{t("catch.weight")}</Text>
            <TextInput
              value={weightKg}
              onChangeText={setWeightKg}
              placeholder="—"
              placeholderTextColor="#647a72"
              keyboardType="decimal-pad"
              style={styles.measureInput}
            />
          </View>
        </View>

        <Text style={styles.label}>{t("catch.outcome")}</Text>
        <View style={styles.toggleRow}>
          <Pressable style={[styles.toggle, !kept && styles.toggleActive]} onPress={() => setKept(false)}>
            <Text style={[styles.toggleText, !kept && styles.toggleTextActive]}>{t("catch.released")}</Text>
          </Pressable>
          <Pressable style={[styles.toggle, kept && styles.toggleActive]} onPress={() => setKept(true)}>
            <Text style={[styles.toggleText, kept && styles.toggleTextActive]}>{t("catch.kept")}</Text>
          </Pressable>
        </View>
      </View>

      <Pressable style={styles.save} onPress={saveCatch}>
        <Ionicons name="checkmark-circle-outline" size={22} color={Colors.textOnAmber} />
        <Text style={styles.saveText}>{t("actions.saveCatch")}</Text>
      </Pressable>

      <Modal visible={speciesOpen} transparent animationType="fade" onRequestClose={() => setSpeciesOpen(false)}>
        <Pressable style={styles.modalScrim} onPress={() => setSpeciesOpen(false)}>
          <View style={styles.modalCard}>
            {ALL_SPECIES.map((sp) => {
              const label = t(sp.labelKey as never);
              return (
                <Pressable
                  key={sp.key}
                  style={styles.option}
                  onPress={() => {
                    setSelectedSpecies(label);
                    setSpeciesOpen(false);
                  }}
                >
                  <Text style={styles.optionText}>{label}</Text>
                  {label === selectedSpecies ? <Ionicons name="checkmark" size={20} color={Colors.amber} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={lurePickerOpen} transparent animationType="fade" onRequestClose={() => setLurePickerOpen(false)}>
        <Pressable style={styles.modalScrim} onPress={() => setLurePickerOpen(false)}>
          <View style={styles.modalCard}>
            <Pressable
              style={styles.option}
              onPress={() => {
                setSelectedLureId(null);
                setLurePickerOpen(false);
              }}
            >
              <Text style={styles.optionText}>{t("catch.noLure")}</Text>
              {selectedLureId === null ? <Ionicons name="checkmark" size={20} color={Colors.amber} /> : null}
            </Pressable>
            {lures.map((lure) => (
              <Pressable
                key={lure.id}
                style={styles.option}
                onPress={() => {
                  setSelectedLureId(lure.id);
                  setLurePickerOpen(false);
                }}
              >
                <View style={styles.lureOptionRow}>
                  {lure.isFavourite ? (
                    <Ionicons name="star" size={14} color={Colors.amber} style={styles.lureOptionStar} />
                  ) : null}
                  <LureColourDot colourKey={lure.colour} colourSecondaryKey={lure.colourSecondary} size={12} />
                  <Text style={[styles.optionText, lure.colour ? styles.lureOptionNameGap : null]}>
                    {lure.name}
                  </Text>
                </View>
                {lure.id === selectedLureId ? <Ionicons name="checkmark" size={20} color={Colors.amber} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
      <Animated.View
        style={[styles.celebOverlay, { opacity: celebAnim }]}
        pointerEvents="none"
      >
        <Ionicons name="fish-outline" size={72} color={Colors.navy} />
        <Text style={styles.celebSpecies}>{selectedSpecies}</Text>
      </Animated.View>
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
  backText: {
    color: Colors.text,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 0
  },
  kicker: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.bodySemibold,
    letterSpacing: 0
  },
  title: {
    color: Colors.textBright,
    fontSize: 34,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  subtle: {
    color: Colors.textMuted,
    marginTop: 5,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.body
  },
  weatherRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  weatherPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.card
  },
  weatherPillText: {
    color: Colors.text,
    fontFamily: Fonts.bodySemibold,
    fontSize: 12,
    letterSpacing: 0
  },
  photoBox: {
    height: 230,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border
  },
  photo: {
    width: "100%",
    height: "100%"
  },
  photoEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  photoText: {
    color: Colors.text,
    fontFamily: Fonts.heading,
    fontSize: 18,
    letterSpacing: 0
  },
  photoOptional: {
    color: Colors.textMuted,
    fontFamily: Fonts.body,
    fontSize: 12,
    letterSpacing: 0
  },
  form: {
    gap: 10
  },
  label: {
    color: Colors.text,
    fontSize: 12,
    fontFamily: Fonts.bodySemibold,
    textTransform: "uppercase",
    marginTop: 6,
    letterSpacing: 0
  },
  select: {
    height: 58,
    borderRadius: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.field
  },
  selectText: {
    color: Colors.textBright,
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
    letterSpacing: 0
  },
  input: {
    minHeight: 112,
    borderRadius: 16,
    padding: 16,
    color: Colors.textBright,
    textAlignVertical: "top",
    backgroundColor: Colors.field,
    fontSize: 16,
    fontFamily: Fonts.body
  },
  measureRow: {
    flexDirection: "row",
    gap: 10
  },
  measureField: {
    flex: 1,
    gap: 6
  },
  measureInput: {
    height: 58,
    borderRadius: 16,
    paddingHorizontal: 16,
    color: Colors.textBright,
    backgroundColor: Colors.field,
    fontSize: 20,
    fontFamily: Fonts.bodyBold,
    textAlign: "center"
  },
  toggleRow: {
    flexDirection: "row",
    gap: 10
  },
  toggle: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.field
  },
  toggleActive: {
    backgroundColor: Colors.amber
  },
  toggleText: {
    color: Colors.textMuted,
    fontFamily: Fonts.heading,
    letterSpacing: 0
  },
  toggleTextActive: {
    color: Colors.textOnAmber
  },
  save: {
    height: 62,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: Colors.amber
  },
  saveText: {
    color: Colors.textOnAmber,
    fontFamily: Fonts.heading,
    fontSize: 17,
    letterSpacing: 0
  },
  modalScrim: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0, 0, 0, 0.64)"
  },
  modalCard: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border
  },
  option: {
    minHeight: 58,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border
  },
  optionText: {
    color: Colors.textBright,
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
    letterSpacing: 0
  },
  empty: {
    gap: 8,
    paddingTop: 40
  },
  selectInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  lureOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  lureOptionStar: {
    marginRight: 2,
  },
  lureOptionNameGap: {
    marginLeft: 2,
  },
  celebOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.catchGreen,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    zIndex: 99,
  },
  celebSpecies: {
    color: Colors.catchText,
    fontFamily: Fonts.black,
    fontSize: 36,
    letterSpacing: 0,
  },
});
