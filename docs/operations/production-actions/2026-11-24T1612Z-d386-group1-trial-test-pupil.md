---
time: 2026-11-24T16:12:14Z
session: dda698b8
action: D-386 — én afgrænset produktionsprøve af HAIR-25 gruppe 1 med projektets testelev (kontoen bag `TEST_STUDENT_EMAIL`) og sidens eget tilvalg `?northstarh25=1` i testbrowseren alene, mod den levende kode i Chromium; testelevens tidligere avatarvalg registreret før og gendannet efter
go: Ejerens godkendelse 2026-11-24 i session dda698b8 ("Gennemfør derefter produktionsprøven med testeleven via ?northstarh25=1. Kontrollér alle 12 hårvalg, bevaret tøj, gemning, genindlæsning, nyt login og samme visning på Avatar, Hub og i quizzen. Gendan testkontoens tidligere valg bagefter.")
---

## Skrivninger

Prøven ændrede kun testelevens egen `profiles.avatar_identity`, og kun gennem `set_avatar_northstar` med elevens egen session.

Den kørte uden for repositoryet, i en lokal Playwright-fil med samme opbygning som D-381's produktionstest. Filen læste kontoen fra den lokale `.env` uden at udskrive den og kørte i Chromium med én worker og 0 genforsøg.

| Kørsel | Tid (UTC) | Logins | Kald til `set_avatar_northstar` | Andet |
|---|---|---|---|---|
| Registrering | 16:12:14 | 1 | 0, kun læsning | — |
| Forsøg 1 | 16:12:38–16:13:21 | 5 | 15: de tolv frisurer, én overdel, N3 grå igen og gendannelse med `{}` | Hub og quizsiden åbnet to gange hver |

**Quizsiden** blev åbnet to gange. Det kan have udleveret spørgsmål til testeleven gennem `get-next-question`. Der blev ikke svaret, og der er ikke givet XP eller mønter.

Ingen andre konti, tabeller, funktioner, flag eller secrets er ændret. `NORTHSTAR_HAIR_H25G1` var `false` live under hele prøven.

## Kontrol

**Før prøven** blev testelevens `avatar_identity` læst og gemt lokalt: `{"v":1,"body_type":"neutral","chosen_at":"2026-10-30T14:55:59.182Z","hairstyle":"default","skin_tone":"medium"}`. Der var altså intet Northstar-valg, og Avatar tegnede dagens avatar (render-sti `r2`).

**De serverede hoveder:** lærlig.dk serverer alle tolv `head-h25…-v1.webp` med præcis de sha256, som godkendelsesfixturen binder.

**Forsøg 1 bestod.** Startoutfittet var K07 (`top-tee-hip-cream`, `bottom-capri-lightblue`, `shoes-sneakers-beige`).

- **Skjult som standard:** uden tilvalg viste garderoben 86 kort og intet gruppe 1-kort. `?northstarh25=1` gav 98 kort og gemte tilvalget i testbrowseren.
- **Alle tolv hårvalg** blev prøvet i rækkefølgen N2, N3, N6, N7, V2 og N5, hver i grå og brun. For hver frisure:
  - kortet blev markeret "På";
  - avatarfeltet blev tegnet om med frisurens hoved (`head-<frisure>-v1.webp`) uden genindlæsning (0 `load`-hændelser);
  - outfittet var uændret;
  - der var præcis ét gemmekald, og kontoen holdt `{"outfit":"FRI", top, pants, shoes, "hair":<frisure>}` med det uændrede outfit.
- **Tøjskift:** overdelen blev skiftet til `top-sweater-ls2-heather`. Frisuren (`h25n5-brown`) blev siddende, både gemt og tegnet, uden genindlæsning.
- **Genindlæsning:** `h25n5-brown` var markeret "På" og tegnet med samme outfit.
- **Nyt login i en frisk browser uden tilvalg:** Avatar, Hub og quizzen tegnede alle `h25n5-brown` med `head-h25n5-brown-v1.webp` og samme outfit (`top-sweater-ls2-heather`, `bottom-capri-lightblue`, `shoes-sneakers-beige`). Garderoben viste 86 kort.
- **En anden frisure i grå:** `h25n3-grey` (Bølget skulderhår · gråt) blev valgt i testbrowseren, og outfittet blev siddende. Efter endnu et nyt login uden tilvalg tegnede Avatar, Hub og quizzen alle `h25n3-grey` med `head-h25n3-grey-v1.webp` og samme outfit.
- **Tilvalget fjernet:** `?northstarh25=0` fjernede det i testbrowseren, og garderoben viste igen 86 kort.

**Gendannelse:**
- `set_avatar_northstar({})` fjernede Northstar-valget.
- `avatar_identity` var derefter præcis den registrerede, både efter en genindlæsning og efter et nyt login.
- Avatar tegnede dagens avatar (render-sti `r2`).

**Læsende kontrol i databasen efter prøven:**
- 0 profiler har en gruppe 1-frisure.
- Funktionsdefinitionen er uændret siden anvendelsen (md5 `285376e0014d48c5605762df3eaffe38`).
