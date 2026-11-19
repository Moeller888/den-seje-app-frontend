#!/usr/bin/env bash
# A VIRTUAL AUDIO OUTPUT for the browsers of the isolated suite (D-362 / PR #736), production lane only.
#
# Why: Firefox on Linux plays sound only through a sound server (PulseAudio/PipeWire); the GitHub runner has none
# (apt lists pulseaudio and pipewire only under "Suggested packages"). Every <audio> then fails with
# NS_ERROR_DOM_MEDIA_MEDIASINK_ERR (OnMediaSinkAudioError): run 44581847725, tests/read-aloud-long-text.spec.ts,
# 3 of 4 Firefox tests. Reproduced locally with Mozilla's own test pref media.cubeb.force_null_context (no audio
# backend): the same error, the same three failures. Chromium and WebKit play without a sound server.
#
# What: a PulseAudio daemon for the runner user. With no sound card it loads its automatic null sink ("auto_null"),
# which consumes audio in real time — nothing is heard, but playback advances and ends like on a pupil's device.
#
#   bash tests/isolated/ci/virtual-audio.sh install   the pulseaudio package: from this lane's own .deb cache
#                                                     (~/.cache/pw-audio-apt, never the shared ~/.cache/pw-apt),
#                                                     else from the Ubuntu mirrors (bounded) — and the .debs it
#                                                     fetched are kept for the cache entry main may save
#   bash tests/isolated/ci/virtual-audio.sh start     the daemon, then VERIFY: a server answers and a sink exists
#
# Fail loud: any failure is labelled INFRA-AUDIO and stops the job before a test runs. Local only: no network
# access is needed after install (the daemon talks over a UNIX socket in the user's runtime directory).
set -euo pipefail

cache="${HOME}/.cache/pw-audio-apt"

fail() { echo "::error title=INFRA-AUDIO::$*"; exit 1; }

install_pulseaudio() {
  mkdir -p "$cache" # always exists, so the cache save never trips over a missing path
  if command -v pulseaudio > /dev/null 2>&1; then
    echo "virtual-audio: pulseaudio already installed ($(pulseaudio --version))"
    return 0
  fi
  local cached
  cached=$(find "$cache" -maxdepth 1 -name '*.deb' | wc -l)
  echo "virtual-audio: ${cached} cached .deb file(s) in ${cache}"
  if [ "${AUDIO_CACHE_HIT:-}" = true ] && [ "$cached" -gt 0 ]; then
    # Same rule as the browser cache install: apt counts a .deb as fetched only inside its archive directory, so the
    # files go there first; --no-download never reaches a mirror; --no-remove never removes an installed package.
    sudo cp "$cache"/*.deb /var/cache/apt/archives/
    if sudo apt-get install -y --no-download --no-remove --no-install-recommends "$cache"/*.deb; then
      echo "::notice title=INFRA-AUDIO-PATH::pulseaudio from the lane's cache"
      return 0
    fi
    echo "::warning title=INFRA-AUDIO::cache install did not complete; falling back to the Ubuntu mirrors"
    sudo dpkg --configure -a || fail "dpkg could not finish the interrupted cache install - no test ran"
  fi
  # Mirror path (a cache miss): bounded, with the step's apt timeouts. Downloads go to a directory of their own, so
  # exactly this package's closure — and nothing of the browsers' — can be kept for the cache.
  local archives
  archives="$(mktemp -d)"
  mkdir -p "$archives/partial"
  if ! apt-cache show pulseaudio > /dev/null 2>&1; then
    timeout --kill-after=30s 4m sudo apt-get update -o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 \
      || fail "apt-get update failed or ran past 4 min (Ubuntu mirror, runner DNS or network) - no test ran"
  fi
  timeout --kill-after=30s 4m sudo apt-get install -y --no-remove --no-install-recommends \
    -o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 \
    -o Dir::Cache::archives="$archives" pulseaudio \
    || fail "pulseaudio could not be installed from the Ubuntu mirrors - no test ran"
  rm -f "$cache"/*.deb
  bash tests/isolated/ci/keep-installed-debs.sh "$archives" "$cache"
  echo "::notice title=INFRA-AUDIO-PATH::pulseaudio from the mirrors"
}

start_pulseaudio() {
  command -v pulseaudio > /dev/null 2>&1 || fail "pulseaudio is not installed"
  local log="${RUNNER_TEMP:-/tmp}/pulseaudio.log"
  pulseaudio --check 2> /dev/null || pulseaudio --daemonize=yes --exit-idle-time=-1 --log-target="file:${log}" \
    || { cat "$log" 2> /dev/null || true; fail "the PulseAudio daemon did not start"; }
  local ok=no
  for _ in $(seq 1 20); do
    if pactl info > /dev/null 2>&1; then ok=yes; break; fi
    sleep 0.5
  done
  [ "$ok" = yes ] || { cat "$log" 2> /dev/null || true; fail "no PulseAudio server answers"; }
  local sinks
  sinks=$(pactl list short sinks)
  [ -n "$sinks" ] || fail "PulseAudio runs but has no sink"
  echo "virtual-audio: $(pactl info | grep -E '^(Server Name|Server Version|Default Sink):' | tr '\n' ' ')"
  echo "virtual-audio: sinks: ${sinks}"
}

case "${1:-}" in
  install) install_pulseaudio ;;
  start) start_pulseaudio ;;
  *) echo "usage: virtual-audio.sh install|start" >&2; exit 2 ;;
esac
