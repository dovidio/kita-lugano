#!/usr/bin/env python3
"""Validate the KiTa Lugano dataset (data/kitas.json).

Zero dependencies: this is a focused structural validator rather than a full
JSON-Schema engine, but it enforces every constraint declared in
data/kitas.schema.json plus a set of cross-record and domain invariants
(unique ids, resolvable source references, Swiss phone numbers, coordinates
inside Ticino, coherent age ranges, ...).

Usage:
    python3 scripts/validate.py
    python3 scripts/validate.py --verbose

Exit code 0 = valid, 1 = at least one error.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "kitas.json"
SCHEMA = ROOT / "data" / "kitas.schema.json"

TICINO_BBOX = {"lat": (45.70, 46.20), "lon": (8.70, 9.20)}
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")
ZIP_RE = re.compile(r"^\d{4}$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
PHONE_RE = re.compile(r"^\+41 [0-9 ]+$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
URL_RE = re.compile(r"^https?://")
VALID_DAYS = {"mo", "tu", "we", "th", "fr", "sa", "su"}

errors: list[str] = []
warnings: list[str] = []


def fail(where: str, message: str) -> None:
    errors.append(f"{where}: {message}")


def warn(where: str, message: str) -> None:
    warnings.append(f"{where}: {message}")


def check(condition: bool, where: str, message: str) -> bool:
    if not condition:
        fail(where, message)
    return condition


def check_str(value, where: str, field: str, *, nullable: bool = False, pattern=None, min_len=1) -> None:
    if value is None:
        if not nullable:
            fail(where, f"{field} must not be null")
        return
    if not isinstance(value, str):
        fail(where, f"{field} must be a string (got {type(value).__name__})")
        return
    if len(value) < min_len:
        fail(where, f"{field} is too short")
    if pattern and not pattern.match(value):
        fail(where, f"{field}={value!r} does not match {pattern.pattern}")


def validate_meta(meta: dict, kitas: list[dict]) -> None:
    where = "meta"
    if not isinstance(meta, dict):
        fail(where, "must be an object")
        return

    for field in ("title", "description", "schema_version", "data_version", "disclaimer", "currency"):
        check_str(meta.get(field), where, field, nullable=field == "currency")

    check_str(meta.get("schema_version"), where, "schema_version", pattern=SEMVER_RE)
    check_str(meta.get("data_version"), where, "data_version", pattern=DATE_RE)

    sources = meta.get("sources")
    if not check(isinstance(sources, list) and sources, where, "sources must be a non-empty array"):
        return

    seen_source_ids: set[str] = set()
    for index, source in enumerate(sources):
        swhere = f"meta.sources[{index}]"
        if not isinstance(source, dict):
            fail(swhere, "must be an object")
            continue
        check_str(source.get("id"), swhere, "id", pattern=ID_RE)
        check_str(source.get("label"), swhere, "label")
        check_str(source.get("url"), swhere, "url", pattern=URL_RE)
        check_str(source.get("publisher"), swhere, "publisher")
        check_str(source.get("retrieved"), swhere, "retrieved", pattern=DATE_RE)
        if set(source) - {"id", "label", "url", "publisher", "retrieved"}:
            warn(swhere, f"unexpected extra keys: {sorted(set(source) - {'id', 'label', 'url', 'publisher', 'retrieved'})}")
        sid = source.get("id")
        if sid in seen_source_ids:
            fail(swhere, f"duplicate source id {sid!r}")
        seen_source_ids.add(sid)

    count = meta.get("count")
    if not check(isinstance(count, int), where, "count must be an integer"):
        return
    if count != len(kitas):
        fail(where, f"count={count} does not match the number of records ({len(kitas)})")

    used: set[str] = set()
    for kita in kitas:
        used.update(kita.get("sources") or [])
    for sid in sorted(seen_source_ids - used):
        warn(where, f"source {sid!r} is declared but never referenced")
    for sid in sorted(used - seen_source_ids):
        fail(where, f"referenced source {sid!r} is not declared in meta.sources")


def validate_kita(kita: dict, index: int, source_ids: set[str]) -> None:
    where = f"kitas[{index}]"
    if not isinstance(kita, dict):
        fail(where, "must be an object")
        return

    kid = kita.get("id")
    where = f"kitas[{index}] ({kid or 'no-id'})"
    check_str(kid, where, "id", pattern=ID_RE)
    check_str(kita.get("name"), where, "name", min_len=2)
    check_str(kita.get("operator"), where, "operator", nullable=True)
    check_str(kita.get("comune"), where, "comune", min_len=2)
    check_str(kita.get("zona"), where, "zona", nullable=True)
    check_str(kita.get("closures"), where, "closures", nullable=True)
    check_str(kita.get("notes"), where, "notes", nullable=True)

    if kita.get("type") not in {"pubblico", "privato"}:
        fail(where, f"type must be 'pubblico' or 'privato' (got {kita.get('type')!r})")
    check(isinstance(kita.get("in_city_of_lugano"), bool), where, "in_city_of_lugano must be a boolean")

    if kita.get("in_city_of_lugano") and kita.get("comune") != "Lugano":
        fail(where, f"in_city_of_lugano=True but comune={kita.get('comune')!r}")
    if not kita.get("in_city_of_lugano") and kita.get("comune") == "Lugano":
        fail(where, "comune is Lugano but in_city_of_lugano is False")

    # address -----------------------------------------------------------------
    address = kita.get("address")
    if check(isinstance(address, dict), where, "address must be an object"):
        check_str(address.get("street"), where, "address.street", nullable=True)
        check_str(address.get("postal_code"), where, "address.postal_code", pattern=ZIP_RE)
        check_str(address.get("locality"), where, "address.locality", min_len=2)
        check_str(address.get("full"), where, "address.full", min_len=4)
        full = address.get("full") or ""
        locality = address.get("locality") or ""
        if locality and locality.lower() not in full.lower():
            warn(where, "address.full does not mention the locality")
        if not str(address.get("postal_code")) in full:
            warn(where, "address.full does not mention the postal code")

    # geo ---------------------------------------------------------------------
    geo = kita.get("geo")
    if geo is not None:
        if check(isinstance(geo, dict), where, "geo must be null or an object"):
            lat, lon = geo.get("lat"), geo.get("lon")
            if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
                low, high = TICINO_BBOX["lat"]
                if not low <= lat <= high:
                    fail(where, f"geo.lat={lat} is outside Ticino ({low}-{high})")
                low, high = TICINO_BBOX["lon"]
                if not low <= lon <= high:
                    fail(where, f"geo.lon={lon} is outside Ticino ({low}-{high})")
            else:
                fail(where, "geo.lat/geo.lon must be numbers")
            if geo.get("precision") not in {"address", "street", "locality"}:
                fail(where, f"geo.precision must be address|street|locality (got {geo.get('precision')!r})")
            check_str(geo.get("geocoder"), where, "geo.geocoder", min_len=3)

    # contact -----------------------------------------------------------------
    contact = kita.get("contact")
    if check(isinstance(contact, dict), where, "contact must be an object"):
        check_str(contact.get("phone"), where, "contact.phone", nullable=True, pattern=PHONE_RE)
        check_str(contact.get("phone_alt"), where, "contact.phone_alt", nullable=True, pattern=PHONE_RE)
        check_str(contact.get("email"), where, "contact.email", nullable=True, pattern=EMAIL_RE)
        check_str(contact.get("website"), where, "contact.website", nullable=True, pattern=URL_RE)
        if not contact.get("phone") and not contact.get("email"):
            warn(where, "no phone and no email: the record cannot be contacted")

    # capacity ----------------------------------------------------------------
    capacity = kita.get("capacity")
    if capacity is not None:
        if not isinstance(capacity, int):
            fail(where, f"capacity must be an integer or null (got {type(capacity).__name__})")
        elif not 1 <= capacity <= 500:
            fail(where, f"capacity={capacity} is out of the plausible range 1-500")

    # age ---------------------------------------------------------------------
    age = kita.get("age")
    if check(isinstance(age, dict), where, "age must be an object"):
        low, high = age.get("min_months"), age.get("max_months")
        check_str(age.get("label"), where, "age.label", min_len=2)
        if isinstance(low, int) and isinstance(high, int):
            if not 0 <= low <= 84:
                fail(where, f"age.min_months={low} out of range 0-84")
            if not 1 <= high <= 96:
                fail(where, f"age.max_months={high} out of range 1-96")
            if low >= high:
                fail(where, f"age.min_months={low} must be < age.max_months={high}")
        else:
            fail(where, "age.min_months/age.max_months must be integers")

    # hours -------------------------------------------------------------------
    hours = kita.get("hours")
    if check(isinstance(hours, dict), where, "hours must be an object"):
        check_str(hours.get("label"), where, "hours.label", min_len=2)
        check_str(hours.get("open"), where, "hours.open", pattern=TIME_RE)
        check_str(hours.get("close"), where, "hours.close", pattern=TIME_RE)
        opened, closed = hours.get("open"), hours.get("close")
        if TIME_RE.match(str(opened)) and TIME_RE.match(str(closed)) and str(opened) >= str(closed):
            fail(where, f"hours.open={opened} must be before hours.close={closed}")
        days = hours.get("days")
        if not isinstance(days, list) or not days:
            fail(where, "hours.days must be a non-empty array")
        else:
            unknown = set(days) - VALID_DAYS
            if unknown:
                fail(where, f"hours.days contains invalid values: {sorted(unknown)}")
            if len(set(days)) != len(days):
                fail(where, "hours.days contains duplicates")
        check(isinstance(hours.get("continuous"), bool), where, "hours.continuous must be a boolean")

    # languages / sources -----------------------------------------------------
    languages = kita.get("languages")
    if not isinstance(languages, list) or not languages:
        fail(where, "languages must be a non-empty array")
    else:
        unknown = set(languages) - {"it", "en", "de", "fr"}
        if unknown:
            fail(where, f"languages contains invalid values: {sorted(unknown)}")

    sources = kita.get("sources")
    if not isinstance(sources, list) or not sources:
        fail(where, "sources must be a non-empty array")
    else:
        for sid in sources:
            if sid not in source_ids:
                fail(where, f"source {sid!r} is not declared in meta.sources")

    # meta-consistency: exactly the declared keys are allowed
    allowed = {
        "id", "name", "type", "operator", "comune", "zona", "in_city_of_lugano",
        "address", "geo", "contact", "capacity", "age", "hours", "closures",
        "languages", "notes", "sources",
    }
    extra = set(kita) - allowed
    if extra:
        fail(where, f"unexpected keys: {sorted(extra)}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verbose", action="store_true", help="print warnings in detail")
    args = parser.parse_args()

    if not DATA.exists():
        print(f"error: {DATA} not found", file=sys.stderr)
        return 1

    try:
        dataset = json.loads(DATA.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"error: {DATA.name} is not valid JSON: {exc}", file=sys.stderr)
        return 1

    if not isinstance(dataset, dict):
        print("error: the dataset root must be an object", file=sys.stderr)
        return 1

    if SCHEMA.exists():
        try:
            json.loads(SCHEMA.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            fail("data/kitas.schema.json", f"schema is not valid JSON: {exc}")
    else:
        warn("data/kitas.schema.json", "schema file not found")

    kitas = dataset.get("kitas")
    if not isinstance(kitas, list):
        print("error: 'kitas' must be an array", file=sys.stderr)
        return 1

    meta = dataset.get("meta") or {}
    source_ids = {s.get("id") for s in (meta.get("sources") or []) if isinstance(s, dict)}
    validate_meta(meta, kitas)

    seen_ids: set[str] = set()
    seen_names: dict[str, str] = {}
    for index, kita in enumerate(kitas):
        validate_kita(kita, index, source_ids)
        kid = kita.get("id")
        if kid in seen_ids:
            fail(f"kitas[{index}]", f"duplicate id {kid!r}")
        seen_ids.add(kid)
        name = (kita.get("name") or "").strip().lower()
        if name in seen_names:
            warn(f"kitas[{index}]", f"name {name!r} also used by {seen_names[name]!r}")
        seen_names[name] = kid

    with_geo = sum(1 for k in kitas if k.get("geo"))
    city = sum(1 for k in kitas if k.get("in_city_of_lugano"))
    public = sum(1 for k in kitas if k.get("type") == "pubblico")

    print(f"dataset : {DATA.relative_to(ROOT)}")
    print(f"records : {len(kitas)} ({public} pubblici, {len(kitas) - public} privati)")
    print(f"area    : {city} nella Città di Lugano, {len(kitas) - city} nell'agglomerato")
    print(f"geo     : {with_geo}/{len(kitas)} geocodificati")
    print(f"errors  : {len(errors)}")
    print(f"warnings: {len(warnings)}")

    if errors:
        print("\nERRORS")
        for item in errors:
            print(f"  ✗ {item}")
    if warnings and (args.verbose or errors):
        print("\nWARNINGS")
        for item in warnings:
            print(f"  ! {item}")
    elif warnings:
        print("\n(run with --verbose to list the warnings)")

    if errors:
        print("\nFAILED")
        return 1
    print("\nOK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
