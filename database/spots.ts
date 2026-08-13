import type { SQLiteDatabase } from "expo-sqlite";

export type Spot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  note?: string;
  createdAt: string;
};

type SpotRow = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  note: string | null;
  created_at: string;
};

function rowToSpot(row: SpotRow): Spot {
  return {
    id: row.id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    note: row.note ?? undefined,
    createdAt: row.created_at
  };
}

export async function getSpots(db: SQLiteDatabase): Promise<Spot[]> {
  const rows = await db.getAllAsync<SpotRow>(
    "SELECT * FROM spots ORDER BY created_at DESC;"
  );
  return rows.map(rowToSpot);
}

export async function upsertSpot(db: SQLiteDatabase, spot: Spot): Promise<void> {
  await db.runAsync(
    `INSERT INTO spots (id, name, lat, lng, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       lat  = excluded.lat,
       lng  = excluded.lng,
       note = excluded.note;`,
    [spot.id, spot.name, spot.lat, spot.lng, spot.note ?? null, spot.createdAt]
  );
}

export async function deleteSpot(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync("DELETE FROM spots WHERE id = ?;", [id]);
}
