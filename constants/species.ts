export type WaterCategory = "fresh" | "salt" | "both";
export interface SpeciesEntry { key: string; labelKey: string; water: WaterCategory }

export const ALL_SPECIES: SpeciesEntry[] = [
  { key: "havoerred", labelKey: "catch.speciesList.havoerred", water: "both" },
  { key: "laks",      labelKey: "catch.speciesList.laks",      water: "both" },
  { key: "gedde",     labelKey: "catch.speciesList.gedde",     water: "both" },
  { key: "torsk",     labelKey: "catch.speciesList.torsk",     water: "salt" },
  { key: "aborre",    labelKey: "catch.speciesList.aborre",    water: "fresh" },
  { key: "hornfisk",  labelKey: "catch.speciesList.hornfisk",  water: "salt" },
  { key: "makrel",    labelKey: "catch.speciesList.makrel",    water: "salt" },
  { key: "bækørred",  labelKey: "catch.speciesList.bækørred",  water: "fresh" },
  { key: "stalling",  labelKey: "catch.speciesList.stalling",  water: "fresh" },
  { key: "rødspætte", labelKey: "catch.speciesList.rødspætte", water: "salt" },
  { key: "skrubbe",   labelKey: "catch.speciesList.skrubbe",   water: "salt" },
  { key: "pighvar",   labelKey: "catch.speciesList.pighvar",   water: "salt" },
  { key: "suder",     labelKey: "catch.speciesList.suder",     water: "fresh" },
  { key: "karpe",     labelKey: "catch.speciesList.karpe",     water: "fresh" },
  { key: "other",     labelKey: "catch.speciesList.other",     water: "both" },
];

export const FRESHWATER_SPECIES = ALL_SPECIES.filter((s) => s.water === "fresh" || s.water === "both").filter((s) => s.key !== "other");
export const SALTWATER_SPECIES  = ALL_SPECIES.filter((s) => s.water === "salt"  || s.water === "both").filter((s) => s.key !== "other");

const SPECIES_BY_KEY = new Map(ALL_SPECIES.map((entry) => [entry.key, entry]));

/**
 * A species rendered the way the angler should read it.
 *
 * Species are stored by KEY ("havoerred"), never by label. The same fish logged
 * by a Dane and by someone running the app in English has to end up as one
 * species — in the statistics, and in the Activity Map's filter, which matches
 * on the key. Storing "Havørred" and "Sea trout" would silently split it in
 * two.
 *
 * Catches from before the species picker existed carry whatever text was typed
 * into the old free-text field. Those are shown exactly as typed rather than
 * hidden: it is the angler's own logbook entry, and we do not get to decide it
 * never happened.
 */
export function speciesLabel(
  species: string | null | undefined,
  t: (key: string) => string
): string {
  const raw = species?.trim();
  if (!raw) return "";
  const entry = SPECIES_BY_KEY.get(raw);
  return entry ? t(entry.labelKey) : raw;
}
