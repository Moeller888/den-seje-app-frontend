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
#   * mappen indeholder KUN filer efter reglen nedenfor (ingen undermapper, links eller ukendte filer);
#   * verifikationsrapporten VERIFIKATION-<dump>.md ligger ved siden af den og har PRÆCIS ÉN
#     konklusionslinje, og den er positiv: "Konklusion: BACKUP VERIFICERET" (fed skrift, mellemrum og
#     linjeskift er ligegyldige) uden et forbehold som "ikke", "fejl", "delvis", "foreløbig" eller "?";
#   * rapporten nævner præcis én expected-counts-*.json, og den fil findes.
# Uden et navn vælges den nyeste, der opfylder kravene (navnene sorteres som tidspunkter). En nyere dump,
# der IKKE er verificeret, springes over med en tydelig besked, og valget markeres som IKKE den nyeste.
# Den valgte dumps tidspunkt og alder skrives altid.
#
# FILREGLEN for en dump-mappe (det, run-backup.ps1 skriver):
#   * filerne i SHA256SUMS (de fire .sql-filer) — kontrolleres mod SHA256SUMS;
#   * SHA256SUMS selv, RUN-INFO.txt og <fil>.stderr.txt for hver fil i SHA256SUMS — metadata uden data.
#   Alt andet afviser dumpen.
#
# INTEGRITET. Alle filer, der arkiveres — dumpens filer og bilagene ved siden af (rapport, tællinger,
# tillæg, README, verify-backup.mjs) — hashes, før de krypteres. Efter krypteringen dekrypteres kopien
# én gang i hukommelsen, og arkivets indhold skal være PRÆCIS de filer med PRÆCIS de hashes: ingen
# mangler, ingen ekstra. Datafilernes hash skal desuden være dem i SHA256SUMS.
#
# SIKKERHED:
# - Adgangskoden indtastes i gpg's eget vindue. Den står aldrig i kommandoen, en fil eller en log.
# - Ingen ukrypteret kopi skrives på disken: tar sender direkte videre til gpg, og kontrollen sker i en pipe.
# - Mål på C: og synkroniserede mapper afvises; kopien skal ligge på en anden enhed.
# - Kopien skrives først som <navn>.ufuldstaendig og får sit rigtige navn, når kontrollen er bestået.
#   Fejler noget undervejs, fjernes KUN den ufuldstændige fil, som denne kørsel selv har oprettet, og
#   scriptet slutter med en fejlkode — en afbrudt kryptering kan aldrig rapporteres som vellykket.
# - Eksisterende filer på målet overskrives aldrig, og en dump slettes, flyttes eller ændres aldrig.
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

# Rapportens konklusion: præcis én konklusionslinje, og den er entydigt positiv. 0 = godkendt.
conclusion_ok() {
  local report="$1" lines n line rest
  # CR væk, hårde mellemrum (U+00A0) og tabulatorer til mellemrum, mellemrum samlet, fed skrift væk.
  lines="$(tr -d '\r' < "$report" | sed -e $'s/\xc2\xa0/ /g' -e 's/[[:space:]][[:space:]]*/ /g' -e 's/^ //' -e 's/ $//' \
    | sed -e 's/\*\*//g' -e 's/__//g' | grep -iE '^(> )?(#+ )?konklusion ?:' || true)"
  n="$(printf '%s' "$lines" | grep -c . || true)"
  if [ "$n" != "1" ]; then echo "har $n konklusionslinjer (præcis én kræves)"; return 1; fi
  line="$lines"
  shopt -s nocasematch
  if [[ "$line" =~ ^(\>\ )?(#+\ )?konklusion\ ?:\ ?backup\ verificeret([^[:alnum:]].*)?$ ]]; then
    rest="${BASH_REMATCH[3]}"
    shopt -u nocasematch
    if printf '%s' "$rest" | grep -qiE '(^|[^[:alpha:]])(ikke|not|fejl|afvist|delvis|forel(ø|Ø|oe)big|uafklaret|under forbehold)|\?'; then
      echo "har en konklusion med forbehold: \"$line\""; return 1
    fi
    return 0
  fi
  shopt -u nocasematch
  echo "konklusionen er ikke \"BACKUP VERIFICERET\": \"$line\""
  return 1
}

# Filreglen for dump-mappen. 0 = kun tilladte filer.
files_ok() {
  local d="$1" f base listed
  listed="$(tr -d '\r' < "$d/SHA256SUMS" | awk '{n=$2; sub(/^\*/, "", n); print n}')"
  while IFS= read -r f; do
    [[ "$f" =~ ^[A-Za-z0-9._-]+$ ]] && [[ "$f" != .* ]] || { echo "SHA256SUMS nævner et ugyldigt filnavn: \"$f\""; return 1; }
  done <<< "$listed"
  while IFS= read -r -d '' f; do
    base="${f#./}"
    if [ -L "$d/$base" ] || [ ! -f "$d/$base" ]; then echo "indeholder noget, der ikke er en almindelig fil: $base"; return 1; fi
    case "$base" in
      SHA256SUMS|RUN-INFO.txt) continue ;;
    esac
    if grep -qxF -- "$base" <<< "$listed"; then continue; fi
    if [[ "$base" == *.stderr.txt ]] && grep -qxF -- "${base%.stderr.txt}" <<< "$listed"; then continue; fi
    echo "indeholder en fil uden for reglen: $base"; return 1
  done < <(cd "$d" && find . -mindepth 1 -print0)
  return 0
}

# Er <dump> en verificeret dump? Skriver årsagen på stderr og returnerer 1, hvis ikke.
# Sætter COUNTS til den expected-counts-fil, rapporten nævner.
COUNTS=""
verified() {
  local d="$1" report refs n why
  [[ "$d" =~ ^dump-[0-9]{8}T[0-9]{6}Z$ ]] || { echo "  springer over $d: navnet er ikke dump-ÅÅÅÅMMDDTTTMMSSZ" >&2; return 1; }
  [ -d "$d" ] && [ ! -L "$d" ] || { echo "  springer over $d: mappen findes ikke" >&2; return 1; }
  [ ! -e "$d/FEJLET.txt" ] || { echo "  springer over $d: mærket FEJLET" >&2; return 1; }
  [ -s "$d/SHA256SUMS" ] || { echo "  springer over $d: SHA256SUMS mangler" >&2; return 1; }
  report="VERIFIKATION-$d.md"
  [ -f "$report" ] || { echo "  springer over $d: ikke verificeret ($report mangler)" >&2; return 1; }
  why="$(conclusion_ok "$report")" || { echo "  springer over $d: $report $why" >&2; return 1; }
  refs="$(grep -oE 'expected-counts-[0-9]{8}T[0-9]{4,6}Z\.json' "$report" | sort -u || true)"
  n="$(printf '%s' "$refs" | grep -c . || true)"
  [ "$n" = "1" ] || { echo "  springer over $d: $report skal nævne præcis én expected-counts-fil (fandt $n)" >&2; return 1; }
  [ -f "$refs" ] || { echo "  springer over $d: $refs mangler" >&2; return 1; }
  why="$(files_ok "$d")" || { echo "  springer over $d: mappen $why" >&2; return 1; }
  ( cd "$d" && tr -d '\r' < SHA256SUMS | sha256sum -c --quiet --strict ) >/dev/null 2>&1 \
    || { echo "  springer over $d: SHA256SUMS stemmer ikke" >&2; return 1; }
  COUNTS="$refs"
  return 0
}

DUMP=""
NEWER_SKIPPED=()
if [ -n "$WANTED" ]; then
  verified "$WANTED" || { echo "AFVIST: $WANTED er ikke en verificeret dump." >&2; exit 3; }
  DUMP="$WANTED"
else
  # Nyeste først. Navnene er tidspunkter i fast format, så tekstsortering er tidsrækkefølge.
  while IFS= read -r d; do
    if verified "$d"; then DUMP="$d"; break; fi
    NEWER_SKIPPED+=("$d")
  done < <(find . -maxdepth 1 -mindepth 1 -type d -name 'dump-*' -printf '%f\n' | sort -r)
  [ -n "$DUMP" ] || { echo "AFVIST: ingen verificeret dump fundet i $HERE." >&2; exit 3; }
fi

# Tidspunkt og alder, så en gammel backup aldrig ligner en frisk.
TS="${DUMP#dump-}"
TAKEN="${TS:0:4}-${TS:4:2}-${TS:6:2} ${TS:9:2}:${TS:11:2}:${TS:13:2} UTC"
AGE_H="$(( ( $(date -u +%s) - $(date -u -d "${TAKEN% UTC}" +%s) ) / 3600 ))"
echo "Valgt dump: $DUMP (verifikation VERIFIKATION-$DUMP.md, tællinger $COUNTS)"
echo "Backuppen er taget $TAKEN — for $AGE_H timer siden ($(( AGE_H / 24 )) døgn)."
if [ "${#NEWER_SKIPPED[@]}" -gt 0 ]; then
  echo "ADVARSEL: den valgte dump er IKKE den nyeste. Nyere dumps, der ikke er verificerede og derfor er sprunget over: ${NEWER_SKIPPED[*]}"
fi
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
PART="$OUT.ufuldstaendig"
for f in "$OUT" "$OUT.sha256" "$PART"; do
  [ ! -e "$f" ] || { echo "AFVIST: $f findes allerede. Intet overskrives." >&2; exit 3; }
done

# Alle filer, der arkiveres, som enkeltfiler (ingen hel mappe — så kan intet uventet komme med).
FILES=()
while IFS= read -r -d '' f; do FILES+=("$DUMP/${f#./}"); done < <(cd "$DUMP" && find . -mindepth 1 -type f -print0 | sort -z)
FILES+=("VERIFIKATION-$DUMP.md" "$COUNTS")
[ ! -f "$DUMP-tillaeg.sql" ] || FILES+=("$DUMP-tillaeg.sql")
for f in README.md verify-backup.mjs; do [ ! -f "$f" ] || FILES+=("$f"); done

echo "1/4 Dumpen er kontrolleret mod SHA256SUMS; hasher de ${#FILES[@]} filer, der arkiveres"
EXPECTED="$(for f in "${FILES[@]}"; do printf '%s  %s\n' "$(sha256sum < "$f" | cut -d' ' -f1)" "$f"; done | LC_ALL=C sort)"
# Datafilernes hash skal være dem i SHA256SUMS (dobbeltkontrol af, at det er de verificerede bytes).
while read -r sum name; do
  grep -qxF -- "$sum  $DUMP/${name#\*}" <<< "$EXPECTED" || { echo "AFVIST: $DUMP/${name#\*} ændrede sig under kørslen." >&2; exit 4; }
done < <(tr -d '\r' < "$DUMP/SHA256SUMS")

created=0
cleanup() { if [ "$created" = "1" ] && [ -e "$PART" ]; then rm -f -- "$PART"; echo "Den ufuldstændige fil er fjernet. Intet blev gemt." >&2; fi; }
trap cleanup EXIT

echo "2/4 Krypterer (AES-256) til $PART"
created=1
tar -cf - -- "${FILES[@]}" \
  | "$GPG" ${EXTRA[@]+"${EXTRA[@]}"} --symmetric --cipher-algo AES256 --s2k-digest-algo SHA512 \
      --s2k-mode 3 --s2k-count 65011712 --compress-algo none -o "$PART"

echo "3/4 Dekrypterer i hukommelsen og sammenligner arkivets indhold med listen (filer og hashes)"
# shellcheck disable=SC2016
GOT="$("$GPG" ${EXTRA[@]+"${EXTRA[@]}"} --quiet -d "$PART" \
  | tar -xf - --to-command='printf "%s  %s\n" "$(sha256sum | cut -d" " -f1)" "$TAR_FILENAME"' \
  | LC_ALL=C sort)"
if [ "$GOT" != "$EXPECTED" ]; then
  echo "IKKE VERIFICERET: arkivets indhold afviger fra listen:" >&2
  diff <(printf '%s\n' "$EXPECTED") <(printf '%s\n' "$GOT") >&2 || true
  exit 4
fi
printf '%s\n' "$EXPECTED" | sed 's/^[0-9a-f]*  /  OK  /'

echo "4/4 Giver kopien sit endelige navn og noterer dens SHA-256"
mv -n -- "$PART" "$OUT"
[ -e "$OUT" ] && [ ! -e "$PART" ] || { echo "IKKE GEMT: kunne ikke give kopien sit navn." >&2; exit 4; }
created=0
( cd "$TARGET" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256" )
cat "$OUT.sha256"
echo "FÆRDIG: krypteret kopi af dumpen fra $TAKEN verificeret. Skub enheden sikkert ud, og opbevar den et andet sted end maskinen."
