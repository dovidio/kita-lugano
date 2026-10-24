#!/usr/bin/env node
/**
 * Consistency checks for the web frontend that a browser is not needed for:
 *
 *   1. the IT and EN dictionaries expose exactly the same keys;
 *   2. every key referenced from index.html (data-i18n / data-i18n-placeholder)
 *      exists in the dictionaries;
 *   3. every key referenced from app.js via t()/fmt()/plural() exists too;
 *   4. no dictionary value is left empty.
 *
 *   node scripts/check-i18n.mjs        # exit 1 on any problem
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = ROOT;

const problems = [];
const note = (message) => problems.push(message);

const i18nSource = await readFile(join(WEB, "i18n.js"), "utf8");
const htmlSource = await readFile(join(WEB, "index.html"), "utf8");
const appSource = await readFile(join(WEB, "app.js"), "utf8");
const cssSource = await readFile(join(WEB, "styles.css"), "utf8");

// --- load the dictionaries by importing the module directly -----------------
const { it, en } = await import(new URL("../i18n.js", import.meta.url).href);

const itKeys = new Set(Object.keys(it));
const enKeys = new Set(Object.keys(en));

console.log(`dictionaries: it=${itKeys.size} keys, en=${enKeys.size} keys`);

for (const key of itKeys) if (!enKeys.has(key)) note(`key present in IT but missing in EN: ${key}`);
for (const key of enKeys) if (!itKeys.has(key)) note(`key present in EN but missing in IT: ${key}`);

for (const [lang, dict] of [["it", it], ["en", en]]) {
  for (const [key, value] of Object.entries(dict)) {
    if (typeof value !== "string") note(`${lang}.${key} is not a string`);
    else if (value.trim() === "") note(`${lang}.${key} is empty`);
  }
}

// --- keys referenced from the HTML -----------------------------------------
const htmlKeys = new Set();
for (const m of htmlSource.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g)) htmlKeys.add(m[1]);
console.log(`index.html references ${htmlKeys.size} keys`);
for (const key of htmlKeys) if (!itKeys.has(key)) note(`index.html references unknown key: ${key}`);

// --- keys referenced from app.js -------------------------------------------
// Matches t(lang, 'key'), fmt(lang, 'key', …) and plural(lang, n, 'a', 'b').
const appKeys = new Set();
for (const m of appSource.matchAll(/\b(?:t|fmt|plural)\(\s*[^,)]+,\s*(?:[^,)]+,\s*)?'([a-zA-Z][\w.]*)'/g)) {
  appKeys.add(m[1]);
}
for (const m of appSource.matchAll(/\b(?:t|fmt|plural)\(\s*[^,]+,\s*'([a-zA-Z][\w.]*)'/g)) appKeys.add(m[1]);
console.log(`app.js references ${appKeys.size} keys`);
for (const key of appKeys) if (!itKeys.has(key)) note(`app.js references unknown key: ${key}`);

// --- unused keys (informational only) --------------------------------------
const referenced = new Set([...htmlKeys, ...appKeys]);
// Keys are also built dynamically from a prefix in a couple of places.
const prefixes = [...appSource.matchAll(/`([a-zA-Z][\w.]*)\.\$\{[^}]+\}`/g)].map((m) => m[1]);
const isDynamic = (key) => prefixes.some((p) => key.startsWith(`${p}.`));
const unused = [...itKeys].filter((k) => !referenced.has(k) && !isDynamic(k));
if (unused.length) console.log(`note: ${unused.length} dictionary keys are not statically referenced: ${unused.join(", ")}`);

// --- sanity: styles referenced by the app exist in the stylesheet ----------
const appClasses = new Set();
for (const m of appSource.matchAll(/class:\s*'([^']+)'/g)) {
  for (const cls of m[1].split(/\s+/)) if (cls) appClasses.add(cls);
}
const missingClasses = [...appClasses].filter((cls) => !cssSource.includes(`.${cls}`));
if (missingClasses.length) {
  console.log(`note: ${missingClasses.length} classes built in app.js have no rule in styles.css: ${missingClasses.join(", ")}`);
}

console.log("");
if (problems.length) {
  console.log(`FAILED (${problems.length} problem${problems.length === 1 ? "" : "s"})`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}
console.log("i18n check OK");
