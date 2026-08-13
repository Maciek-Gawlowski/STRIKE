import type { SQLiteDatabase } from "expo-sqlite";

export type Lure = {
  id: string;
  name: string;
  isFavourite: boolean;
  createdAt: string;
  colour?: string;
  colourSecondary?: string;
};

export type GearItem = { id: string; name: string };

export type Profile = {
  displayName: string;
  fishingMethods: string[];    // was fishingType (single); now multi-select JSON array
  preferredSpecies: string[];  // keys + optional "anden:<custom text>"
  waterType: string;           // "fresh" | "salt" | ""
  fishingLocations: string[];  // e.g. ["kyst", "soe"]
  photoUri: string;
  gear: GearItem[];
};

type LureRow = {
  id: string;
  name: string;
  is_favourite: number;
  created_at: string;
  colour: string | null;
  colour_secondary: string | null;
};

type ProfileRow = {
  id: number;
  display_name: string | null;
  fishing_type: string | null;
  preferred_species: string | null;
  water_type: string | null;
  fishing_locations: string | null;
  photo_uri: string | null;
  gear: string | null;
};

function rowToLure(row: LureRow): Lure {
  return {
    id: row.id,
    name: row.name,
    isFavourite: row.is_favourite === 1,
    createdAt: row.created_at,
    colour: row.colour ?? undefined,
    colourSecondary: row.colour_secondary ?? undefined,
  };
}

export async function getLures(db: SQLiteDatabase): Promise<Lure[]> {
  const rows = await db.getAllAsync<LureRow>(
    "SELECT * FROM lures ORDER BY is_favourite DESC, created_at ASC;"
  );
  return rows.map(rowToLure);
}

export async function getLureById(db: SQLiteDatabase, id: string): Promise<Lure | null> {
  const row = await db.getFirstAsync<LureRow>("SELECT * FROM lures WHERE id = ?;", [id]);
  return row ? rowToLure(row) : null;
}

export async function upsertLure(db: SQLiteDatabase, lure: Lure): Promise<void> {
  await db.runAsync(
    `INSERT INTO lures (id, name, is_favourite, created_at, colour, colour_secondary)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       is_favourite = excluded.is_favourite,
       colour = excluded.colour,
       colour_secondary = excluded.colour_secondary;`,
    [lure.id, lure.name, lure.isFavourite ? 1 : 0, lure.createdAt, lure.colour ?? null, lure.colourSecondary ?? null]
  );
}

export async function deleteLure(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync("DELETE FROM lures WHERE id = ?;", [id]);
}

export async function setFavouriteLure(db: SQLiteDatabase, id: string | null): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE lures SET is_favourite = 0;");
    if (id !== null) {
      await db.runAsync("UPDATE lures SET is_favourite = 1 WHERE id = ?;", [id]);
    }
  });
}

const parseStrArray = (s: string | null): string[] => {
  if (!s) return [];
  try { return JSON.parse(s) as string[]; } catch { return []; }
};

const parseGearArray = (s: string | null): GearItem[] => {
  if (!s) return [];
  try { return JSON.parse(s) as GearItem[]; } catch { return []; }
};

export async function getProfile(db: SQLiteDatabase): Promise<Profile> {
  const row = await db.getFirstAsync<ProfileRow>(
    "SELECT * FROM profile WHERE id = 1 LIMIT 1;"
  );
  if (!row) {
    return { displayName: "", fishingMethods: [], preferredSpecies: [], waterType: "", fishingLocations: [], photoUri: "", gear: [] };
  }
  // fishing_type may be a legacy single string or a JSON array
  let fishingMethods: string[] = [];
  if (row.fishing_type) {
    fishingMethods = row.fishing_type.startsWith("[")
      ? parseStrArray(row.fishing_type)
      : [row.fishing_type];
  }
  return {
    displayName: row.display_name ?? "",
    fishingMethods,
    preferredSpecies: parseStrArray(row.preferred_species),
    waterType: row.water_type ?? "",
    fishingLocations: parseStrArray(row.fishing_locations),
    photoUri: row.photo_uri ?? "",
    gear: parseGearArray(row.gear),
  };
}

export async function saveProfile(db: SQLiteDatabase, profile: Profile): Promise<void> {
  await db.runAsync(
    `INSERT INTO profile (id, display_name, fishing_type, preferred_species, water_type, fishing_locations, photo_uri, gear)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       display_name       = excluded.display_name,
       fishing_type       = excluded.fishing_type,
       preferred_species  = excluded.preferred_species,
       water_type         = excluded.water_type,
       fishing_locations  = excluded.fishing_locations,
       photo_uri          = excluded.photo_uri,
       gear               = excluded.gear;`,
    [
      profile.displayName || null,
      profile.fishingMethods.length > 0 ? JSON.stringify(profile.fishingMethods) : null,
      profile.preferredSpecies.length > 0 ? JSON.stringify(profile.preferredSpecies) : null,
      profile.waterType || null,
      profile.fishingLocations.length > 0 ? JSON.stringify(profile.fishingLocations) : null,
      profile.photoUri || null,
      profile.gear.length > 0 ? JSON.stringify(profile.gear) : null,
    ]
  );
}
