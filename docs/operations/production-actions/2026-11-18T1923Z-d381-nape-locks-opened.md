---
time: 2026-11-18T19:23:51Z
session: 981cb1a0
action: D-381 — Nakkelokker i grå og brun åbnet som standard for alle elever. PR #729 (head 871f16e7) blev merget som 2820fbd123bab1553c18a44420de55fc7db8add6, og Cloudflare deployede automatisk NORTHSTAR_HAIR_NH5C = true
go: Ejerens godkendelse 2026-11-18 i session 981cb1a0 ("Jeg godkender merge af PR #729 på præcis head `871f16e7fb6a466fbad3e922083b9cbae1b50db0` og offentlig åbning af Nakkelokker i grå og brun."). Merget med låst head (`--match-head-commit`) i ét forsøg
---

## Skrivninger

- **Frontend:** lærlig.dk serverer `js/avatar-layers.js` med `NORTHSTAR_HAIR_NH5C = true`. Alle elever ser »Nakkelokker · gråt« og »Nakkelokker · brunt« sidst under Hoved, efter topknuden (86 kort). Gemte avatarer tegnes som før.
- **Database:** ingen ændringer ved deployet. D-381's migration var anvendt i forvejen (`20261118135103`).
- **Testkørsler:** ingen test har skrevet i produktionen i forbindelse med åbningen. Elevernes egne valg gemmes fremover gennem den uændrede `set_avatar_northstar`.

## Kontrol

- **Før merge:** `unit` (fire dele) og `isolated-e2e (run 1)` med K1- og introduktion-testprofilen bestod på `871f16e7`. Diffen var de 14 gennemgåede filer.
- **Workers Builds** bestod 19:24:53Z.
- **`production-smoke`** (kørsel 44380093610) ventede på deployet og bestod 19:25:15Z: 444 filer, 9 ruter og 8 interne stier svarer til `2820fbd1`.
- **Læsende opslag på lærlig.dk 19:30Z:**
  - linje 1373 i `js/avatar-layers.js` er `export const NORTHSTAR_HAIR_NH5C = true;`;
  - filen har samme SHA-256 som filen på `main` (`f71902a6…`);
  - `head-nh5c-grey-v1.webp` (200, `image/webp`) `549bc6aa7aedd902d3bb0aa5859c682a09c7eb74eef41330db7f208d09f92f2d` og `head-nh5c-brown-v1.webp` (200, `image/webp`) `e1225901e00be9adcf22d8e54fee0320faa564be38d167ab0280e445959d00b2` svarer til D-380's bundne WebP-hoveder.
- **Læsende kontrol i databasen 19:31Z:** 1 profil havde gemt `nh5c-brown`, og ingen havde `nh5c-grey`.
- **Gemning** er bevist af produktionstesten 2026-11-18 (`2026-11-18T1354Z-d381-nape-locks-trial-test-pupil.md`).

**Rollback:** sæt `NORTHSTAR_HAIR_NH5C = false` og deploy. Gemte nakkelokker tegnes fortsat. Ingen data skal ændres.
