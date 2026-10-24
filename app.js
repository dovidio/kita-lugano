/**
 * app.js — KiTa Lugano
 *
 * A dependency-free frontend (Leaflet is vendored, everything else is vanilla ES2022):
 *   data loading → filters/search → sortable list → Leaflet map → detail panels.
 *
 * Conventions
 *  - All dataset values are treated as UNTRUSTED: DOM is built with createElement /
 *    textContent only, links go through safeUrl()/telHref()/mailtoHref().
 *  - `geo: null` is a first-class case everywhere (list keeps the record, map skips it,
 *    distance sorting excludes it, map links fall back to the address text).
 */

import { t, fmt, plural, DEFAULT_LANG, LANGS } from './i18n.js';

// Relative so the app works both at the domain root and under a GitHub Pages
// project path (https://<user>.github.io/kita-lugano/).
const DATA_URL = 'data/kitas.json';
const LUGANO_CENTER = [46.005, 8.951];
const LUGANO_ZOOM = 13;
const TZ = 'Europe/Zurich';
const LANG_KEY = 'kita-lugano:lang';
const DAY_KEYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
const WD_MAP = { Sun: 'su', Mon: 'mo', Tue: 'tu', Wed: 'we', Thu: 'th', Fri: 'fr', Sat: 'sa' };
const AGE_PRESETS = [6, 12, 18, 24, 36, 48];
const SVG_NS = 'http://www.w3.org/2000/svg';

/* ── State ──────────────────────────────────────────────────────────── */

const state = {
  lang: DEFAULT_LANG,
  meta: null,
  kitas: [],
  byId: new Map(),
  visible: [],
  errorReason: null,
  // filters
  query: '',
  type: 'all',
  area: 'all',
  ageMonths: null,
  minCapacity: null,
  italianOnly: false,
  openNow: false,
  // presentation
  sort: 'name',
  userPos: null,        // { lat, lon } — only ever the real device position
  geoStatusKey: null,   // i18n key of the geolocation message currently shown
  selectedId: null,
  expandedId: null,
};

const refs = {};
let map = null;
let markerLayer = null;
const markers = new Map();
let mapBroken = false;
let tilesWarned = false;
let fitTimer = null;
let pendingFocusId = null;

/* ── Tiny DOM helpers ───────────────────────────────────────────────── */

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return node;
}

const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };
const byId = (id) => state.byId.get(id) ?? null;

const ICONS = {
  clock: ['M12 7.5v4.7l3 1.8', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'],
  users: ['M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1', 'M9.5 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M21 20v-1a4 4 0 0 0-3-3.9', 'M16.5 4.4a3.5 3.5 0 0 1 0 6.4'],
  pin: ['M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z', 'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  child: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M9.2 10h.01', 'M14.8 10h.01', 'M8.6 14.4a4.6 4.6 0 0 0 6.8 0'],
  ruler: ['M3 15.5 15.5 3l5.5 5.5L8.5 21z', 'M7 11l2 2', 'M10.5 7.5l2 2', 'M14 4l2 2'],
};

function icon(name, cls = 'ico') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', cls);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of ICONS[name] ?? []) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

const debounce = (fn, ms) => {
  let id = 0;
  return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
};

/* ── Values: normalisation, links, formatting ───────────────────────── */

/** Lowercase + strip diacritics, so "citta" matches "Città" and "kiocciola" "Kiocciola". */
const norm = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLowerCase();

const isText = (v) => typeof v === 'string' && v.trim() !== '';

/** Only http(s) links from the dataset are ever rendered as href. */
function safeUrl(raw) {
  if (!isText(raw)) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

const telHref = (phone) => (isText(phone) ? `tel:${phone.replace(/[^\d+]/g, '')}` : null);
const mailtoHref = (email) => (isText(email) && !/[?\s]/.test(email) ? `mailto:${email.trim()}` : null);

const nf0 = new Intl.NumberFormat(DEFAULT_LANG);
const nf1 = new Intl.NumberFormat(DEFAULT_LANG, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const locale = () => (state.lang === 'it' ? 'it-CH' : 'en-GB');
const num = (n) => new Intl.NumberFormat(locale()).format(n);

/** "2026-10-05" → "5 ottobre 2026" (UTC-parsed on purpose: no timezone drift). */
function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return String(iso ?? '');
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat(locale(), { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

/** Metres below 1 km, one decimal above. */
function fmtDistance(km) {
  if (typeof km !== 'number' || !Number.isFinite(km)) return null;
  if (km < 1) return fmt(state.lang, 'distance.m', { m: nf0.format(Math.round((km * 1000) / 10) * 10) });
  return fmt(state.lang, 'distance.km', { km: nf1.format(km) });
}

function haversineKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const hasGeo = (k) => !!k?.geo && typeof k.geo.lat === 'number' && typeof k.geo.lon === 'number';

/** Distance in km from the user, or null when unknown (no position / no geo). */
function distanceFor(k) {
  if (!state.userPos || !hasGeo(k)) return null;
  return haversineKm(state.userPos, { lat: k.geo.lat, lon: k.geo.lon });
}

const capacityText = (k) => (typeof k.capacity === 'number'
  ? fmt(state.lang, 'card.capacity', { n: num(k.capacity) })
  : t(state.lang, 'card.capacityUnknown'));

/* ── Opening hours in Europe/Zurich ─────────────────────────────────── */

/** Current Lugano wall-clock time as { dayKey, hhmm, minutes }. */
function zurichNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  const hh = get('hour').padStart(2, '0');
  const mm = get('minute').padStart(2, '0');
  return { dayKey: WD_MAP[get('weekday')] ?? null, hhmm: `${hh}:${mm}`, minutes: Number(hh) * 60 + Number(mm) };
}

const isTime = (v) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

function isOpenAt(k, now) {
  const h = k.hours;
  if (!h || !isTime(h.open) || !isTime(h.close) || !Array.isArray(h.days)) return false;
  if (!h.days.includes(now.dayKey)) return false;
  return h.open <= now.hhmm && now.hhmm < h.close;   // "HH:MM" compares correctly as string
}

const anyKitaOpenNow = (now) => state.kitas.some((k) => isOpenAt(k, now));

/* ── i18n plumbing ──────────────────────────────────────────────────── */

function applyStaticI18n() {
  document.documentElement.lang = state.lang;
  for (const n of document.querySelectorAll('[data-i18n]')) n.textContent = t(state.lang, n.dataset.i18n);
  for (const n of document.querySelectorAll('[data-i18n-placeholder]')) n.placeholder = t(state.lang, n.dataset.i18nPlaceholder);
  for (const n of document.querySelectorAll('[data-i18n-title]')) n.title = t(state.lang, n.dataset.i18nTitle);
  for (const n of document.querySelectorAll('[data-i18n-aria]')) n.setAttribute('aria-label', t(state.lang, n.dataset.i18nAria));
  refs.agePresets.setAttribute('aria-label', t(state.lang, 'filter.age.presets'));
  renderAgePresets();
  renderMeta();
}

function setLang(lang) {
  state.lang = LANGS.includes(lang) ? lang : DEFAULT_LANG;
  try { localStorage.setItem(LANG_KEY, state.lang); } catch { /* private mode: ignore */ }
  for (const btn of refs.langBtns) btn.setAttribute('aria-pressed', String(btn.dataset.lang === state.lang));
  applyStaticI18n();
  if (state.geoStatusKey) setGeoStatusKey(state.geoStatusKey);
  if (state.errorReason) showError();
  else render();
}

function renderAgePresets() {
  clear(refs.agePresets);
  const chip = (label, age) => el('button', {
    type: 'button',
    dataset: { age: age == null ? 'any' : String(age) },
    'aria-pressed': String(state.ageMonths === age),
    text: label,
  });
  refs.agePresets.append(chip(t(state.lang, 'filter.age.any'), null));
  for (const age of AGE_PRESETS) refs.agePresets.append(chip(String(age), age));
}

function syncAgeChips() {
  for (const btn of refs.agePresets.querySelectorAll('button')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.age === String(state.ageMonths ?? 'any')));
  }
  refs.ageHint.textContent = state.ageMonths == null
    ? ''
    : fmt(state.lang, 'filter.age.hint', { n: state.ageMonths });
}

/* ── Data loading ───────────────────────────────────────────────────── */

async function loadData() {
  refs.loading.hidden = false;
  refs.errorPanel.hidden = true;
  refs.empty.hidden = true;
  state.errorReason = null;

  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw reason('fetch');
    let json;
    try { json = await res.json(); } catch { throw reason('json'); }
    if (!json || !Array.isArray(json.kitas)) throw reason('shape');

    state.meta = json.meta ?? null;
    state.kitas = json.kitas.filter((k) => k && typeof k.id === 'string');
    state.byId = new Map(state.kitas.map((k) => [k.id, k]));
    markers.clear();
    if (markerLayer) markerLayer.clearLayers();

    applyStaticI18n();
    render();
  } catch (err) {
    state.kitas = [];
    state.byId = new Map();
    state.visible = [];
    state.errorReason = err?.kitaReason ?? 'fetch';
    showError();
  } finally {
    refs.loading.hidden = true;
  }
}

function reason(kitaReason) {
  const err = new Error(kitaReason);
  err.kitaReason = kitaReason;
  return err;
}

function showError() {
  clear(refs.results);
  refs.count.textContent = '';
  refs.empty.hidden = true;
  refs.errorBody.textContent = fmt(state.lang, 'error.body', {
    reason: t(state.lang, `error.reason.${state.errorReason ?? 'fetch'}`),
  });
  refs.errorPanel.hidden = false;
}

function renderMeta() {
  const meta = state.meta;
  refs.dataVersion.textContent = meta?.data_version
    ? fmt(state.lang, 'meta.updated', { date: fmtDate(meta.data_version) })
    : '';
  refs.disclaimerText.textContent = isText(meta?.disclaimer) ? meta.disclaimer : '';
  refs.schemaVersion.textContent = isText(meta?.schema_version)
    ? fmt(state.lang, 'meta.schema', { version: meta.schema_version })
    : '';

  clear(refs.sources);
  for (const src of Array.isArray(meta?.sources) ? meta.sources : []) {
    const url = safeUrl(src?.url);
    const label = isText(src?.label) ? src.label : (url ?? '');
    if (!label) continue;
    const parts = [];
    if (url) parts.push(el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: label }));
    else parts.push(document.createTextNode(label));
    if (isText(src?.publisher)) parts.push(document.createTextNode(` — ${src.publisher}`));
    if (isText(src?.retrieved)) parts.push(document.createTextNode(` (${fmt(state.lang, 'meta.retrieved', { date: fmtDate(src.retrieved) })})`));
    refs.sources.append(el('li', {}, ...parts));
  }
}

/* ── Filtering & sorting ────────────────────────────────────────────── */

const haystacks = new Map();

function haystackFor(k) {
  let hay = haystacks.get(k.id);
  if (hay == null) {
    hay = norm([
      k.name, k.operator, k.comune, k.zona, k.address?.street, k.address?.locality,
      k.address?.full, k.address?.postal_code, k.notes,
    ].filter(isText).join(' | '));
    haystacks.set(k.id, hay);
  }
  return hay;
}

function applyFilters(list, now) {
  const tokens = norm(state.query.trim()).split(/\s+/).filter(Boolean);
  return list.filter((k) => {
    if (tokens.length && !tokens.every((token) => haystackFor(k).includes(token))) return false;
    if (state.type !== 'all' && k.type !== state.type) return false;
    if (state.area === 'city' && k.in_city_of_lugano !== true) return false;

    if (state.ageMonths != null) {
      const { min_months: min, max_months: max } = k.age ?? {};
      if (typeof min !== 'number' || typeof max !== 'number') return false;
      if (!(min <= state.ageMonths && state.ageMonths <= max)) return false;
    }
    // Unknown capacity is only kept while no minimum is requested.
    if (state.minCapacity != null
      && (typeof k.capacity !== 'number' || k.capacity < state.minCapacity)) return false;

    if (state.italianOnly) {
      const langs = Array.isArray(k.languages) ? k.languages : [];
      if (!(langs.length === 1 && langs[0] === 'it')) return false;
    }
    if (state.openNow && !isOpenAt(k, now)) return false;
    return true;
  });
}

function sortRecords(list) {
  const collator = new Intl.Collator(locale(), { sensitivity: 'base', numeric: true });
  const byName = (a, b) => collator.compare(a?.name ?? '', b?.name ?? '');
  const places = (k) => (typeof k.capacity === 'number' ? k.capacity : Number.NEGATIVE_INFINITY);
  const distance = (k) => distanceFor(k) ?? Number.POSITIVE_INFINITY;

  const out = [...list];
  if (state.sort === 'capacity') return out.sort((a, b) => places(b) - places(a) || byName(a, b));
  if (state.sort === 'distance' && state.userPos) return out.sort((a, b) => distance(a) - distance(b) || byName(a, b));
  // "distance" without a position falls back to A–Z (the UI explains why).
  return out.sort(byName);
}

function currentRecords() {
  return sortRecords(applyFilters(state.kitas, zurichNow()));
}

/* ── Rendering: results head, list, cards ───────────────────────────── */

function render() {
  const now = zurichNow();
  syncOpenNow(now);
  refs.geoBtn.textContent = state.userPos ? t(state.lang, 'geo.clear') : t(state.lang, 'geo.use');

  if (!state.kitas.length) return;

  // A selected record that got filtered away can no longer stay selected.
  const records = sortRecords(applyFilters(state.kitas, now));
  state.visible = records;
  if (state.selectedId && !records.some((k) => k.id === state.selectedId)) state.selectedId = null;
  if (state.expandedId && !records.some((k) => k.id === state.expandedId)) state.expandedId = null;

  const total = state.kitas.length;
  refs.count.textContent = `${plural(state.lang, records.length, 'results.countOne', 'results.countMany')} ${fmt(state.lang, 'results.ofTotal', { total })}`;
  refs.count.setAttribute('aria-label', fmt(state.lang, 'results.summary', { n: records.length, total }));

  refs.empty.hidden = records.length > 0;
  renderList(records);
  renderMap(records);
}

function renderList(records) {
  const frag = document.createDocumentFragment();
  for (const k of records) frag.append(cardFor(k));
  clear(refs.results);
  refs.results.append(frag);
}

function cardFor(k) {
  const selected = state.selectedId === k.id;
  const expanded = state.expandedId === k.id;
  const titleId = `ttl-${k.id}`;
  const hintId = `hint-${k.id}`;

  const badge = el('span', {
    class: `badge badge--${k.type === 'pubblico' ? 'pubblico' : 'privato'}`,
    text: t(state.lang, `filter.type.${k.type === 'pubblico' ? 'pubblico' : 'privato'}`),
  });

  const meta = el('ul', { class: 'card__meta' });
  if (isText(k.hours?.label)) meta.append(el('li', {}, icon('clock'), el('span', { text: k.hours.label })));
  if (isText(k.age?.label)) meta.append(el('li', {}, icon('child'), el('span', { text: k.age.label })));
  meta.append(el('li', {}, icon('users'), el('span', { text: capacityText(k) })));
  const km = distanceFor(k);
  if (km != null) meta.append(el('li', {}, icon('ruler'), el('span', { class: 'distance', text: fmtDistance(km) })));

  const flags = el('p', { class: 'card__flags' });
  if (isText(k.zona)) flags.append(el('span', { class: 'flag flag--zona', text: k.zona }));
  if (!hasGeo(k)) flags.append(el('span', { class: 'flag flag--warn', text: t(state.lang, 'card.positionMissing') }));
  if (!isText(k.address?.full) && !isText(k.address?.locality)) flags.append(el('span', { class: 'flag', text: t(state.lang, 'detail.notAvailable') }));

  const actions = el('div', { class: 'card__actions' });
  const mapBtn = el('button', {
    class: 'btn btn--ghost',
    type: 'button',
    text: t(state.lang, 'card.showOnMap'),
    'aria-label': `${t(state.lang, 'map.zoomTo')}: ${k.name}`,
    disabled: !hasGeo(k),
    title: hasGeo(k) ? t(state.lang, 'map.zoomTo') : t(state.lang, 'card.positionMissing'),
    onclick: (event) => { event.stopPropagation(); activateCard(k.id); },
  });
  const detailBtn = el('button', {
    class: 'btn btn--ghost',
    type: 'button',
    'aria-expanded': String(expanded),
    'aria-controls': `detail-${k.id}`,
    text: t(state.lang, expanded ? 'card.collapse' : 'card.details'),
    onclick: (event) => { event.stopPropagation(); toggleDetails(k.id); },
  });
  actions.append(mapBtn, detailBtn);

  const body = el('article', {
    class: 'card__body',
    tabindex: '0',
    'aria-labelledby': titleId,
    'aria-describedby': hintId,
    onclick: (event) => { if (!event.target.closest('button, a')) activateCard(k.id); },
    onkeydown: (event) => {
      if (event.target !== body) return;
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        activateCard(k.id);
      }
    },
  },
  el('div', { class: 'card__head' },
    el('h3', { class: 'card__title', id: titleId, text: k.name ?? k.id }),
    badge),
  el('p', { class: 'card__addr', text: isText(k.address?.full) ? k.address.full : t(state.lang, 'detail.notAvailable') }),
  meta,
  flags,
  el('p', { class: 'sr-only', id: hintId, text: fmt(state.lang, 'card.hint', { details: t(state.lang, 'card.details') }) }),
  actions);

  const detail = el('div', { class: 'card__detail', id: `detail-${k.id}`, tabindex: '-1', hidden: !expanded }, buildDetail(k));

  const li = el('li', { class: `card${selected ? ' is-selected' : ''}`, dataset: { id: k.id } }, body, detail);
  return li;
}

/* ── Detail panel ───────────────────────────────────────────────────── */

function appendRow(dl, label, value) {
  if (value == null || value === '') return;
  dl.append(el('dt', { text: label }), el('dd', {}, value));
}

function langLabel(code) {
  const known = { it: 'lang.it', en: 'lang.en' };
  return known[code] ? t(state.lang, known[code]) : String(code).toUpperCase();
}

function buildDetail(k) {
  const dl = el('dl', { class: 'detail__grid' });
  appendRow(dl, t(state.lang, 'detail.operator'), isText(k.operator) ? k.operator : null);
  appendRow(dl, t(state.lang, 'detail.address'), isText(k.address?.full) ? k.address.full : null);
  appendRow(dl, t(state.lang, 'detail.comune'), isText(k.comune) ? k.comune : null);
  appendRow(dl, t(state.lang, 'detail.zona'), isText(k.zona) ? k.zona : null);
  appendRow(dl, t(state.lang, 'detail.capacity'),
    typeof k.capacity === 'number' ? num(k.capacity) : t(state.lang, 'detail.unknownCapacity'));
  appendRow(dl, t(state.lang, 'detail.age'), isText(k.age?.label) ? k.age.label : null);
  appendRow(dl, t(state.lang, 'detail.hours'), isText(k.hours?.label) ? k.hours.label : null);
  appendRow(dl, t(state.lang, 'detail.closures'), isText(k.closures) ? k.closures : null);
  appendRow(dl, t(state.lang, 'detail.languages'),
    Array.isArray(k.languages) && k.languages.length ? k.languages.map(langLabel).join(', ') : null);
  appendRow(dl, t(state.lang, 'detail.id'), el('code', { text: k.id }));

  const km = distanceFor(k);
  if (km != null) appendRow(dl, t(state.lang, 'detail.distance'), fmtDistance(km));

  if (hasGeo(k)) {
    const geo = k.geo;
    const lines = [el('div', { text: `${geo.lat.toFixed(5)}, ${geo.lon.toFixed(5)}` })];
    if (isText(geo.accuracy)) lines.push(el('div', { class: 'small', text: fmt(state.lang, 'detail.geoAccuracy', { value: geo.accuracy }) }));
    if (isText(geo.geocoder)) lines.push(el('div', { class: 'small', text: fmt(state.lang, 'detail.geocoder', { value: geo.geocoder }) }));
    appendRow(dl, t(state.lang, 'detail.geo'), el('div', {}, ...lines));
  }

  const contact = el('ul', { class: 'detail__links' });
  const tel = telHref(k.contact?.phone);
  if (tel) contact.append(el('li', {}, el('a', { href: tel, text: `${t(state.lang, 'detail.call')} · ${k.contact.phone}` })));
  const tel2 = telHref(k.contact?.phone_alt);
  if (tel2) contact.append(el('li', {}, el('a', { href: tel2, text: `${t(state.lang, 'detail.call')} 2 · ${k.contact.phone_alt}` })));
  const mail = mailtoHref(k.contact?.email);
  if (mail) contact.append(el('li', {}, el('a', { href: mail, text: `${t(state.lang, 'detail.mailto')} · ${k.contact.email}` })));
  const site = safeUrl(k.contact?.website);
  if (site) contact.append(el('li', {}, el('a', { href: site, target: '_blank', rel: 'noopener noreferrer', text: `${t(state.lang, 'detail.website')} · ${k.contact.website}` })));

  // Maps: real coordinates when available, otherwise the address text as a query.
  const address = isText(k.address?.full) ? k.address.full : [k.name, k.comune].filter(isText).join(', ');
  const google = hasGeo(k)
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${k.geo.lat},${k.geo.lon}`)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const apple = hasGeo(k)
    ? `https://maps.apple.com/?ll=${k.geo.lat},${k.geo.lon}&q=${encodeURIComponent(k.name ?? '')}`
    : `https://maps.apple.com/?q=${encodeURIComponent(address)}`;
  const maps = el('ul', { class: 'detail__links' },
    el('li', {}, el('span', { class: 'small', text: t(state.lang, 'detail.openInMap') })),
    el('li', {}, el('a', { href: google, target: '_blank', rel: 'noopener noreferrer', text: t(state.lang, 'detail.googleMaps') })),
    el('li', {}, el('a', { href: apple, target: '_blank', rel: 'noopener noreferrer', text: t(state.lang, 'detail.appleMaps') })));

  const sources = el('ul', { class: 'detail__links' });
  const known = new Map((state.meta?.sources ?? []).map((s) => [s.id, s]));
  for (const id of Array.isArray(k.sources) ? k.sources : []) {
    const src = known.get(id);
    const url = safeUrl(src?.url);
    const label = isText(src?.publisher) ? src.publisher : (isText(src?.label) ? src.label : id);
    sources.append(el('li', {}, url
      ? el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: label, title: src?.label ?? id })
      : el('span', { text: label })));
  }

  const sections = [dl];
  if (contact.children.length) sections.push(el('div', {}, el('dt', { class: 'field__label', text: t(state.lang, 'detail.contact') }), contact));
  if (sources.children.length) sections.push(el('div', {}, el('dt', { class: 'field__label', text: t(state.lang, 'detail.sources') }), sources));
  if (isText(k.notes)) {
    sections.push(el('div', {}, el('dt', { class: 'field__label', text: t(state.lang, 'detail.notes') }), el('p', { class: 'detail__note', text: k.notes })));
  }
  sections.push(el('div', {}, el('dt', { class: 'field__label', text: t(state.lang, 'detail.openInMap') }), maps));
  return el('div', {}, ...sections);
}

/* ── Map ────────────────────────────────────────────────────────────── */

const isMapVisible = () => {
  const host = refs.map;
  return !!host && !!(host.offsetWidth || host.offsetHeight || host.getClientRects().length);
};

function mapNotice(message) {
  refs.mapNotice.textContent = message ?? '';
  refs.mapNotice.hidden = !message;
}

function ensureMap() {
  if (map) return map;
  if (!window.L || mapBroken) {
    mapBroken = true;
    mapNotice(t(state.lang, 'map.unavailable'));
    return null;
  }
  try {
    map = window.L.map(refs.map, { scrollWheelZoom: true, zoomControl: true })
      .setView(LUGANO_CENTER, LUGANO_ZOOM);
    const tiles = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    // Offline / blocked tiles must not break the list: warn once, keep going.
    tiles.on('tileerror', () => {
      if (tilesWarned) return;
      tilesWarned = true;
      mapNotice(t(state.lang, 'map.tilesError'));
    });
    tiles.addTo(map);
    markerLayer = window.L.layerGroup().addTo(map);
  } catch {
    map = null;
    mapBroken = true;
    mapNotice(t(state.lang, 'map.unavailable'));
  }
  return map;
}

function markerFor(k) {
  let marker = markers.get(k.id);
  if (marker) return marker;
  const L = window.L;
  const icon = L.divIcon({
    className: `kita-marker kita-marker--${k.type === 'pubblico' ? 'pubblico' : 'privato'}`,
    html: '<span class="kita-marker__pin"></span>',   // static, trusted markup
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
  marker = L.marker([k.geo.lat, k.geo.lon], { icon, title: k.name ?? k.id, alt: k.name ?? k.id, keyboard: true });
  marker.bindPopup(buildPopup(k), { maxWidth: 300, minWidth: 220, autoPan: true });
  marker.on('click', () => selectRecord(k.id, { scroll: true }));
  markers.set(k.id, marker);
  return marker;
}

function buildPopup(k) {
  const openBtn = el('button', {
    class: 'btn btn--ghost',
    type: 'button',
    text: t(state.lang, 'map.openDetail'),
    onclick: () => { map?.closePopup(); openDetails(k.id, { focus: true }); },
  });
  const dl = el('dl');
  if (isText(k.address?.full)) dl.append(el('dt', { text: t(state.lang, 'detail.address') }), el('dd', { text: k.address.full }));
  if (isText(k.hours?.label)) dl.append(el('dt', { text: t(state.lang, 'detail.hours') }), el('dd', { text: k.hours.label }));
  if (typeof k.capacity === 'number') dl.append(el('dt', { text: t(state.lang, 'detail.capacity') }), el('dd', { text: num(k.capacity) }));
  if (isText(k.age?.label)) dl.append(el('dt', { text: t(state.lang, 'detail.age') }), el('dd', { text: k.age.label }));

  return el('div', { class: 'kita-popup' },
    el('h3', { text: k.name ?? k.id }),
    el('span', {
      class: `badge badge--${k.type === 'pubblico' ? 'pubblico' : 'privato'}`,
      text: t(state.lang, `filter.type.${k.type === 'pubblico' ? 'pubblico' : 'privato'}`),
    }),
    dl,
    isText(k.closures) ? el('p', { class: 'small', text: `${t(state.lang, 'detail.closures')}: ${k.closures}` }) : null,
    openBtn);
}

function renderMap(records) {
  if (!ensureMap()) return;
  if (!isMapVisible()) return;          // hidden pane (mobile): rendered again when shown
  if (tilesWarned) mapNotice(t(state.lang, 'map.tilesError'));
  else mapNotice(null);

  markerLayer.clearLayers();
  const points = [];
  for (const k of records) {
    if (!hasGeo(k)) continue;
    const marker = markerFor(k);
    marker.setPopupContent(buildPopup(k));
    markerLayer.addLayer(marker);                 // add first: the icon node exists only then
    const node = marker.getElement?.();
    if (node) node.classList.toggle('kita-marker--selected', k.id === state.selectedId);
    points.push([k.geo.lat, k.geo.lon]);
  }

  if (!points.length) {
    mapNotice(t(state.lang, 'map.empty'));
    return;
  }
  scheduleFit(points);
}

function scheduleFit(points) {
  clearTimeout(fitTimer);
  fitTimer = setTimeout(() => {
    if (!map || !isMapVisible() || !points.length) return;
    try {
      map.fitBounds(window.L.latLngBounds(points), { padding: [30, 30], maxZoom: 15, animate: true });
    } catch { /* degenerate bounds: keep the current view */ }
  }, 250);
}

function focusOnMap(id) {
  const k = byId(id);
  if (!k || !hasGeo(k) || !ensureMap()) return;
  if (!isMapVisible()) { pendingFocusId = id; toggleView('map'); return; }
  map.setView([k.geo.lat, k.geo.lon], Math.max(map.getZoom() ?? LUGANO_ZOOM, 15), { animate: true });
  markers.get(id)?.openPopup();
}

/* ── Selection & detail interaction ─────────────────────────────────── */

function selectRecord(id, { scroll = false } = {}) {
  state.selectedId = id;
  const card = [...refs.results.children].find((li) => li.dataset.id === id) ?? null;
  for (const li of refs.results.children) li.classList.toggle('is-selected', li === card);
  if (card && scroll) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  if (map) {
    for (const [markerId, marker] of markers) {
      const node = marker.getElement?.();
      if (node) node.classList.toggle('kita-marker--selected', markerId === id);
    }
  }
}

/** Card activated by click / Enter / Space. */
function activateCard(id) {
  selectRecord(id);
  if (hasGeo(byId(id))) focusOnMap(id);     // pan/zoom the map and open the popup
  else openDetails(id);                     // no coordinates: open the detail panel instead
}

function openDetails(id, { focus = false } = {}) {
  state.expandedId = id;
  const card = [...refs.results.children].find((li) => li.dataset.id === id);
  if (!card) return;
  if (!isMapVisible()) toggleView('list');
  syncDetails(card, true);
  if (focus) {
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.querySelector('.card__detail')?.focus({ preventScroll: true });
  }
}

function toggleDetails(id) {
  const card = [...refs.results.children].find((li) => li.dataset.id === id);
  if (!card) return;
  const open = card.querySelector('.card__detail')?.hidden === false;
  state.expandedId = open ? null : id;
  syncDetails(card, !open);
}

function syncDetails(card, open) {
  const detail = card.querySelector('.card__detail');
  const button = card.querySelector('button[aria-controls]');
  if (detail) detail.hidden = !open;
  if (button) {
    button.setAttribute('aria-expanded', String(open));
    button.textContent = t(state.lang, open ? 'card.collapse' : 'card.details');
  }
  // Only one card stays expanded at a time.
  if (open) {
    for (const li of refs.results.children) {
      if (li !== card) syncDetails(li, false);
    }
  }
}

function collapseAll() {
  state.expandedId = null;
  for (const li of refs.results.children) syncDetails(li, false);
  map?.closePopup();
}

/* ── Geolocation ────────────────────────────────────────────────────── */

function setGeoStatusKey(key = '') {
  state.geoStatusKey = key || null;
  refs.geoStatus.textContent = key ? t(state.lang, key) : '';
}

function locate() {
  if (state.userPos) {                       // toggle off
    state.userPos = null;
    state.sort = 'name';
    refs.sort.value = 'name';
    setGeoStatusKey('');
    render();
    return;
  }
  if (!navigator.geolocation) {
    setGeoStatusKey('geo.unsupported');
    return;
  }
  setGeoStatusKey('geo.locating');
  refs.geoBtn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      refs.geoBtn.disabled = false;
      state.userPos = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      state.sort = 'distance';
      refs.sort.value = 'distance';
      setGeoStatusKey('geo.active');
      render();
    },
    (err) => {
      refs.geoBtn.disabled = false;
      const key = err?.code === 1 ? 'geo.denied' : err?.code === 3 ? 'geo.timeout' : 'geo.unavailable';
      state.userPos = null;
      state.sort = 'name';                     // graceful fallback
      refs.sort.value = 'name';
      setGeoStatusKey(key);
      render();
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
  );
}

/* ── CSV export ─────────────────────────────────────────────────────── */

const csvCell = (value) => {
  if (value == null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function exportCsv() {
  const records = state.visible.length ? state.visible : currentRecords();
  if (!records.length) {
    refs.exportStatus.textContent = t(state.lang, 'export.csvEmpty');
    return;
  }
  const columns = [
    ['id', (k) => k.id],
    ['name', (k) => k.name],
    ['type', (k) => k.type],
    ['operator', (k) => k.operator],
    ['comune', (k) => k.comune],
    ['zona', (k) => k.zona],
    ['in_city_of_lugano', (k) => k.in_city_of_lugano],
    ['street', (k) => k.address?.street],
    ['postal_code', (k) => k.address?.postal_code],
    ['locality', (k) => k.address?.locality],
    ['address_full', (k) => k.address?.full],
    ['lat', (k) => k.geo?.lat],
    ['lon', (k) => k.geo?.lon],
    ['phone', (k) => k.contact?.phone],
    ['phone_alt', (k) => k.contact?.phone_alt],
    ['email', (k) => k.contact?.email],
    ['website', (k) => k.contact?.website],
    ['capacity', (k) => k.capacity],
    ['age_min_months', (k) => k.age?.min_months],
    ['age_max_months', (k) => k.age?.max_months],
    ['age_label', (k) => k.age?.label],
    ['hours_label', (k) => k.hours?.label],
    ['hours_open', (k) => k.hours?.open],
    ['hours_close', (k) => k.hours?.close],
    ['days', (k) => (k.hours?.days ?? []).join(' ')],
    ['closures', (k) => k.closures],
    ['languages', (k) => (k.languages ?? []).join(' ')],
    ['notes', (k) => k.notes],
    ['sources', (k) => (k.sources ?? []).join(' ')],
    ['distance_km', (k) => { const d = distanceFor(k); return d == null ? '' : d.toFixed(2); }],
  ];
  const rows = [columns.map(([name]) => name).join(',')];
  for (const k of records) rows.push(columns.map(([, pick]) => csvCell(pick(k))).join(','));
  const csv = `\uFEFF${rows.join('\r\n')}\r\n`;

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = el('a', { href: url, download: 'kita-lugano-filtrato.csv' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  refs.exportStatus.textContent = '';
}

/* ── Reset & view toggle ────────────────────────────────────────────── */

function resetFilters() {
  state.query = '';
  state.type = 'all';
  state.area = 'all';
  state.ageMonths = null;
  state.minCapacity = null;
  state.italianOnly = false;
  state.openNow = false;
  state.sort = 'name';
  state.selectedId = null;
  refs.search.value = '';
  refs.typeAll.checked = true;
  refs.areaAll.checked = true;
  refs.age.value = '';
  refs.capacity.value = '';
  refs.onlyIt.checked = false;
  refs.openNow.checked = false;
  refs.sort.value = 'name';
  syncAgeChips();
  setGeoStatusKey('');
  render();
  // Keyboard users land back in the search box (only where it does not pop a mobile keyboard).
  if (window.matchMedia('(min-width: 900px)').matches) refs.search.focus({ preventScroll: true });
}

function toggleView(view) {
  document.body.dataset.view = view;
  refs.viewList.setAttribute('aria-pressed', String(view === 'list'));
  refs.viewMap.setAttribute('aria-pressed', String(view === 'map'));
  const listVisible = view === 'list';
  refs.viewMap.title = t(state.lang, 'map.title');
  refs.viewList.title = t(state.lang, 'results.title');
  if (listVisible) return;
  ensureMap();
  render();
  requestAnimationFrame(() => {
    map?.invalidateSize();
    if (pendingFocusId) {
      const id = pendingFocusId;
      pendingFocusId = null;
      focusOnMap(id);
    }
  });
}

/* ── Wiring ─────────────────────────────────────────────────────────── */

function cacheRefs() {
  const $ = (id) => document.getElementById(id);
  Object.assign(refs, {
    dataVersion: $('data-version'),
    disclaimerText: $('disclaimer-text'),
    schemaVersion: $('schema-version'),
    sources: $('sources'),
    langBtns: [...document.querySelectorAll('.lang__btn')],
    dlCsv: $('dl-csv'),
    exportStatus: $('export-status'),
    search: $('search'),
    typeAll: $('type-all'),
    areaAll: $('area-all'),
    age: $('age'),
    agePresets: $('age-presets'),
    ageHint: $('age-hint'),
    capacity: $('capacity'),
    onlyIt: $('only-it'),
    openNow: $('open-now'),
    openNowHint: $('open-now-hint'),
    sort: $('sort'),
    geoBtn: $('geo-btn'),
    geoStatus: $('geo-status'),
    reset: $('reset'),
    emptyReset: $('empty-reset'),
    viewList: $('view-list'),
    viewMap: $('view-map'),
    loading: $('loading'),
    count: $('count'),
    empty: $('empty'),
    errorPanel: $('error-panel'),
    errorBody: $('error-body'),
    retry: $('retry'),
    results: $('results'),
    map: $('map'),
    mapNotice: $('map-notice'),
  });
}

function syncOpenNow(now) {
  const box = refs.openNow;
  const possible = state.kitas.length > 0 && anyKitaOpenNow(now);
  box.disabled = !possible;
  box.title = t(state.lang, possible ? 'filter.openNow.title' : 'filter.openNow.disabled');
  box.closest('.check')?.classList.toggle('is-disabled', !possible);
  if (!possible && state.openNow) {          // switch the effect off instead of emptying the list
    state.openNow = false;
    box.checked = false;
  }
  refs.openNowHint.textContent = possible ? '' : t(state.lang, 'filter.openNow.disabled');
}

function wire() {
  const onFilterChange = debounce(() => render(), 120);

  refs.search.addEventListener('input', () => { state.query = refs.search.value; onFilterChange(); });
  for (const radio of document.querySelectorAll('input[name="type"]')) {
    radio.addEventListener('change', () => { state.type = radio.value; render(); });
  }
  for (const radio of document.querySelectorAll('input[name="area"]')) {
    radio.addEventListener('change', () => { state.area = radio.value; render(); });
  }

  const onAgeInput = debounce(() => {
    const raw = refs.age.value.trim();
    const value = raw === '' ? null : Number(raw);
    state.ageMonths = value == null || Number.isNaN(value) ? null : Math.max(0, Math.min(72, Math.round(value)));
    syncAgeChips();
    render();
  }, 120);
  refs.age.addEventListener('input', onAgeInput);
  refs.agePresets.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-age]');
    if (!btn) return;
    const raw = btn.dataset.age;
    state.ageMonths = raw === 'any' ? null : Number(raw);
    refs.age.value = state.ageMonths == null ? '' : String(state.ageMonths);
    syncAgeChips();
    render();
  });

  refs.capacity.addEventListener('input', debounce(() => {
    const raw = refs.capacity.value.trim();
    const value = raw === '' ? null : Number(raw);
    state.minCapacity = value == null || Number.isNaN(value) ? null : Math.max(0, Math.round(value));
    render();
  }, 120));

  refs.onlyIt.addEventListener('change', () => { state.italianOnly = refs.onlyIt.checked; render(); });
  refs.openNow.addEventListener('change', () => { state.openNow = refs.openNow.checked; render(); });

  refs.sort.addEventListener('change', () => {
    if (refs.sort.value === 'distance' && !state.userPos) {
      setGeoStatusKey('sort.needPosition');
      refs.sort.value = state.sort;
      return;
    }
    state.sort = refs.sort.value;
    setGeoStatusKey('');
    render();
  });

  refs.geoBtn.addEventListener('click', locate);
  refs.reset.addEventListener('click', resetFilters);
  refs.emptyReset.addEventListener('click', resetFilters);
  refs.retry.addEventListener('click', loadData);
  refs.dlCsv.addEventListener('click', exportCsv);

  for (const btn of refs.langBtns) btn.addEventListener('click', () => setLang(btn.dataset.lang));
  refs.viewList.addEventListener('click', () => toggleView('list'));
  refs.viewMap.addEventListener('click', () => toggleView('map'));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') collapseAll();   // closes the detail panel and any open popup
  });

  window.addEventListener('resize', debounce(() => { if (isMapVisible()) map?.invalidateSize(); }, 200));

  // Keep "open now" honest as time passes (and re-check availability).
  setInterval(() => {
    if (!state.kitas.length) return;
    const now = zurichNow();
    if (state.openNow || anyKitaOpenNow(now) !== !refs.openNow.disabled) render();
  }, 60000);
}

/* ── Boot ───────────────────────────────────────────────────────────── */

function boot() {
  cacheRefs();
  let stored = null;
  try { stored = localStorage.getItem(LANG_KEY); } catch { /* ignore */ }
  state.lang = LANGS.includes(stored) ? stored : DEFAULT_LANG;
  for (const btn of refs.langBtns) btn.setAttribute('aria-pressed', String(btn.dataset.lang === state.lang));
  applyStaticI18n();
  syncAgeChips();
  wire();
  loadData();
}

boot();
