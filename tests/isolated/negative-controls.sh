#!/usr/bin/env bash
# Negative controls for the isolated E2E job (D-110): every protection is run against a deliberately
# WRONG configuration and must raise the alarm. A control that does not fail fails the job — so a
# check that has silently become vacuous (always "OK") is caught in CI, in every run.
#
#   tests/isolated/negative-controls.sh pre-lock    after the blackhole and CDN setup, before the lock
#   tests/isolated/negative-controls.sh post-lock   after the network lock is installed and verified
#
# No control contacts production. Production names appear only as text that a guard must refuse
# before anything connects; the only outbound requests go to example.org / example.com (IANA's
# reserved documentation domains) and 1.1.1.1, and only where the control needs a reachable,
# non-production destination.
set -euo pipefail
GROUP_NAME="${ISOLATED_GROUP:-e2eiso}"
PROD_SITE="https://xn--lrlig-sra.dk"
PROD_DB="https://tjzbehwfagiwpwodsgwg.supabase.co"
failures=0

# Runs a command that MUST fail. Passing = the protection works.
must_fail() {
  local name="$1"; shift
  if "$@" > /dev/null 2>&1; then echo "CONTROL FAILED: $name — the protection accepted a wrong configuration"; failures=$((failures + 1))
  else echo "control ok: $name"; fi
}
# Runs a command that MUST succeed (a positive control that makes a negative one meaningful).
must_pass() {
  local name="$1"; shift
  if "$@" > /dev/null 2>&1; then echo "control ok: $name"
  else echo "CONTROL FAILED: $name"; failures=$((failures + 1)); fi
}

GUARD="import('./tests/isolated/isolation-guard.mjs').then(m => m.assertIsolated(process.env))"

pre_lock() {
  # 1. The isolation guard refuses an environment that names production (no network involved).
  must_fail "guard refuses PROD_BASE_URL" env PROD_BASE_URL="$PROD_SITE" node --input-type=module -e "$GUARD"
  must_fail "guard refuses a production Supabase URL" env ISOLATED_SUPABASE_URL="$PROD_DB" node --input-type=module -e "$GUARD"
  must_fail "guard refuses a provider key" env OPENAI_API_KEY=sk-negative-control node --input-type=module -e "$GUARD"
  must_pass "guard accepts this job's own environment (control)" node --input-type=module -e "$GUARD"
  # 2. The suite config refuses unless started by the runner (which builds and checks the environment).
  must_fail "suite config refuses without run-suite" env -u ISOLATED_SUITE npx playwright test -c tests/isolated/playwright.suite.config.ts --list
  # 3. The blackhole check reports a name it does not cover (example.com: reachable, not production).
  must_pass "blackhole verify reports an unprotected name" node --input-type=module -e \
    "import('./tests/isolated/egress-blackhole.mjs').then(async m => process.exit((await m.verify(['example.com'])).length > 0 ? 0 : 1))"
  # 4. The resolver check rejects an IPv4-only hosts mapping (the gap seen in CI 2026-10-28): with only
  #    a 127.0.0.1 line, the IPv6 lookup of www.example.org is not ::1.
  echo "127.0.0.1 www.example.org" | sudo tee -a /etc/hosts > /dev/null
  must_fail "an IPv4-only mapping fails the both-families check" bash -c \
    '[ "$(getent ahostsv4 www.example.org | awk "{print \$1}" | sort -u)" = "127.0.0.1" ] && [ "$(getent ahostsv6 www.example.org | awk "{print \$1}" | sort -u)" = "::1" ]'
  sudo sed -i '/^127\.0\.0\.1 www\.example\.org$/d' /etc/hosts
  # 5. The seed guard refuses a database that does not carry this run's token.
  must_fail "seed guard refuses a foreign database token" env ISOLATED_DB_TOKEN=0000000000000000000000000000000000000000000000000000000000000000 \
    node tests/isolated/seed/seed.mjs --db-url "$ISOLATED_DB_URL"
}

post_lock() {
  # 6. Positive control: a process OUTSIDE the test group still reaches the internet, so the test
  #    group's failure to reach it (egress-firewall.sh verify) is the lock, not a dead network.
  must_pass "outside the test group the internet is reachable (control)" curl -sS --max-time 8 -o /dev/null https://1.1.1.1
  must_fail "inside the test group the internet is not" sg "$GROUP_NAME" -c "curl -sS --max-time 8 -o /dev/null https://1.1.1.1"
  must_fail "inside the test group IPv6 is not" sg "$GROUP_NAME" -c "curl -6 -sS --max-time 8 -o /dev/null https://example.org"
  # 7. The browser tripwire refuses and records a request that leaves loopback.
  must_pass "the tripwire refuses and records" node --input-type=module -e "
    import('./tests/isolated/tripwire-proxy.mjs').then(async ({ startTripwire }) => {
      const t = await startTripwire(); const { request } = await import('node:http');
      const port = Number(new URL(t.url).port);
      const status = await new Promise((ok, ko) => { const r = request({ host: '127.0.0.1', port, path: 'http://example.org/' }, (res) => { res.resume(); ok(res.statusCode); }); r.on('error', ko); r.end(); });
      await t.close();
      process.exit(status === 403 && t.hits.length === 1 && t.hits[0] === 'example.org' ? 0 : 1);
    })"
}

case "${1:-}" in
  pre-lock) pre_lock ;;
  post-lock) post_lock ;;
  *) echo "usage: $0 pre-lock|post-lock" >&2; exit 2 ;;
esac
if [ "$failures" -gt 0 ]; then echo "negative controls: $failures failed"; exit 1; fi
echo "negative controls ($1): all protections refused the wrong configuration"
