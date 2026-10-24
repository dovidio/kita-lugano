/**
 * i18n.js — UI strings for KiTa Lugano.
 *
 * Only interface chrome is translated. The dataset itself (names, addresses,
 * notes, meta.title, meta.disclaimer, …) is shown as-is in both languages.
 *
 * Usage:  t(lang, 'search.label')            -> "Cerca"
 *         fmt(lang, 'meta.updated', {date})  -> "dati aggiornati al 5 ottobre 2026"
 */

export const DEFAULT_LANG = 'it';
export const LANGS = ['it', 'en'];

export const it = {
  'app.title': 'KiTa Lugano',
  'app.tagline': "Trova l'asilo nido (kita) adatto alla tua famiglia a Lugano e nell'agglomerato.",
  'app.skipToContent': 'Vai ai risultati',

  'lang.label': 'Lingua',
  'lang.it': 'Italiano',
  'lang.en': 'Inglese',

  'meta.updated': 'dati aggiornati al {date}',
  'meta.disclaimer': 'Avviso e fonti',
  'meta.sources': 'Fonti dei dati',
  'meta.retrieved': 'rilevato il {date}',
  'meta.schema': 'Versione schema {version}',

  'export.json': 'Scarica JSON',
  'export.csv': 'Esporta CSV',
  'export.csvEmpty': 'Nessun risultato da esportare.',

  'search.label': 'Cerca',
  'search.placeholder': 'Nome, gestore, comune, zona, indirizzo, note…',

  'filters.legend': 'Filtri e ricerca',
  'filters.reset': 'Azzera filtri',

  'filter.type': 'Tipo di struttura',
  'filter.type.all': 'Tutti',
  'filter.type.pubblico': 'Pubblico',
  'filter.type.privato': 'Privato',

  'filter.area': 'Zona',
  'filter.area.all': "Tutto l'agglomerato",
  'filter.area.city': 'Solo Città di Lugano',

  'filter.age': "Età del bambino",
  'filter.age.unit': 'mesi',
  'filter.age.placeholder': 'es. 18',
  'filter.age.presets': 'Età rapide',
  'filter.age.any': 'Qualsiasi età',
  'filter.age.hint': 'Mostra solo le strutture che accolgono un bambino di {n} mesi.',

  'filter.capacity': 'Posti minimi',
  'filter.capacity.placeholder': 'nessun minimo',
  'filter.capacity.hint': 'Le strutture con posti non dichiarati restano visibili solo se non imposti un minimo.',

  'filter.languages': 'Lingue',
  'filter.languages.italianOnly': 'solo italiano',

  'filter.openNow': 'Aperto adesso',
  'filter.openNow.title': "Tieni solo le strutture aperte in questo momento (ora locale di Lugano).",
  'filter.openNow.disabled': "Adesso nessuna struttura è aperta: il filtro «aperto adesso» non è applicabile.",
  'filter.hoursCaveat': 'Orari indicativi: le chiusure (festivi, vacanze) non sono considerate.',

  'sort.label': 'Ordina per',
  'sort.name': 'Nome (A–Z)',
  'sort.capacity': 'Posti (dal più alto)',
  'sort.distance': 'Distanza da me',
  'sort.needPosition': 'Per ordinare per distanza attiva prima la tua posizione.',

  'geo.use': 'Usa la mia posizione',
  'geo.locating': 'Rilevo la posizione…',
  'geo.active': 'Distanze calcolate dalla tua posizione.',
  'geo.denied': 'Permesso di geolocalizzazione negato. Ordino per nome.',
  'geo.timeout': 'Tempo scaduto nel rilevamento della posizione. Ordino per nome.',
  'geo.unavailable': 'Posizione non disponibile. Ordino per nome.',
  'geo.unsupported': 'Questo browser non supporta la geolocalizzazione.',
  'geo.clear': 'Rimuovi posizione',

  'distance.km': '{km} km',
  'distance.m': '{m} m',

  'results.countOne': '1 struttura',
  'results.countMany': '{n} strutture',
  'results.ofTotal': 'su {total}',
  'results.title': 'Risultati',
  'results.none.title': 'Nessuna struttura trovata',
  'results.none.body': 'Prova a togliere qualche filtro o a cambiare i termini di ricerca.',
  'results.none.action': 'Azzera filtri',
  'results.summary': '{n} strutture trovate su {total}.',

  'card.details': 'Dettagli',
  'card.collapse': 'Chiudi dettagli',
  'card.showOnMap': 'Mostra sulla mappa',
  'card.positionMissing': 'posizione non disponibile',
  'card.capacity': '{n} posti',
  'card.capacityUnknown': 'posti n.d.',
  'card.hint': "Premi Invio per mostrare la struttura sulla mappa, o «{details}» per tutti i dati.",

  'detail.id': 'ID scheda',
  'detail.operator': 'Gestore',
  'detail.address': 'Indirizzo',
  'detail.comune': 'Comune',
  'detail.zona': 'Quartiere',
  'detail.capacity': 'Posti',
  'detail.age': 'Età accolta',
  'detail.hours': 'Orario',
  'detail.closures': 'Chiusure',
  'detail.languages': 'Lingue',
  'detail.notes': 'Note',
  'detail.contact': 'Contatti',
  'detail.sources': 'Fonti',
  'detail.geo': 'Coordinate',
  'detail.geoAccuracy': 'Precisione: {value}',
  'detail.geocoder': 'Geocoder: {value}',
  'detail.call': 'Chiama',
  'detail.mailto': 'Email',
  'detail.website': 'Sito web',
  'detail.openInMap': 'Apri in mappa',
  'detail.googleMaps': 'Google Maps',
  'detail.appleMaps': 'Apple Maps',
  'detail.notAvailable': 'non disponibile',
  'detail.distance': 'Distanza da te',
  'detail.unknownCapacity': 'non indicati',

  'map.title': 'Mappa',
  'map.toggleList': 'Lista',
  'map.toggleMap': 'Mappa',
  'map.legend': 'Legenda',
  'map.empty': 'Nessuna struttura con coordinate in questa selezione.',
  'map.unavailable': 'Mappa non disponibile: la libreria Leaflet non è stata caricata. I dati restano consultabili in elenco.',
  'map.tilesError': 'Le mappe di OpenStreetMap non si caricano (forse sei offline). L’elenco resta completo.',
  'map.openDetail': 'Apri la scheda',
  'map.zoomTo': 'Vai alla struttura sulla mappa',

  'loading': 'Carico i dati…',
  'error.title': 'Impossibile caricare i dati',
  'error.body': 'Non riesco a leggere l’elenco delle strutture ({reason}). Controlla la connessione e riprova.',
  'error.reason.fetch': 'il file dati non risponde',
  'error.reason.json': 'il file dati non è JSON valido',
  'error.reason.shape': 'il file dati non contiene l’elenco delle strutture',
  'error.retry': 'Riprova',
  'footer.dataSource': 'Dati pubblici della Città di Lugano e LIS.',
  'footer.source': 'Codice e dati su GitHub',
  'footer.contribute': 'Manca una struttura o un dato non è corretto?',
  'footer.contributeLink': 'Segnala o proponi una modifica',
};

export const en = {
  'app.title': 'KiTa Lugano',
  'app.tagline': 'Find the right nursery (kita) for your family in Lugano and its surrounding area.',
  'app.skipToContent': 'Skip to results',

  'lang.label': 'Language',
  'lang.it': 'Italian',
  'lang.en': 'English',

  'meta.updated': 'data updated on {date}',
  'meta.disclaimer': 'Disclaimer and sources',
  'meta.sources': 'Data sources',
  'meta.retrieved': 'retrieved on {date}',
  'meta.schema': 'Schema version {version}',

  'export.json': 'Download JSON',
  'export.csv': 'Export CSV',
  'export.csvEmpty': 'Nothing to export.',

  'search.label': 'Search',
  'search.placeholder': 'Name, operator, municipality, district, address, notes…',

  'filters.legend': 'Filters and search',
  'filters.reset': 'Reset filters',

  'filter.type': 'Facility type',
  'filter.type.all': 'All',
  'filter.type.pubblico': 'Public',
  'filter.type.privato': 'Private',

  'filter.area': 'Area',
  'filter.area.all': 'Whole agglomeration',
  'filter.area.city': 'City of Lugano only',

  'filter.age': 'Child’s age',
  'filter.age.unit': 'months',
  'filter.age.placeholder': 'e.g. 18',
  'filter.age.presets': 'Quick ages',
  'filter.age.any': 'Any age',
  'filter.age.hint': 'Only facilities that accept a child of {n} months.',

  'filter.capacity': 'Minimum places',
  'filter.capacity.placeholder': 'no minimum',
  'filter.capacity.hint': 'Facilities with unknown capacity stay visible only while no minimum is set.',

  'filter.languages': 'Languages',
  'filter.languages.italianOnly': 'Italian only',

  'filter.openNow': 'Open now',
  'filter.openNow.title': 'Keep only facilities open right now (Lugano local time).',
  'filter.openNow.disabled': 'No facility is open right now, so the “open now” filter cannot be applied.',
  'filter.hoursCaveat': 'Hours are indicative: closures (holidays, vacations) are not taken into account.',

  'sort.label': 'Sort by',
  'sort.name': 'Name (A–Z)',
  'sort.capacity': 'Places (highest first)',
  'sort.distance': 'Distance from me',
  'sort.needPosition': 'Enable your position first to sort by distance.',

  'geo.use': 'Use my position',
  'geo.locating': 'Locating…',
  'geo.active': 'Distances are measured from your position.',
  'geo.denied': 'Location permission denied. Sorting by name.',
  'geo.timeout': 'Locating timed out. Sorting by name.',
  'geo.unavailable': 'Position unavailable. Sorting by name.',
  'geo.unsupported': 'This browser does not support geolocation.',
  'geo.clear': 'Clear position',

  'distance.km': '{km} km',
  'distance.m': '{m} m',

  'results.countOne': '1 facility',
  'results.countMany': '{n} facilities',
  'results.ofTotal': 'of {total}',
  'results.title': 'Results',
  'results.none.title': 'No facility found',
  'results.none.body': 'Try removing a filter or changing your search terms.',
  'results.none.action': 'Reset filters',
  'results.summary': '{n} of {total} facilities shown.',

  'card.details': 'Details',
  'card.collapse': 'Hide details',
  'card.showOnMap': 'Show on map',
  'card.positionMissing': 'position not available',
  'card.capacity': '{n} places',
  'card.capacityUnknown': 'places n/a',
  'card.hint': 'Press Enter to show the facility on the map, or “{details}” for all data.',

  'detail.id': 'Record ID',
  'detail.operator': 'Operator',
  'detail.address': 'Address',
  'detail.comune': 'Municipality',
  'detail.zona': 'District',
  'detail.capacity': 'Places',
  'detail.age': 'Ages accepted',
  'detail.hours': 'Opening hours',
  'detail.closures': 'Closures',
  'detail.languages': 'Languages',
  'detail.notes': 'Notes',
  'detail.contact': 'Contact',
  'detail.sources': 'Sources',
  'detail.geo': 'Coordinates',
  'detail.geoAccuracy': 'Accuracy: {value}',
  'detail.geocoder': 'Geocoder: {value}',
  'detail.call': 'Call',
  'detail.mailto': 'Email',
  'detail.website': 'Website',
  'detail.openInMap': 'Open in maps',
  'detail.googleMaps': 'Google Maps',
  'detail.appleMaps': 'Apple Maps',
  'detail.notAvailable': 'not available',
  'detail.distance': 'Distance from you',
  'detail.unknownCapacity': 'not stated',

  'map.title': 'Map',
  'map.toggleList': 'List',
  'map.toggleMap': 'Map',
  'map.legend': 'Legend',
  'map.empty': 'No facility with coordinates in the current selection.',
  'map.unavailable': 'Map unavailable: the Leaflet library did not load. All data is still available in the list.',
  'map.tilesError': 'OpenStreetMap tiles cannot be loaded (maybe you are offline). The list is complete anyway.',
  'map.openDetail': 'Open details',
  'map.zoomTo': 'Go to this facility on the map',

  'loading': 'Loading data…',
  'error.title': 'Could not load the data',
  'error.body': 'I cannot read the facility list ({reason}). Check your connection and try again.',
  'error.reason.fetch': 'the data file is not responding',
  'error.reason.json': 'the data file is not valid JSON',
  'error.reason.shape': 'the data file has no facility list',
  'error.retry': 'Try again',
  'footer.dataSource': 'Public data from the City of Lugano and LIS.',
  'footer.source': 'Code and data on GitHub',
  'footer.contribute': 'Is a facility missing or a detail wrong?',
  'footer.contributeLink': 'Report or suggest a change',
};

const DICTS = { it, en };

/** Translate `key`; falls back to Italian, then to the key itself. */
export function t(lang, key) {
  const dict = DICTS[lang] ?? DICTS[DEFAULT_LANG];
  return dict[key] ?? DICTS[DEFAULT_LANG][key] ?? key;
}

/** Translate `key` and replace `{placeholders}` with values from `params`. */
export function fmt(lang, key, params = {}) {
  return t(lang, key).replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

/** Pick the singular/plural key that fits `n` and fill in its `{n}` placeholder. */
export function plural(lang, n, oneKey, manyKey) {
  return fmt(lang, n === 1 ? oneKey : manyKey, { n });
}
