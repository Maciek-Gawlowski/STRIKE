"""Rebuild data/protectionZones.json from Fiskeristyrelsen's published map.

    curl.exe "https://services-eu1.arcgis.com/c3o7qz6F0HswtuVz/arcgis/rest/\
services/Fredningsb%C3%A6lter/FeatureServer/0/query?where=1=1&outFields=*\
&outSR=4326&f=geojson" -o fredningsbaelter.geojson
    python scripts/buildProtectionZones.py fredningsbaelter.geojson \
data/protectionZones.json 0.00002

The tolerance is in degrees. 0.00002 moves no boundary by more than 2.8 m,
measured against the unsimplified source — below the GPS error of a phone on
a beach, which is the only reason simplifying a legal boundary is defensible
at all. Looser values were tested: 0.00005 reaches 8 m, 0.0001 reaches 17 m.
Simplification pulls most boundaries INWARD, so erring large would quietly
shrink the zones and cost someone a warning they should have had.

Fisheries moved to Miljoestyrelsen in July 2026, so the service URL may change.

"""Notes on the data itself.

Two things this file is careful about:

1. FREDNINGSP is free text typed by hand - "Hele aaret", "Helaarlig fredning"
   and "Helaarlig" are one rule spelled three ways, and 45 zones say only
   "Halvaarlig" without saying WHICH half. PeriodeTyp is the coded field and
   it agrees with the text everywhere the text is unambiguous, so the code
   leads and the text is kept only for display.
2. A zone we cannot date is never shown as open. It falls back to
   always-warn: a missed warning costs a fine, a false warning costs a shrug.
"""
import json, sys, re
from shapely.geometry import shape, mapping

src, out, tol_arg = sys.argv[1], sys.argv[2], float(sys.argv[3])

# month name -> number, for the handful of zones PeriodeTyp leaves undated
MONTHS = {
    "januar": 1, "februar": 2, "marts": 3, "april": 4, "maj": 5, "juni": 6,
    "juli": 7, "august": 8, "september": 9, "oktober": 10, "november": 11,
    "december": 12,
}
RANGE_RE = re.compile(
    r"(\d{1,2})\.\s*([a-zæøå]+)\s*(?:-|–|til)\s*(\d{1,2})\.\s*([a-zæøå]+)", re.I
)
MONTH_RANGE_RE = re.compile(r"^([a-zæøå]+)\s*(?:-|–)\s*([a-zæøå]+)$", re.I)


def parse_period(period_type, text):
    """Return (kind, from_md, to_md). kind is year | season | unknown."""
    t = (text or "").strip().lower()

    if period_type == "1":
        return "year", None, None
    if period_type == "2":
        # Every type-2 row is 16 Sept - 15 March, including the ones that
        # only say "Halvaarlig". Verified against the 131 rows that spell
        # the dates out.
        return "season", "09-16", "03-15"

    # type 0 is the leftovers bucket: try the text, give up loudly.
    if t.startswith("hele") or t.startswith("helår") or t.startswith("helaar"):
        return "year", None, None

    m = RANGE_RE.search(t)
    if m:
        d1, m1, d2, m2 = m.group(1), m.group(2), m.group(3), m.group(4)
        if m1 in MONTHS and m2 in MONTHS:
            return "season", f"{MONTHS[m1]:02d}-{int(d1):02d}", f"{MONTHS[m2]:02d}-{int(d2):02d}"

    m = MONTH_RANGE_RE.match(t)
    if m and m.group(1) in MONTHS and m.group(2) in MONTHS:
        a, b = MONTHS[m.group(1)], MONTHS[m.group(2)]
        last = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][b - 1]
        return "season", f"{a:02d}-01", f"{b:02d}-{last:02d}"

    if t == "april og maj":
        return "season", "04-01", "05-31"

    # "Saerfredning", "Se fiskeri i Odense Fjord", "Se paragraf 12 in ..."
    return "unknown", None, None


def round_coords(geom, nd=5):
    if isinstance(geom, (list, tuple)):
        if geom and isinstance(geom[0], (int, float)):
            return [round(float(c), nd) for c in geom]
        return [round_coords(g, nd) for g in geom]
    return geom


data = json.load(open(src, encoding="utf-8"))
features, stats = [], {"year": 0, "season": 0, "unknown": 0}

for f in data["features"]:
    p = f["properties"]
    if not f.get("geometry"):
        continue
    g = shape(f["geometry"])
    if tol_arg > 0:
        g = g.simplify(tol_arg, preserve_topology=True)
    if g.is_empty:
        continue

    kind, frm, to = parse_period(str(p.get("PeriodeTyp", "")).strip(), p.get("FREDNINGSP"))
    stats[kind] += 1

    props = {
        "id": str(p.get("ID") or p.get("FID")),
        "name": (p.get("NAVN") or "").strip(),
        "period": kind,
        "periodText": (p.get("FREDNINGSP") or "").strip(),
        "law": (p.get("LOVGRUNDLA") or "").strip(),
    }
    if frm:
        props["from"], props["to"] = frm, to
    url = (p.get("WWW") or "").strip()
    if url:
        props["url"] = url

    features.append({
        "type": "Feature",
        "properties": props,
        "geometry": {"type": g.geom_type, "coordinates": round_coords(mapping(g)["coordinates"])},
    })

json.dump({"type": "FeatureCollection", "features": features},
          open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

import os
print(f"tol={tol_arg}  features={len(features)}  "
      f"year={stats['year']} season={stats['season']} unknown={stats['unknown']}  "
      f"size={os.path.getsize(out)/1024:.0f} KB")
