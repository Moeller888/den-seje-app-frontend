#!/usr/bin/env bash
# Krypterer den SENESTE VERIFICEREDE manuelle produktionsbackup til en anden lagringsenhed.
# Køres af ejeren selv, fra backup-mappen (der, hvor dump-mapperne ligger):
#
#   & "C:\Program Files\Git\bin\bash.exe" krypter-backup.sh E:            # krypterer
#   & "C:\Program Files\Git\bin\bash.exe" krypter-backup.sh --vis         # viser kun, hvad der ville blive valgt
#   & "C:\Program Files\Git\bin\bash.exe" krypter-backup.sh E: dump-…Z    # en bestemt (verificeret) dump
#
# HVILKEN DUMP. En dump vælges kun, når ALLE disse gælder:
#   * mappenavnet er præcis dump-ÅÅÅÅMMDDTTTMMSSZ (en mappe, der ender på -FEJLET, kan aldrig vælges);
#   * mappen har SHA256SUMS og ingen FEJLET.txt, og alle filer i SHA256SUMS findes og stemmer;
#   * verifikationsrapporten VERIFIKATION-<dump>.md ligger ved siden af den og siger "BACKUP VERIFICERET";
#   * rapporten nævner præcis én expected-counts-*.json, og den fil findes.
# Uden et navn vælges den nyeste, der opfylder kravene (navnene sorteres som tidspunkter). En nyere dump,
# der IKKE er verificeret, springes over med en tydelig besked — så den kan ikke krypteres ved et uheld.
#
# SIKKERHED (uændret fra den oprindelige version):
# - Adgangskoden indtastes i gpg's eget vindue. Den står aldrig i kommandoen, en fil eller en log.
# - Ingen ukrypteret kopi skrives på disken: tar sender direkte videre til gpg.
# - Mål på C: og synkroniserede mapper afvises; kopien skal ligge på en anden enhed.
# - Efter krypteringen dekrypteres kopien i hukommelsen, og hver fil sammenlignes med SHA256SUMS.
# - Scriptet læser, krypterer og skriver kun den nye .tar.gpg og dens .sha256. Det sletter, flytter eller
#   ændrer aldrig en dump.
# - Gem adgangskoden i en adgangskodemanager. Uden den kan kopien ikke åbnes.
set -euo pipefail

HERE="${KRYPTER_BACKUP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
if [ -n "${GPG_BIN:-}" ]; then GPG="$GPG_BIN"
elif [ -x "/c/Program Files/Git/usr/bin/gpg.exe" ]; then GPG="/c/Program Files/Git/usr/bin/gpg.exe"
else GPG="gpg"; fi
# Kun til test på falske data: ekstra gpg-tilvalg og en tilladelse til et mål på C:.
read -r -a EXTRA <<< "${KRYPTER_TEST_GPG_OPTS:-}"

usage() { echo "Brug: krypter-backup.sh <drev eller mappe> [dump-navn]  |  krypter-backup.sh --vis [dump-navn]" >&2; exit 2; }
[ $# -ge 1 ] && [ $# -le 2 ] || usage
MODE="krypter"; TARGET=""
if [ "$1" = "--vis" ]; then MODE="vis"; else TARGET="$1"; fi
WANTED="${2:-}"

cd "$HERE"

# Er <dump> en verificeret dump? Skriver årsagen på stderr og returnerer 1, hvis ikke.
# Sætter COUNTS til den expected-counts-fil, rapporten nævner.
COUNTS=""
verified() {
  local d="$1" report refs n
  [[ "$d" =~ ^dump-[0-9]{8}T[0-9]{6}Z$ ]] || { echo "  springer over $d: navnet er ikke dump-ÅÅÅÅMMDDTTTMMSSZ" >&2; return 1; }
  [ -d "$d" ] || { echo "  springer over $d: mappen findes ikke" >&2; return 1; }
  [ ! -e "$d/FEJLET.txt" ] || { echo "  springer over $d: mærket FEJLET" >&2; return 1; }
  [ -s "$d/SHA256SUMS" ] || { echo "  springer over $d: SHA256SUMS mangler" >&2; return 1; }
  report="VERIFIKATION-$d.md"
  [ -f "$report" ] || { echo "  springer over $d: ikke verificeret ($report mangler)" >&2; return 1; }
  grep -q "BACKUP VERIFICERET" "$report" || { echo "  springer over $d: $report siger ikke BACKUP VERIFICERET" >&2; return 1; }
  refs="$(grep -oE 'expected-counts-[0-9]{8}T[0-9]{4,6}Z\.json' "$report" | sort -u || true)"
  n="$(printf '%s' "$refs" | grep -c . || true)"
  [ "$n" = "1" ] || { echo "  springer over $d: $report skal nævne præcis én expected-counts-fil (fandt $n)" >&2; return 1; }
  [ -f "$refs" ] || { echo "  springer over $d: $refs mangler" >&2; return 1; }
  ( cd "$d" && tr -d '\r' < SHA256SUMS | sha256sum -c --quiet --strict ) >/dev/null 2>&1 \
    || { echo "  springer over $d: SHA256SUMS stemmer ikke" >&2; return 1; }
  COUNTS="$refs"
  return 0
}

DUMP=""
if [ -n "$WANTED" ]; then
  verified "$WANTED" || { echo "AFVIST: $WANTED er ikke en verificeret dump." >&2; exit 3; }
  DUMP="$WANTED"
else
  # Nyeste først. Navnene er tidspunkter i fast format, så tekstsortering er tidsrækkefølge.
  while IFS= read -r d; do
    if verified "$d"; then DUMP="$d"; break; fi
  done < <(find . -maxdepth 1 -mindepth 1 -type d -name 'dump-*' -printf '%f\n' | sort -r)
  [ -n "$DUMP" ] || { echo "AFVIST: ingen verificeret dump fundet i $HERE." >&2; exit 3; }
fi
echo "Valgt dump: $DUMP (verifikation VERIFIKATION-$DUMP.md, tællinger $COUNTS)"
[ "$MODE" = "krypter" ] || exit 0

case "$TARGET" in
  [A-Za-z]:) TARGET="/${TARGET:0:1}" ;;
  [A-Za-z]:[\\/]*) TARGET="/${TARGET:0:1}/${TARGET:3}" ;;
esac
TARGET="${TARGET//\\//}"
lower="$(printf '%s' "$TARGET" | tr '[:upper:]' '[:lower:]')"
if [ -z "${KRYPTER_TEST_TILLAD_C:-}" ]; then
  case "$lower" in /c|/c/*) echo "AFVIST: målet ligger på C:. Brug en anden enhed." >&2; exit 3 ;; esac
fi
case "$lower" in *onedrive*|*dropbox*|*"google drive"*|*icloud*)
  echo "AFVIST: målet ser ud til at være en synkroniseret mappe." >&2; exit 3 ;; esac
[ -d "$TARGET" ] || { echo "AFVIST: $TARGET findes ikke. Er enheden tilsluttet?" >&2; exit 3; }

OUT="$TARGET/laerlig-$DUMP.tar.gpg"
[ ! -e "$OUT" ] || { echo "AFVIST: $OUT findes allerede." >&2; exit 3; }

echo "1/4 Dumpens SHA-256 er kontrolleret"

FILES=("$DUMP" "VERIFIKATION-$DUMP.md" "$COUNTS")
[ ! -f "$DUMP-tillaeg.sql" ] || FILES+=("$DUMP-tillaeg.sql")
for f in README.md verify-backup.mjs; do [ ! -f "$f" ] || FILES+=("$f"); done

echo "2/4 Krypterer (AES-256) til $OUT"
tar -cf - "${FILES[@]}" \
  | "$GPG" ${EXTRA[@]+"${EXTRA[@]}"} --symmetric --cipher-algo AES256 --s2k-digest-algo SHA512 \
      --s2k-mode 3 --s2k-count 65011712 --compress-algo none -o "$OUT"

echo "3/4 Dekrypterer i hukommelsen og sammenligner hver fil med manifestet"
fail=0
while read -r sum name; do
  got="$("$GPG" ${EXTRA[@]+"${EXTRA[@]}"} --quiet -d "$OUT" | tar -xOf - "$DUMP/${name#\*}" | sha256sum | cut -d' ' -f1)"
  if [ "$got" = "$sum" ]; then echo "  OK  ${name#\*}"; else echo "  FEJL ${name#\*}" >&2; fail=1; fi
done < <(tr -d '\r' < "$DUMP/SHA256SUMS")
[ "$fail" -eq 0 ] || { echo "IKKE VERIFICERET: slet $OUT og prøv igen." >&2; exit 4; }

echo "4/4 Noterer kopiens SHA-256"
( cd "$TARGET" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256" )
cat "$OUT.sha256"
echo "FÆRDIG: krypteret kopi verificeret. Skub enheden sikkert ud, og opbevar den et andet sted end maskinen."
