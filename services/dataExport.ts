import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { SQLiteDatabase } from "expo-sqlite";
import { SCHEMA_VERSION } from "@/database/schema";

/**
 * Lets an angler take their own data out of the app.
 *
 * There are no accounts, so the phone is the only copy of every trip. A lost
 * or replaced phone without an iCloud device backup loses the lot. That is
 * acceptable for a closed beta and not for a public release, and it is also
 * what GDPR's portability right asks for: the person's data, in a format
 * another program can read.
 *
 * Two formats, because they answer two different needs:
 * - CSV, one row per observation with its trip and conditions, for opening in
 *   Excel or Numbers. This is what most anglers mean by "my data".
 * - JSON, every table as it is stored, as a complete backup. It carries the
 *   schema version so a future import can read it back. Photos are referenced
 *   by file name only: the images themselves stay on the phone.
 *
 * Nothing here touches the network. Files are written to the app's cache
 * folder and handed to the system share sheet; where they go from there is
 * the angler's choice.
 */

export type ExportFormat = "csv" | "json";

/** Tables in a full backup. The two queues are internal plumbing and stay out. */
const BACKUP_TABLES = ["trips", "events", "weather_snapshots", "lures", "spots", "profile"] as const;

type Row = Record<string, unknown>;

async function tableExists(db: SQLiteDatabase, name: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?;",
    [name]
  );
  return (row?.n ?? 0) > 0;
}

async function allRows(db: SQLiteDatabase, table: string): Promise<Row[]> {
  if (!(await tableExists(db, table))) return [];
  // Table names come from the constant list above, never from input.
  return db.getAllAsync<Row>(`SELECT * FROM ${table};`);
}

export async function buildJsonBackup(db: SQLiteDatabase, appVersion: string): Promise<string> {
  const tables: Record<string, Row[]> = {};
  for (const table of BACKUP_TABLES) {
    tables[table] = await allRows(db, table);
  }
  return JSON.stringify(
    {
      app: "STRIKE",
      format: 1,
      schemaVersion: SCHEMA_VERSION,
      appVersion,
      exportedAt: new Date().toISOString(),
      tables
    },
    null,
    2
  );
}

/**
 * Columns first in this order; anything else stored on an event or its
 * weather snapshot follows after, so a column added in a later schema version
 * shows up in the export without anyone remembering to add it here.
 */
const PREFERRED_COLUMNS = [
  "trip_name",
  "trip_start",
  "trip_end",
  "time",
  "type",
  "species",
  "length_cm",
  "weight_kg",
  "released",
  "coloration",
  "is_kelt",
  "is_greenlander",
  "is_fin_clipped",
  "lure",
  "latitude",
  "longitude",
  "air_temp",
  "water_temp",
  "wind_speed",
  "wind_gust",
  "wind_direction",
  "pressure",
  "water_level",
  "water_level_trend",
  "cloud_cover",
  "precipitation",
  "comment"
];

/** Internal bookkeeping that means nothing outside the app. */
const SKIPPED_COLUMNS = new Set([
  "id",
  "trip_id",
  "event_id",
  "lure_id",
  "sync_status",
  "h3_cell",
  "privacy_level",
  "photo_uri",
  "timestamp",
  "lat",
  "lng"
]);

function csvCell(value: unknown, decimalComma: boolean, separator: string): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (typeof value === "number") {
    text = Number.isInteger(value) ? String(value) : String(Math.round(value * 1e6) / 1e6);
    if (decimalComma) text = text.replace(".", ",");
  } else {
    text = String(value);
  }
  return /["\n\r]/.test(text) || text.includes(separator) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * One row per observation.
 *
 * Danish Excel expects semicolons between columns and commas in decimals; with
 * the English layout it puts every row into one cell. So the separator follows
 * the app's language: semicolon and decimal comma for Danish, comma and
 * decimal point for English.
 */
export type CsvLabels = {
  /** Readable name for a stored species key ("havoerred" → "Havørred"). */
  species?: (key: string) => string;
  /** Readable name for an event type ("contact" → "Hug"). */
  type?: (key: string) => string;
};

/** Local wall-clock time as Excel parses it. UTC ISO strings read as text there. */
function localStamp(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export async function buildCsv(db: SQLiteDatabase, locale: string, labels: CsvLabels = {}): Promise<string> {
  const danish = locale.startsWith("da");
  const separator = danish ? ";" : ",";

  const trips = new Map<string, Row>();
  for (const trip of await allRows(db, "trips")) trips.set(String(trip.id), trip);
  const lures = new Map<string, Row>();
  for (const lure of await allRows(db, "lures")) lures.set(String(lure.id), lure);
  const weather = new Map<string, Row>();
  for (const snapshot of await allRows(db, "weather_snapshots")) weather.set(String(snapshot.event_id), snapshot);

  const events = (await allRows(db, "events")).sort((a, b) =>
    String(a.timestamp).localeCompare(String(b.timestamp))
  );

  const rows: Row[] = events.map((event) => {
    const trip = trips.get(String(event.trip_id));
    const lure = event.lure_id ? lures.get(String(event.lure_id)) : undefined;
    const snapshot = weather.get(String(event.id)) ?? {};
    const row: Row = {
      trip_name: trip?.name ?? "",
      trip_start: trip?.start_time ?? "",
      trip_end: trip?.end_time ?? "",
      time: event.timestamp,
      latitude: event.lat,
      longitude: event.lng,
      lure: lure?.name ?? ""
    };
    for (const [key, value] of Object.entries(snapshot)) {
      if (!SKIPPED_COLUMNS.has(key)) row[key] = value;
    }
    for (const [key, value] of Object.entries(event)) {
      if (!SKIPPED_COLUMNS.has(key)) row[key] = value;
    }
    row.trip_start = localStamp(row.trip_start);
    row.trip_end = localStamp(row.trip_end);
    row.time = localStamp(row.time);
    if (labels.type && typeof row.type === "string") row.type = labels.type(row.type);
    if (labels.species && typeof row.species === "string" && row.species) row.species = labels.species(row.species);
    return row;
  });

  const seen = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) seen.add(key);
  const columns = [
    ...PREFERRED_COLUMNS.filter((c) => seen.has(c) || rows.length === 0),
    ...[...seen].filter((c) => !PREFERRED_COLUMNS.includes(c)).sort()
  ];

  const lines = [columns.join(separator)];
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(row[c], danish, separator)).join(separator));
  }
  // The byte-order mark is what makes Excel read æ, ø and å as UTF-8 instead
  // of turning "Ørred" into "Ã˜rred".
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/**
 * Writes the export and opens the share sheet. Resolves false when there is
 * nothing to share with (no share sheet available), true otherwise — a user
 * cancelling the sheet still counts as success.
 */
export async function exportData(
  db: SQLiteDatabase,
  format: ExportFormat,
  options: { locale: string; appVersion: string; dialogTitle: string; labels?: CsvLabels }
): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;

  const stamp = new Date().toISOString().slice(0, 10);
  const name = format === "csv" ? `strike-observations-${stamp}.csv` : `strike-backup-${stamp}.json`;
  const uri = `${FileSystem.cacheDirectory}${name}`;
  const content =
    format === "csv" ? await buildCsv(db, options.locale, options.labels) : await buildJsonBackup(db, options.appVersion);

  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, {
    mimeType: format === "csv" ? "text/csv" : "application/json",
    UTI: format === "csv" ? "public.comma-separated-values-text" : "public.json",
    dialogTitle: options.dialogTitle
  });
  return true;
}
