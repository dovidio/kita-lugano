#!/usr/bin/env python3
"""Geocode the KiTa dataset with the official Swiss geocoder (swisstopo / geo.admin.ch).

For every entry in data/kitas.json the script resolves the street address to WGS84
coordinates. Results are cached in data/raw/geocode-cache.json so that re-runs are
free and deterministic. If a street address cannot be resolved, the script falls
back to "postal code + locality", which yields locality-level coordinates.

Usage:
    python3 scripts/geocode.py            # resolve + write coordinates into kitas.json
    python3 scripts/geocode.py --refresh  # ignore the cache and query again
    python3 scripts/geocode.py --check    # report entries without coordinates
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "kitas.json"
CACHE = ROOT / "data" / "raw" / "geocode-cache.json"
API = "https://api3.geo.admin.ch/rest/services/api/SearchServer"
USER_AGENT = "kita-lugano/1.0 (open data project; contact: local)"

# Nominatim-style politeness: geo.admin.ch has no documented hard limit, but we
# keep the request rate modest and cache everything we fetch.
SLEEP_SECONDS = 0.35


def load_json(path: Path, default):
    if not path.exists():
        return default
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


# Street-type words carry no identifying information, so they are ignored when
# checking whether a geocoder hit really refers to the street we asked for.
STREET_STOPWORDS = {
    "via", "viale", "vicolo", "corso", "strada", "piazza", "piazzale", "contrada",
    "riva", "salita", "discesa", "ai", "al", "alla", "allo", "dei", "del", "della",
    "delle", "degli", "di", "da", "in", "su", "presso", "nucleo", "stabile",
}


def norm_tokens(text: str) -> set[str]:
    """Lowercase, strip accents and punctuation, split into word tokens."""
    import unicodedata

    decomposed = unicodedata.normalize("NFKD", text or "")
    ascii_text = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    cleaned = "".join(ch if ch.isalnum() else " " for ch in ascii_text.lower())
    return {tok for tok in cleaned.split() if tok}


def distinctive_tokens(street: str) -> set[str]:
    """Tokens of a street name that must appear in a valid geocoder match."""
    return {
        tok
        for tok in norm_tokens(street)
        if tok not in STREET_STOPWORDS and not tok.isdigit() and len(tok) > 1
    }


def match_is_plausible(street: str, matched_label: str) -> bool:
    """Reject silent fuzzy matches (e.g. 'Via Pian Scairolo' -> 'Via alla Piana').

    swisstopo always returns *something*, so an unmatched street can otherwise be
    geocoded onto a completely different road. We require every distinctive token
    of the requested street to appear in the returned label.
    """
    wanted = distinctive_tokens(street)
    if not wanted:
        return True
    return wanted.issubset(norm_tokens(matched_label))


def query(search_text: str) -> dict | None:
    """Ask swisstopo for the best match of a free-text Swiss address."""
    params = urllib.parse.urlencode(
        {
            "searchText": search_text,
            "type": "locations",
            "origins": "address,parcel,zipcode,gg25",
            "limit": 1,
        }
    )
    request = urllib.request.Request(f"{API}?{params}", headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"  ! request failed for {search_text!r}: {exc}", file=sys.stderr)
        return None

    results = payload.get("results") or []
    if not results:
        return None
    attrs = results[0].get("attrs") or {}
    lat, lon = attrs.get("lat"), attrs.get("lon")
    if lat is None or lon is None:
        return None
    return {
        "lat": round(float(lat), 6),
        "lon": round(float(lon), 6),
        "accuracy": attrs.get("origin", "unknown"),
        "matched": (attrs.get("label") or "").replace("<b>", "").replace("</b>", ""),
        "query": search_text,
    }


def geocode(entry: dict, cache: dict, refresh: bool) -> dict | None:
    """Resolve an entry to coordinates, degrading street -> street segment -> locality.

    Returns a hit dict with a `precision` of "address" (house-number level),
    "street" (road level, no house number found) or "locality" (postal-code level).
    """
    address = entry.get("address") or {}
    street = (address.get("street") or "").strip()
    zipcode = (address.get("postal_code") or "").strip()
    locality = (address.get("locality") or "").strip()

    street_variants: list[str] = []
    if street:
        street_variants.append(street)
        if "," in street:
            # "Campus Est, Via La Santa 1" -> also try "Via La Santa 1".
            segments = sorted((s.strip() for s in street.split(",") if s.strip()), key=len, reverse=True)
            street_variants.extend(segments)

    candidates: list[tuple[str, str, str]] = []
    for variant in dict.fromkeys(street_variants):
        candidates.append((f"{variant} {zipcode} {locality}".strip(), "street", variant))
    candidates.append((f"{zipcode} {locality}".strip(), "locality", ""))

    seen: set[str] = set()
    for candidate, kind, requested_street in candidates:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)

        if not refresh and candidate in cache:
            hit = cache[candidate]
        else:
            time.sleep(SLEEP_SECONDS)
            hit = query(candidate)
            cache[candidate] = hit

        if not hit:
            continue

        if kind == "street" and not match_is_plausible(requested_street, hit["matched"]):
            print(f"  ~ {entry['id']}: rejected fuzzy match {hit['matched']!r} for {candidate!r}", file=sys.stderr)
            continue

        if kind == "locality" or hit["accuracy"] in {"zipcode", "gg25", "kantone", "district"}:
            precision = "locality"
        elif "#" in hit.get("matched", ""):
            precision = "street"
        else:
            precision = "address"

        return {**hit, "precision": precision}

    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="ignore the local cache")
    parser.add_argument("--check", action="store_true", help="only report missing coordinates")
    args = parser.parse_args()

    dataset = load_json(DATA, None)
    if dataset is None:
        print(f"error: {DATA} not found", file=sys.stderr)
        return 1

    cache = {} if args.refresh else load_json(CACHE, {})
    unresolved: list[str] = []
    resolved = 0

    for entry in dataset["kitas"]:
        if args.check:
            if not entry.get("geo"):
                unresolved.append(entry["id"])
            continue

        hit = geocode(entry, cache, args.refresh)
        if hit:
            entry["geo"] = {
                "lat": hit["lat"],
                "lon": hit["lon"],
                "precision": hit["precision"],
                "accuracy": hit["accuracy"],
                "geocoder": "swisstopo geo.admin.ch SearchServer",
            }
            resolved += 1
            flag = {"address": "OK ", "street": "~  ", "locality": "~~ "}[hit["precision"]]
            print(f"{flag}{entry['id']:<24} {hit['lat']:.5f},{hit['lon']:.5f}  [{hit['precision']}] {hit['matched']}")
        else:
            entry["geo"] = None
            unresolved.append(entry["id"])
            print(f"MISS {entry['id']:<24} could not resolve {entry['address']['full']}")

    if args.check:
        if unresolved:
            print(f"\n{len(unresolved)} entries without coordinates: {', '.join(unresolved)}")
            return 1
        print(f"all {len(dataset['kitas'])} entries have coordinates")
        return 0

    CACHE.parent.mkdir(parents=True, exist_ok=True)
    with CACHE.open("w", encoding="utf-8") as fh:
        json.dump(cache, fh, ensure_ascii=False, indent=2, sort_keys=True)
        fh.write("\n")

    with DATA.open("w", encoding="utf-8") as fh:
        json.dump(dataset, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    print(f"\ngeocoded {resolved}/{len(dataset['kitas'])} entries; cache: {CACHE.relative_to(ROOT)}")
    if unresolved:
        print(f"no coordinates for: {', '.join(unresolved)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
