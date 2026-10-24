// KiTa Lugano — tiny zero-dependency static + JSON API server.
//
//   node server/server.mjs [--port 8787]
//
// Serves the project root: the web app is index.html at /, the dataset at
// /data/kitas.json. It also exposes a small read-only JSON API that makes the
// dataset usable from scripts, notebooks or other frontends.
//
// Routes
//   GET /                        -> the web app (index.html)
//   GET /api/kitas               -> { meta, count, kitas: [...] }  (filterable)
//   GET /api/kitas/:id           -> a single record
//   GET /api/meta                -> dataset metadata
//   GET /healthz                 -> { status: "ok" }
//   GET /<path>                  -> static file from the project root
//
// /api/kitas query parameters (all optional, combinable):
//   q=<text>            free text over name/operator/comune/zona/street/notes
//   type=pubblico|privato
//   comune=Lugano       exact match on the municipality (repeatable, case-insensitive)
//   in_city_of_lugano=true|false
//   age_months=<int>    keeps kitas whose age range contains the value
//   min_capacity=<int>  keeps kitas with at least that many places
//   language=it|en      keeps kitas offering that language
//   max_distance_km=<n> requires lat & lon and keeps kitas within the radius
//   lat=<float>&lon=<float>
//   sort=name|capacity|distance

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_PORT = 8787;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".woff2": "font/woff2",
};

// ---------------------------------------------------------------------------
// dataset loading (re-read when the file changes on disk)
// ---------------------------------------------------------------------------

const DATA_FILE = join(ROOT, "data", "kitas.json");
let cache = { mtimeMs: 0, dataset: null };

async function loadDataset() {
  const info = await stat(DATA_FILE);
  if (!cache.dataset || info.mtimeMs !== cache.mtimeMs) {
    const dataset = JSON.parse(await readFile(DATA_FILE, "utf8"));
    cache = { mtimeMs: info.mtimeMs, dataset };
  }
  return cache.dataset;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const deaccent = (value) =>
  (value ?? "")
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function searchHaystack(kita) {
  return deaccent(
    [
      kita.name,
      kita.operator,
      kita.comune,
      kita.zona,
      kita.address?.street,
      kita.address?.locality,
      kita.address?.full,
      kita.notes,
      kita.closures,
      ...(kita.languages ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function applyFilters(kitas, params) {
  const q = deaccent(params.get("q") ?? "").trim();
  const type = params.get("type");
  const comuni = params.getAll("comune").map(deaccent).filter(Boolean);
  const inCity = params.get("in_city_of_lugano");
  const ageMonths = params.get("age_months");
  const minCapacity = params.get("min_capacity");
  const language = params.get("language");
  const lat = params.get("lat");
  const lon = params.get("lon");
  const maxDistanceKm = params.get("max_distance_km");

  const origin =
    lat !== null && lon !== null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))
      ? { lat: Number(lat), lon: Number(lon) }
      : null;

  let rows = kitas.filter((kita) => {
    if (q && !searchHaystack(kita).includes(q)) return false;
    if (type && kita.type !== type) return false;
    if (comuni.length && !comuni.includes(deaccent(kita.comune))) return false;
    if (inCity != null) {
      const want = inCity !== "false";
      if (Boolean(kita.in_city_of_lugano) !== want) return false;
    }
    if (ageMonths != null) {
      const age = Number(ageMonths);
      if (!Number.isFinite(age)) return false;
      if (!(kita.age.min_months <= age && age <= kita.age.max_months)) return false;
    }
    if (minCapacity != null) {
      // Records with an unknown capacity are not silently dropped, but they can
      // never satisfy an explicit minimum.
      const min = Number(minCapacity);
      if (!Number.isFinite(min) || !(typeof kita.capacity === "number" && kita.capacity >= min)) return false;
    }
    if (language && !(kita.languages ?? []).includes(language)) return false;
    return true;
  });

  if (origin) {
    rows = rows
      .filter((kita) => kita.geo)
      .map((kita) => ({ ...kita, distance_km: Number(haversineKm(origin, kita.geo).toFixed(2)) }));
    if (maxDistanceKm != null) {
      const max = Number(maxDistanceKm);
      if (Number.isFinite(max)) rows = rows.filter((kita) => kita.distance_km <= max);
    }
  }

  const sort = params.get("sort") ?? "name";
  const byName = (a, b) => a.name.localeCompare(b.name, "it");
  if (sort === "capacity") {
    rows.sort((a, b) => (b.capacity ?? -1) - (a.capacity ?? -1) || byName(a, b));
  } else if (sort === "distance") {
    rows.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity) || byName(a, b));
  } else {
    rows.sort(byName);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

async function serveStatic(req, res, pathname) {
  // Resolve inside ROOT only: reject any path that escapes the project.
  const decoded = decodeURIComponent(pathname);
  const target = resolve(ROOT, "." + normalize(decoded));
  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("403 Forbidden");
    return;
  }

  // Never serve dot-paths: this is a project root that also contains .git/,
  // .github/ and .nojekyll. GitHub Pages does not deploy them either.
  const segments = relative(ROOT, target).split(sep).filter(Boolean);
  if (segments.some((segment) => segment.startsWith("."))) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
    return;
  }

  let info;
  try {
    info = await stat(target);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end(`404 Not Found: ${relative(ROOT, target)}`);
    return;
  }
  if (info.isDirectory()) {
    // Only add the trailing slash when it is missing; a directory URL that
    // already ends in "/" is served directly as its index.html.
    if (!decoded.endsWith("/")) {
      res.writeHead(302, { location: decoded + "/" });
      res.end();
      return;
    }
    return serveStatic(req, res, decoded + "index.html");
  }

  const etag = `W/"${info.size}-${Number(info.mtimeMs).toString(36)}"`;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304).end();
    return;
  }

  res.writeHead(200, {
    "content-type": MIME[extname(target).toLowerCase()] ?? "application/octet-stream",
    "content-length": info.size,
    etag,
    "cache-control": "no-cache",
  });
  createReadStream(target).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const { pathname } = url;

  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD" }).end();
      return;
    }

    if (pathname === "/healthz") {
      sendJson(res, 200, { status: "ok", dataset: relative(ROOT, DATA_FILE) });
      return;
    }

    if (pathname === "/api/meta") {
      const { meta } = await loadDataset();
      sendJson(res, 200, meta);
      return;
    }

    if (pathname === "/api/kitas") {
      const { meta, kitas } = await loadDataset();
      const rows = applyFilters(kitas, url.searchParams);
      sendJson(res, 200, {
        meta: { ...meta, count: rows.length, dataset_count: kitas.length },
        count: rows.length,
        kitas: rows,
      });
      return;
    }

    if (pathname.startsWith("/api/kitas/")) {
      const id = decodeURIComponent(pathname.slice("/api/kitas/".length));
      const { kitas } = await loadDataset();
      const kita = kitas.find((entry) => entry.id === id);
      if (!kita) {
        sendJson(res, 404, { error: "not_found", id });
        return;
      }
      sendJson(res, 200, kita);
      return;
    }

    if (pathname.startsWith("/api/")) {
      sendJson(res, 404, { error: "unknown_endpoint", path: pathname });
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (error) {
    sendJson(res, 500, { error: "internal_error", message: String(error?.message ?? error) });
  }
});

function parsePort(argv) {
  const flag = argv.indexOf("--port");
  const raw = flag !== -1 ? argv[flag + 1] : process.env.PORT;
  const port = Number(raw ?? DEFAULT_PORT);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

const port = parsePort(process.argv.slice(2));
server.listen(port, "127.0.0.1", () => {
  console.log(`KiTa Lugano dev server → http://127.0.0.1:${port}/`);
  console.log(`Dataset                → http://127.0.0.1:${port}/data/kitas.json`);
  console.log(`API                    → http://127.0.0.1:${port}/api/kitas?type=privato&age_months=18`);
});
