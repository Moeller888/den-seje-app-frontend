#!/usr/bin/env bash
# Usage: keep-installed-debs.sh <apt-archive-dir> <cache-dir>
#
# Copies into <cache-dir> exactly the .deb files in <apt-archive-dir> whose package is installed in THAT version
# (dpkg-query), and nothing else. Used by .github/workflows/isolated-e2e.yml after a mirror install, before main
# writes the Playwright browser + apt cache entry for this runner image.
#
# WHY (CI stability, 2026-11-19): when the runner image changes, the newest entry for the same OS and Playwright
# version is restored only to SEED apt's archive directory; apt takes a seeded file only when its name (package,
# version, architecture) is exactly what the new image needs, and fetches the rest. The archive directory then also
# holds seeded files apt did not use (older versions). Copying the whole directory — the previous behaviour — would
# put those into the new entry, and the next cache-first install (`apt-get install --no-download <every cached
# .deb>`) would be handed two versions of a package. Only what is installed now is the closure of THIS image.
set -euo pipefail
src="${1:?apt archive directory}"
dest="${2:?cache directory}"
[ -d "$src" ] || { echo "keep-installed-debs: no directory $src" >&2; exit 1; }
mkdir -p "$dest"
kept=0
dropped=0
for f in "$src"/*.deb; do
  [ -e "$f" ] || continue
  pkg=$(dpkg-deb -f "$f" Package)
  ver=$(dpkg-deb -f "$f" Version)
  arch=$(dpkg-deb -f "$f" Architecture)
  if [ "$arch" = all ]; then q="$pkg"; else q="$pkg:$arch"; fi
  installed=$(dpkg-query -W -f='${Version}' "$q" 2> /dev/null || true)
  if [ -n "$installed" ] && [ "$installed" = "$ver" ]; then
    cp -- "$f" "$dest/"
    kept=$((kept + 1))
  else
    dropped=$((dropped + 1))
  fi
done
echo "keep-installed-debs: kept $kept, dropped $dropped (not installed in that version)"
