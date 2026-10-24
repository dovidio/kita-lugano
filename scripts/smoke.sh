#!/usr/bin/env bash
# End-to-end smoke test: boots the server on a scratch port and exercises the
# API, the dataset and the static assets the web app depends on.
#
#   bash scripts/smoke.sh            # default port 8799
#   PORT=9001 bash scripts/smoke.sh
#
# Exits non-zero on the first failed assertion.

set -uo pipefail

PORT="${PORT:-8799}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="http://127.0.0.1:${PORT}"
PASS=0
FAIL=0

cd "$ROOT"

say()  { printf '%s\n' "$*"; }
ok()   { PASS=$((PASS + 1)); printf '  ok   %s\n' "$*"; }
bad()  { FAIL=$((FAIL + 1)); printf '  FAIL %s\n' "$*"; }

# assert_status <expected> <path> <label>
assert_status() {
  local expected="$1" path="$2" label="$3" got
  got="$(curl -s -m 10 --path-as-is -o /dev/null -w '%{http_code}' "${BASE}${path}")"
  if [ "$got" = "$expected" ]; then ok "$label (HTTP $got)"; else bad "$label (expected $expected, got $got)"; fi
}

# assert_json <path> <python expression over 'd'> <label>
assert_json() {
  local path="$1" expr="$2" label="$3" out
  out="$(curl -s -m 10 "${BASE}${path}" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
except Exception as exc:
    print('INVALID_JSON:', exc); raise SystemExit(0)
print('PASS' if ($expr) else 'FAIL', end='')
")"
  if [ "$out" = "PASS" ]; then ok "$label"; else bad "$label"; fi
}

say "KiTa Lugano smoke test → ${BASE}"
say ""

# ---------------------------------------------------------------------------
say "[1/5] static dataset"
if [ -f data/kitas.json ]; then ok "data/kitas.json exists"; else bad "data/kitas.json missing"; fi
if python3 scripts/validate.py >/tmp/kita-validate.out 2>&1; then
  ok "dataset passes validation ($(grep -c . /tmp/kita-validate.out) lines of report)"
else
  bad "dataset validation failed"; cat /tmp/kita-validate.out
fi
for asset in index.html app.js i18n.js styles.css \
             vendor/leaflet/leaflet.js vendor/leaflet/leaflet.css \
             vendor/leaflet/images/marker-icon.png; do
  if [ -f "$asset" ]; then ok "asset $asset"; else bad "asset $asset missing"; fi
done
if node scripts/check-i18n.mjs >/tmp/kita-i18n.out 2>&1; then
  ok "IT/EN dictionaries are consistent ($(grep -o 'it=[0-9]* keys' /tmp/kita-i18n.out | head -1))"
else
  bad "i18n check failed"; cat /tmp/kita-i18n.out
fi

# ---------------------------------------------------------------------------
say ""
say "[2/5] boot server on port ${PORT}"
node server/server.mjs --port "$PORT" >/tmp/kita-server.log 2>&1 &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null; wait "$SERVER_PID" 2>/dev/null; }
trap cleanup EXIT

for _ in $(seq 1 40); do
  if curl -s -m 2 -o /dev/null "${BASE}/healthz"; then break; fi
  sleep 0.25
done
if curl -s -m 2 -o /dev/null "${BASE}/healthz"; then
  ok "server is up (pid ${SERVER_PID})"
else
  bad "server did not start"; cat /tmp/kita-server.log; exit 1
fi

# ---------------------------------------------------------------------------
say ""
say "[3/5] HTTP surface"
assert_status 200 /healthz "healthz"
assert_status 200 /api/meta "api/meta"
assert_status 200 /api/kitas "api/kitas"
assert_status 200 /api/kitas/nido-polis "api/kitas/:id"
assert_status 404 /api/kitas/does-not-exist "api/kitas/:id → 404"
assert_status 404 /api/nope "unknown endpoint → 404"
assert_status 200 /data/kitas.json "dataset over HTTP"
assert_status 200 / "web app index"
assert_status 200 /vendor/leaflet/leaflet.js "vendored leaflet.js"
assert_status 200 /vendor/leaflet/leaflet.css "vendored leaflet.css"
assert_status 200 /vendor/leaflet/images/marker-icon.png "vendored marker icon"
assert_status 404 "/../../etc/passwd" "path traversal blocked"
assert_status 404 "/.git/config" "dot-paths blocked (.git)"
assert_status 404 "/.nojekyll" "dot-paths blocked (.nojekyll)"

# ---------------------------------------------------------------------------
say ""
say "[4/5] API semantics"
assert_json "/api/kitas" "d['count'] == 30 and len(d['kitas']) == 30 and d['meta']['count'] == 30" "30 records"
assert_json "/api/kitas?type=pubblico" "d['count'] == 4 and all(k['type'] == 'pubblico' for k in d['kitas'])" "type=pubblico → 4"
assert_json "/api/kitas?type=privato" "d['count'] == 26" "type=privato → 26"
assert_json "/api/kitas?in_city_of_lugano=true" "all(k['in_city_of_lugano'] for k in d['kitas']) and d['count'] == 17" "city of Lugano → 17"
assert_json "/api/kitas?age_months=6" "all(k['age']['min_months'] <= 6 <= k['age']['max_months'] for k in d['kitas'])" "age_months=6 respects ranges"
assert_json "/api/kitas?min_capacity=40" "all(k['capacity'] >= 40 for k in d['kitas'])" "min_capacity=40 respected"
assert_json "/api/kitas?language=en" "all('en' in k['languages'] for k in d['kitas'])" "language=en respected"
assert_json "/api/kitas?q=Pregassona" "d['count'] >= 1" "free-text q=Pregassona"
assert_json "/api/kitas?lat=46.0037&lon=8.9511&sort=distance" "all('distance_km' in k for k in d['kitas']) and d['kitas'][0]['distance_km'] <= d['kitas'][-1]['distance_km']" "distance sorting"
assert_json "/api/kitas?lat=46.0037&lon=8.9511&max_distance_km=1" "all(k['distance_km'] <= 1 for k in d['kitas'])" "max_distance_km=1"
assert_json "/api/kitas/nido-polis" "d['id'] == 'nido-polis' and d['geo']['precision'] == 'address'" "single record payload"
assert_json "/api/kitas?sort=capacity" "d['kitas'][0]['capacity'] >= d['kitas'][1]['capacity']" "capacity sorting"

# ---------------------------------------------------------------------------
say ""
say "[5/5] app wiring"
INDEX="$(curl -s -m 10 "${BASE}/")"
for needle in 'vendor/leaflet/leaflet.js' 'vendor/leaflet/leaflet.css' 'data/kitas.json' 'app.js'; do
  case "$INDEX" in
    *"$needle"*) ok "index.html references $needle" ;;
    *) bad "index.html does not reference $needle" ;;
  esac
done

say ""
say "----------------------------------------"
say "passed: ${PASS}   failed: ${FAIL}"
if [ "$FAIL" -gt 0 ]; then
  say "SMOKE TEST FAILED"
  exit 1
fi
say "SMOKE TEST PASSED"
