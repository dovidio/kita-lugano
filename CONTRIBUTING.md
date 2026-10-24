# Contributing

Thanks for helping keep this list accurate. The most valuable contributions are
**data corrections**: a Kita that closed, changed its opening hours, moved, or
opened somewhere new.

> **In breve (IT):** apri una *issue* con uno dei moduli (non serve saper
> programmare); oppure modifica `data/kitas.json` e apri una pull request dopo
> aver eseguito `npm run check` e `npm run smoke`. Ogni dato deve avere una fonte
> ufficiale e i campi sconosciuti restano `null`, mai stimati.

---

## 1. The easy way: open an issue

No Git or JSON knowledge needed:

- **[Aggiungi una struttura](https://github.com/dovidio/kita-lugano/issues/new?template=add-kita.yml)** — a Kita that is missing.
- **[Correggi un dato](https://github.com/dovidio/kita-lugano/issues/new?template=data-correction.yml)** — something is wrong or outdated.

Both forms ask for an **official source link**. A maintainer will turn your report
into a data change and credit you in the commit.

## 2. The direct way: edit the dataset

### Ground rules

1. **Official sources only.** The City of Lugano, LIS, the facility's own website,
   a cantonal publication. No forums, no aggregators, no "a friend told me".
2. **Never guess.** If a value is not published, it stays `null`. A `null` renders
   as "n.d." and is honest; an invented number is a bug.
3. **One record = one facility.** Do not merge two sites of the same operator.
4. **Ids are forever.** `id` is a slug used in URLs and in the CSV export. Adding a
   new record is fine; renaming an existing `id` breaks links. If a facility
   changes name, keep the id and update `name`.
5. **Contacts must already be public.** Only copy phone/email that the City, the
   operator or the facility itself publishes. Do not add a private individual's
   contact details.

### Adding a facility

Edit `data/kitas.json` and append an object to `kitas`:

```jsonc
{
  "id": "nido-esempio",                 // lowercase slug, unique, never reused
  "name": "Nido d'infanzia Esempio",
  "type": "privato",                    // "pubblico" | "privato"
  "operator": "Associazione Esempio",   // or null
  "comune": "Lugano",                   // political municipality
  "zona": "Pregassona",                 // neighbourhood, or null
  "in_city_of_lugano": true,            // must be true iff comune == "Lugano"
  "address": {
    "street": "Via Esempio 1",          // or null if unpublished
    "postal_code": "6963",
    "locality": "Pregassona",
    "full": "Via Esempio 1, 6963 Pregassona"
  },
  "geo": null,                          // filled by the geocoder, see below
  "contact": {
    "phone": "+41 91 000 00 00",        // +41 … format, or null
    "email": "info@example.ch",         // or null
    "website": "https://example.ch"     // or null
  },
  "capacity": 24,                       // integer, or null if unknown
  "age": { "min_months": 3, "max_months": 48, "label": "3 mesi – 4 anni" },
  "hours": {
    "label": "lu–ve 07:30–18:30",
    "open": "07:30",
    "close": "18:30",
    "days": ["mo", "tu", "we", "th", "fr"],
    "continuous": true
  },
  "closures": "2 settimane a Natale",   // or null
  "languages": ["it"],                  // "it" | "en" | "de" | "fr"
  "notes": null,
  "sources": ["guida-2024"]             // ids from meta.sources
}
```

Then:

```bash
# 1. add the source you used to meta.sources (if it is new)
# 2. bump meta.data_version (today's date) and meta.count
# 3. resolve coordinates
npm run geocode

# 4. check everything
npm run check
npm run smoke
```

`npm run geocode` writes `geo` for you. Leave `geo: null` in your commit and let the
script fill it — do not hand-write coordinates.

### Precision is part of the data

`geo.precision` records how good the position is:

| value | meaning |
|---|---|
| `address` | house number resolved exactly |
| `street` | only the road was found |
| `locality` | only the municipality; the map pin is approximate |

Do not "upgrade" a precision by hand. If the geocoder cannot find the street, say so
in `notes` — like `mini-centro-grancia`, where the guide's address does not exist in
the official address register.

### Correcting a facility

Prefer the smallest possible diff. Update `sources[].retrieved` only when you
actually re-checked the source. If a facility closes permanently, remove the record
**and** decrement `meta.count`; mention the closure in the PR so it is traceable.

## 3. Code contributions

The app is dependency-free: vanilla ES modules, vendored Leaflet, Node built-ins for
the server, Python for the data scripts. No build step, no framework.

```bash
npm run serve     # http://127.0.0.1:8787/
npm run check     # dataset validation + IT/EN dictionaries + server syntax
npm run smoke     # boots the server and exercises API, filters, assets
```

Guidelines:

- **No new runtime dependencies.** If you think one is unavoidable, open an issue first.
- **No build step.** Files in the repo are the files served.
- **Treat dataset text as untrusted**: build DOM with `textContent` (see `el()` in
  `app.js`), never `innerHTML`, and route links through `safeUrl()`.
- **Keep IT and EN in sync** — `npm run check` fails if the dictionaries diverge.
- **Mobile first**: the list/map panes must keep working at 360 px wide.
- **Accessibility**: labels tied to inputs, `aria-live` on the result count,
  keyboard-operable cards, visible focus rings.

## What CI runs

Every push and pull request runs `.github/workflows/validate.yml`:

1. `python3 scripts/validate.py --verbose` — schema and domain invariants
2. `node scripts/check-i18n.mjs` — IT/EN key parity
3. `node --check server/server.mjs`
4. `bash scripts/smoke.sh` — end-to-end against a real server

A PR that changes `data/kitas.json` is not mergeable until CI is green **and** a
maintainer has opened the cited source.

## Review and credit

Data changes are reviewed against the cited source, not against "common knowledge".
Contributors are credited in the commit message (`Co-authored-by:`), and the dataset
keeps a single `meta.data_version` — there is no per-record history in the JSON, so
the git log is the audit trail.

## Code of conduct

Be decent. This is a volunteer-maintained list about childcare; disagreements about
a record should be settled by citing a source, not by winning an argument.
