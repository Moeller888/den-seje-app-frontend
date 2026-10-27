#!/usr/bin/env bash
# Network lock for the isolated E2E job (D-110), applied AFTER every download (npm, browsers, images,
# Edge Function modules) and BEFORE any test runs.
#
#   tests/isolated/egress-firewall.sh lock     install the rules
#   tests/isolated/egress-firewall.sh verify   exit 1 unless the lock provably holds
#
# Two scopes, both allowing only loopback and private (Docker) destinations:
#   1. the test GROUP (ISOLATED_GROUP, default e2eiso) — every Playwright, browser and Node process of the
#      suite runs with this primary group (`sg e2eiso -c …`). The Actions runner agent runs with the
#      runner's own group and keeps its connection to GitHub. (A separate test USER was tried first:
#      Firefox did not start under it; the group keeps the runner's HOME and runtime directory.)
#   2. every container (DOCKER-USER): the local stack, including the Edge Runtime that runs the
#      repository's Edge Functions, cannot reach any provider (OpenAI, Azure, Resend, …) or production.
# IPv6 is refused entirely for the test group.
set -euo pipefail
GROUP_NAME="${ISOLATED_GROUP:-e2eiso}"
PRIVATE_NETS=(127.0.0.0/8 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16)

lock() {
  sudo iptables -N ISO_EGRESS_USER
  sudo iptables -A ISO_EGRESS_USER -o lo -j RETURN
  for n in "${PRIVATE_NETS[@]}"; do sudo iptables -A ISO_EGRESS_USER -d "$n" -j RETURN; done
  sudo iptables -A ISO_EGRESS_USER -j REJECT
  sudo iptables -I OUTPUT 1 -m owner --gid-owner "$GROUP_NAME" -j ISO_EGRESS_USER

  sudo ip6tables -N ISO_EGRESS_USER6
  sudo ip6tables -A ISO_EGRESS_USER6 -o lo -j RETURN
  sudo ip6tables -A ISO_EGRESS_USER6 -j REJECT
  sudo ip6tables -I OUTPUT 1 -m owner --gid-owner "$GROUP_NAME" -j ISO_EGRESS_USER6

  sudo iptables -N ISO_EGRESS_DOCKER
  sudo iptables -A ISO_EGRESS_DOCKER -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
  for n in "${PRIVATE_NETS[@]}"; do sudo iptables -A ISO_EGRESS_DOCKER -d "$n" -j RETURN; done
  sudo iptables -A ISO_EGRESS_DOCKER -j REJECT
  sudo iptables -I DOCKER-USER 1 -j ISO_EGRESS_DOCKER
  echo "egress lock: installed for group $GROUP_NAME and all containers"
}

verify() {
  local fail=0
  # A process in the test group cannot reach the internet (an IP literal: no DNS involved) …
  if sg "$GROUP_NAME" -c "curl -sS --max-time 8 -o /dev/null https://1.1.1.1" 2>/dev/null; then echo "FAIL: test group reached the internet"; fail=1; fi
  if sg "$GROUP_NAME" -c "curl -sS --max-time 8 -o /dev/null https://github.com" 2>/dev/null; then echo "FAIL: test group reached github.com"; fail=1; fi
  # … but does reach the local stack.
  if ! sg "$GROUP_NAME" -c "curl -sS --max-time 8 -o /dev/null ${ISOLATED_SUPABASE_URL}/auth/v1/health"; then echo "FAIL: test group cannot reach the local stack"; fail=1; fi
  # A container on the stack's network cannot reach the internet either.
  local net
  net=$(docker network ls --format '{{.Name}}' | grep -m1 '^supabase_network_' || true)
  if [ -z "$net" ]; then echo "FAIL: no supabase network found"; fail=1
  elif docker run --rm --network "$net" curlimages/curl:8.11.1 -sS --max-time 8 -o /dev/null https://1.1.1.1 2>/dev/null; then echo "FAIL: a container reached the internet"; fail=1; fi
  [ "$fail" = 0 ] && echo "egress lock: verified (test group and containers: loopback/private only)"
  return "$fail"
}

case "${1:-}" in
  lock) lock ;;
  verify) verify ;;
  *) echo "usage: $0 lock|verify" >&2; exit 2 ;;
esac
