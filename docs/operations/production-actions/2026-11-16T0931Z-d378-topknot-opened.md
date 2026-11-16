---
time: 2026-11-16T09:31:39Z
session: 981cb1a0
action: D-378 — topknuden åbnet som standard for alle elever. PR #718 (head 6e073c30) blev merget som c2043c73f03663134385baa89b8b9672204d2a3e, og Cloudflare deployede automatisk NORTHSTAR_HAIR_NH5B = true
go: Ejerens godkendelse 2026-11-16 i session 981cb1a0 ("Jeg godkender merge af PR #718 på præcis head `6e073c30a0b7b68c89ffaaeb2a4c88fd12029420` og offentlig åbning af begge topknudefarver."). Merget med låst head (`--match-head-commit`) i ét forsøg
---

## Skrivninger

- **Frontend:** lærlig.dk serverer `js/avatar-layers.js` med `NORTHSTAR_HAIR_NH5B = true`. Alle elever ser »Topknude · gråt« og »Topknude · brunt« sidst under Hoved (84 kort). Gemte avatarer tegnes som før; ingen gemt avatar havde en topknude ved åbningen.
- **Database:** ingen ændringer ved deployet. D-377's migration var anvendt i forvejen (`20261115131725`).
- **Testkørsler:** ingen test har skrevet i produktionen i forbindelse med åbningen. Elevernes egne valg gemmes fremover gennem den uændrede `set_avatar_northstar`.

## Kontrol

- Workers Builds bestod 09:32:03Z.
- `production-smoke` (kørsel 43840550299) ventede på deployet og bestod 09:32:26Z: 442 filer, 9 ruter og 8 interne stier svarer til `c2043c73`.
- Læsende opslag på lærlig.dk 09:34Z:
  - linje 1361 i `js/avatar-layers.js` er `export const NORTHSTAR_HAIR_NH5B = true;`;
  - filen har samme SHA-256 som filen på `main` (`2b05edee…`);
  - `head-nh5b-grey-v1.webp` (200, `image/webp`) `c18f7f1e…` og `head-nh5b-brown-v1.webp` (200, `image/webp`) `e98666cc…` svarer til D-376's bundne WebP-hoveder.
- Gemning er bevist af produktionstesten 2026-11-15 (`2026-11-15T1319Z-d377-topknot-trial-test-pupil.md`).

**Rollback:** sæt `NORTHSTAR_HAIR_NH5B = false` og deploy. Gemte topknuder tegnes fortsat. Ingen data skal ændres.
