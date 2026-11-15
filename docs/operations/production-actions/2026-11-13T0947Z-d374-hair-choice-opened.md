---
time: 2026-11-13T09:47:23Z
session: 981cb1a0
action: D-374 — hårvælgeren åbnet som standard for alle elever. PR #702 (head 0bc38f2d) blev merget som 94210ae0323e891db4b4c222621194949f17fba4, og Cloudflare deployede automatisk NORTHSTAR_HAIR_CHOICE = true
go: Ejerens godkendelse 2026-11-13 i session 981cb1a0 ("Jeg godkender merge af #698 på præcis head `a4a1fbe0b9c5cfce813b2962b5ec3699c8a22840` og derefter merge af #702 på præcis head `0bc38f2de04099b7c36e78494eb65d34e521a962`. Jeg godkender, at deployet af #702 åbner hårvælgeren som standard for alle elever."). `gh pr merge` fejlede med HTTP 499, så ejeren mergede #698 (09:40:45Z) og #702 (09:47:23Z) selv via GitHub
---

## Skrivninger

- **Frontend:** lærlig.dk serverer `js/avatar-layers.js` med `NORTHSTAR_HAIR_CHOICE = true`. Alle elever ser de tre frisurer under Hoved. Gemte Northstar-avatarer uden frisure tegnes med standardhåret på D-373's fælles base.
- **Database:** ingen ændringer ved deployet. D-373's migration var anvendt i forvejen (`20261113053515`).
- **Testkørsler:** ingen test har skrevet i produktionen i forbindelse med åbningen. Elevernes egne hårvalg gemmes fremover gennem `set_avatar_northstar`.

## Kontrol

- Workers Builds bestod 09:48:26Z.
- `production-smoke` bestod 09:48:47Z og bekræftede, at det publicerede site er filerne fra `94210ae0`.
- Læsende opslag på lærlig.dk:
  - linje 1346 i `js/avatar-layers.js` er `export const NORTHSTAR_HAIR_CHOICE = true;`;
  - filen har samme SHA-256 som filen på `main` (`99a16390…`);
  - `head-standard-v1.webp` `9cfe6828…`, `head-nh4-grey-v1.webp` `31e99de3…` og `head-nh4-brown-v1.webp` `42f136a0…` svarer til fixturen.
- Gemning er bevist af produktionstesten 05:45–05:47Z (`2026-11-13T0545Z-d373-hair-trial-test-pupil.md`).

**Rollback:** sæt `NORTHSTAR_HAIR_CHOICE = false` og deploy. Ingen data skal ændres.
