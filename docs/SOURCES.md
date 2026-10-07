# Fonti dei dati

Tutti i dati in `data/kitas.json` provengono da fonti ufficiali pubbliche. Nessun
dato è inventato o stimato: dove una informazione non era disponibile, il campo è
`null` e l'interfaccia lo mostra come “n.d.”.

## Fonti utilizzate

| id | Fonte | Editore | URL | Consultata |
|----|-------|---------|-----|------------|
| `lugano-nidi-privati` | Nidi privati | Città di Lugano | https://www.lugano.ch/temi-servizi/sociale/famiglie-ragazzi/nidi-infanzia/nidi-privati/ | 2026-10-05 |
| `lugano-nidi-pubblici` | Nidi d'infanzia (LIS) | Città di Lugano | https://www.lugano.ch/temi-servizi/sociale/famiglie-ragazzi/nidi-infanzia.html | 2026-10-05 |
| `guida-2024` | Guida «Diventare mamma e papà» 2024, sezione 2.2 *I nidi d'infanzia* (pagg. 39–47) | Città di Lugano | https://www.lugano.ch/dam/jcr:ea1efcca-e240-4c2f-8376-37c29611c615/Guida_DiventareMammaePapa_2024.pdf | 2026-10-05 |
| `lis` | Ente autonomo LIS — Lugano Istituti Sociali | LIS | https://www.lugano-lis.ch | 2026-10-05 |

Nello specifico:

- **Nidi pubblici** (Baroffio, Molino Nuovo, Ronchetto, Polis): schede della Città
  di Lugano + tabella della guida 2024. I quattro nidi sono gestiti dall'ente
  autonomo LIS e riconosciuti dalla legge cantonale LFam.
- **Nidi privati**: elenco ufficiale della Città di Lugano, arricchito con la
  tabella della guida 2024 (capienza, età, orari, chiusure, email e siti web).
- Le email dei nidi pubblici erano offuscate anti-spam nella pagina HTML
  (`data-cfemail`) e sono state decodificate.

## Geocodifica

Le coordinate non sono fornite dalle fonti: sono state ricavate dagli indirizzi
con il geocoder ufficiale della Confederazione, **swisstopo / geo.admin.ch**
(`api3.geo.admin.ch/rest/services/api/SearchServer`), e salvate in
`data/raw/geocode-cache.json`.

Ogni record ha un campo `geo.precision`:

| precisione | significato | n. record |
|-----------|-------------|-----------|
| `address` | numero civico riconosciuto | 26 |
| `street`  | solo la via (nessun numero civico trovato) | 2 (`il-cactus`, `rsi-oasi-della-gioia`) |
| `locality`| solo il comune (via non trovata) | 2 (`girotondo-cagiallo`, `mini-centro-grancia`) |

Il geocoder restituisce sempre *qualcosa*: `scripts/geocode.py` verifica che
tutti i token distintivi della via richiesta compaiano nel risultato. Senza questo
controllo, per esempio, «Via Pian Scairolo, 6916 Grancia» (che non esiste nel
database) veniva risolto silenziosamente su «Via alla Piana, 6916 Grancia», cioè
una via diversa. In quel caso il record viene declassato a `locality`.

## Snapshot grezzi

I file scaricati sono conservati in `data/raw/` per tracciabilità:

- `nidi-infanzia-overview.html`, `nido-*.html` — pagine lugano.ch
- `guida-diventare-mamma-papa-2024.pdf`, `guida-2024.txt` — guida e sua estrazione testuale
- `geocode-cache.json` — cache delle risposte del geocoder

## Cosa NON è (ancora) incluso

- **Scuole dell'infanzia** (3–6 anni, sistema scolastico): sono un servizio
  diverso dai nidi.
- **Centri di socializzazione** e **famiglie diurne** citati nella guida 2024
  (sezione 2.5): non sono nidi d'infanzia.
- **Micro-nidi** privati non elencati dalla Città di Lugano.
- **Rette in cifre**: la Città di Lugano e le strutture private non pubblicano
  importi fissi (dipendono dal reddito), quindi nel dataset non c'è nessun prezzo.
  Vedi invece `docs/FINANZIAMENTI.md` per gli aiuti cantonali.

## Come aggiornare

```bash
python3 scripts/geocode.py --refresh   # ri-geocodifica tutto
python3 scripts/validate.py --verbose  # controlla il dataset
```

Per aggiornare i dati veri e propri: ricontrollare le pagine in tabella, aggiornare
`data/kitas.json`, aggiornare `meta.data_version` e `meta.sources[].retrieved`,
poi rilanciare validazione e geocodifica.
