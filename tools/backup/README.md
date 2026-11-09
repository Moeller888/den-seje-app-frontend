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
- `VERIFIKATION-<dump>.md` ligger ved siden af og siger `BACKUP VERIFICERET`;
- rapporten nævner præcis én `expected-counts-*.json`, og filen findes.

En nyere dump, der ikke opfylder kravene, springes over med en besked. Den kan derfor ikke krypteres ved et
uheld, før den er verificeret.

## Sikkerhed

- Ingen ukrypteret kopi skrives: `tar` sender direkte til `gpg`.
- Mål på `C:` og synkroniserede mapper (OneDrive, Dropbox, Google Drive, iCloud) afvises.
- Kopien dekrypteres i hukommelsen bagefter, og hver fil sammenlignes med `SHA256SUMS`.
- Scriptet sletter, flytter eller ændrer aldrig en dump; det skriver kun `laerlig-<dump>.tar.gpg` og dens
  `.sha256` på målet.

Testet på falske backupmapper i `tests/unit/krypter-backup.test.mjs`.
