# Krypteret kopi af den manuelle produktionsbackup

`krypter-backup.sh` krypterer den **seneste verificerede** manuelle backup til en anden lagringsenhed
(AES-256 via GPG). Den rigtige backup og dens kit ligger uden for repoet, i
`C:\Users\Bruger\Documents\DEN SEJE APP\_production-basis\backup-…\`, fordi dumpen indeholder elevdata. Kun
scriptet ligger her; det indeholder ingen data og ingen adgangskoder.

## Brug (ejeren)

1. Kopiér `tools/backup/krypter-backup.sh` ind i backup-kittets mappe, ved siden af `dump-…`-mapperne.
2. Se, hvilken dump der vil blive valgt, uden at noget skrives:

   ```powershell
   & "C:\Program Files\Git\bin\bash.exe" krypter-backup.sh --vis
   ```

3. Tilslut en ekstern enhed (fx `E:`) og kør:

   ```powershell
   & "C:\Program Files\Git\bin\bash.exe" krypter-backup.sh E:
   ```

   GPG beder om en adgangskode i sit eget vindue. Gem den i en adgangskodemanager; uden den kan kopien ikke
   åbnes. En bestemt dump vælges med `krypter-backup.sh E: dump-ÅÅÅÅMMDDTTTMMSSZ`.

## Hvilken dump vælges

Den nyeste `dump-ÅÅÅÅMMDDTTTMMSSZ`-mappe, hvor alt dette gælder:

- mappen er ikke mærket fejlet (navnet ender ikke på `-FEJLET`, og der er ingen `FEJLET.txt`);
- `SHA256SUMS` findes, og alle filer stemmer;
- mappen indeholder kun filer efter **filreglen** nedenfor;
- `VERIFIKATION-<dump>.md` ligger ved siden af og har **præcis én** konklusionslinje, og den er entydigt
  positiv: `Konklusion: BACKUP VERIFICERET` (fed skrift, store/små bogstaver, mellemrum og linjeskift er
  ligegyldige). En linje som `IKKE BACKUP VERIFICERET`, en konklusion med forbehold (`ikke`, `fejl`,
  `delvis`, `foreløbig`, `?` …), flere konklusionslinjer eller ingen afviser dumpen;
- rapporten nævner præcis én `expected-counts-*.json`, og filen findes.

En nyere dump, der ikke opfylder kravene, springes over med en besked. Vælges en ældre dump, skriver
scriptet en **ADVARSEL** og navnene på de nyere dumps, der er sprunget over. Den valgte backups tidspunkt
og alder skrives altid, så en gammel backup aldrig ligner en frisk.

### Filreglen

En dump-mappe må kun indeholde det, `run-backup.ps1` skriver:

- filerne i `SHA256SUMS` (de fire `.sql`-filer) — kontrolleres mod `SHA256SUMS`;
- `SHA256SUMS`, `RUN-INFO.txt` og `<fil>.stderr.txt` for hver fil i `SHA256SUMS` — metadata uden data.

Alt andet (en ekstra fil, en undermappe, et link) afviser dumpen.

## Sikkerhed

- Ingen ukrypteret kopi skrives: `tar` sender direkte til `gpg`, og kontrollen sker i en pipe.
- Alle filer, der arkiveres, hashes før krypteringen. Bagefter dekrypteres kopien én gang i hukommelsen, og
  arkivet skal indeholde præcis de filer med præcis de hashes: ingen mangler, ingen ekstra.
- Kopien skrives først som `….tar.gpg.ufuldstaendig` og får sit rigtige navn, når kontrollen er bestået.
  Fejler noget, fjernes kun denne kørsels ufuldstændige fil, og scriptet slutter med en fejlkode.
- Mål på `C:` og synkroniserede mapper (OneDrive, Dropbox, Google Drive, iCloud) afvises.
- Eksisterende filer på målet overskrives aldrig, og en dump slettes, flyttes eller ændres aldrig.
- Arkivets format er uændret: en `tar` med de samme stier, krypteret med AES-256. Gendannelse:
  `gpg -d laerlig-<dump>.tar.gpg | tar -xf -`.

Testet på falske backupmapper i `tests/unit/krypter-backup.test.mjs`.
