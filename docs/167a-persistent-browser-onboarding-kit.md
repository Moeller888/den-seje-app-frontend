# 167A — Manuelt onboarding-kit til den persistente browser-gate (Avatar R2-pilot)

**Status:** `READY_FOR_MANUAL_EXECUTION`
**Relaterede beslutninger:** D-071, D-072, D-073
**Ansvarlig:** projektejer eller direkte supervisor
**Pilotstatus før udførelse:** `AUTHORIZED_BUT_NOT_STARTED`
**Forventet brugerstatus før udførelse:** `PERSISTENT_ONBOARDING_PENDING`
**Tilladte slutstatusser:** `ONBOARDED` · `BLOCKED` · `OPTED_OUT`

---

## 0. Hvad dette dokument er — og ikke er

- Proceduren er **manuel**. Den skal udføres af projektejeren eller en direkte supervisor.
- Den skal udføres i den **faktiske vedvarende browserprofil**, som pilotbrugeren rent faktisk skal bruge
  under piloten.
- **Automatiseret Playwright-verifikation tæller ikke som onboarding.** En midlertidig automatiseret
  browserkontekst kan aldrig opfylde persistence-gaten.
- **Dette dokument onboarder ikke i sig selv nogen bruger.** At læse eller merge dette docs-PR onboarder
  ingen. Ved afslutningen af docs-PR'et er **ingen konto onboardet**.
- **`AVATAR_R2 = false`.** Der sker **ingen bred aktivering**. Aktivering er per browser via en
  `localStorage`-nøgle, som brugeren/supervisoren sætter i sin egen browser.

Onboarding foregår i tre adskilte dele, i denne rækkefølge:

1. **Fase A** — første manuelle aktivering (§7).
2. **Fase B** — den obligatoriske persistence-gate: luk browseren helt og åbn igen (§8).
3. **Opt-out-demonstration** (§9).

En bruger må **kun** få status `ONBOARDED`, når **alle** punkter i beslutningsboksen (§10) er bestået.

---

## 1. Før-start-tjekliste

- [ ] Brugeren er udvalgt til bølge 1.
- [ ] Bølge 1 er fortsat under maksimum 5 brugere.
- [ ] Eligibility er verificeret efter pilotplanens §2.
- [ ] Body type er neutral.
- [ ] Skin tone er medium.
- [ ] Ingen gated eller usikre cosmetics er udstyret.
- [ ] Den rigtige browser er valgt.
- [ ] Den rigtige browserprofil er valgt.
- [ ] Browserprofilen er ikke privat, incognito, InPrivate eller gæsteprofil.
- [ ] Browserprofilen sletter ikke site-data automatisk ved lukning.
- [ ] Brugeren eller supervisoren kan gennemføre opt-out.
- [ ] Der er tid til en fuld browserlukning og genåbning.
- [ ] Ingen følsomme oplysninger skal skrives i pilotloggen.

**Vigtigt om persistence:**

- **Privat browsing kan aldrig opfylde persistence-gaten** (site-data slettes ved lukning).
- **Gæsteprofiler kan aldrig opfylde persistence-gaten.**
- **En midlertidig automatiseret browserkontekst kan aldrig opfylde persistence-gaten.**

---

## 2. Kopiér-klare kommandoer

Alle kommandoer køres i browserens udviklerværktøjer (Console). Ud over **Aktivér R2** og **Deaktivér R2**
er alle kommandoer **read-only** og ændrer ingen tilstand. Der er **ingen ny produktionsmekanisme** her —
kun de eksisterende runtime-kommandoer plus read-only aflæsninger.

### Aktivér R2

```js
localStorage.setItem("avatar_r2", "1"); location.reload();
```

Bookmarklet (valgfri, identisk med pilotplanens §4):

```
javascript:(function(){localStorage.setItem('avatar_r2','1');location.reload();})();
```

### Kontrollér opt-in-status

```js
localStorage.getItem("avatar_r2"); // forventet: "1" når opt-in er aktiv, ellers null
```

### Deaktivér R2

```js
localStorage.removeItem("avatar_r2"); location.reload();
```

Bookmarklet (valgfri, identisk med pilotplanens §4):

```
javascript:(function(){localStorage.removeItem('avatar_r2');location.reload();})();
```

### Kontrollér render-path

Skift selektoren afhængigt af overfladen: `#avatar-preview` (avatar-siden), `#profileAvatar` (hub),
`#avatar-display` (quiz).

```js
document.querySelector("#avatar-preview")?.dataset.avatarRenderPath; // forventet: "r2"
```

### Kontrollér stack-integritet (read-only)

Denne kontrol ændrer **ingen** tilstand. Skift selektoren pr. overflade.

```js
(function (sel) {
  const root = document.querySelector(sel);
  if (!root) return "NO ROOT";
  const imgs = Array.from(root.querySelectorAll("img"));
  const base = root.querySelector('[data-c2-layer="base"]');
  return {
    renderPath: root.dataset.avatarRenderPath,                 // forventet: "r2"
    layers: Array.from(root.querySelectorAll("[data-c2-layer]")).map(e => e.dataset.c2Layer),
    hasMandatoryBase: !!base,                                    // forventet: true
    mixedC2Svg: imgs.filter(i => (i.currentSrc || i.src).endsWith("-c2.svg"))
                    .map(i => i.currentSrc || i.src),           // forventet: [] (tom = ingen C2-blanding)
    brokenImages: imgs.filter(i => !(i.complete && i.naturalWidth > 0))
                      .map(i => i.currentSrc || i.src),         // forventet: [] (tom = ingen ødelagte)
  };
})("#avatar-preview");
```

Fortolkning: en ren R2-stack har `renderPath: "r2"`, `hasMandatoryBase: true`, **tom** `mixedC2Svg` og
**tom** `brokenImages`. Enhver anden kombination behandles efter fejltabellen (§13).

---

## 3. Fase A — første manuelle aktivering

Udføres i den valgte vedvarende browserprofil.

1. [ ] Åbn den valgte vedvarende browserprofil.
2. [ ] Kontrollér, at profilen **ikke** er privat, incognito, InPrivate eller gæst.
3. [ ] Log ind som den valgte pilotbruger.
4. [ ] Åbn avatar-siden.
5. [ ] Åbn browserens udviklerværktøjer.
6. [ ] Kør **Aktivér R2**-kommandoen (§2).
7. [ ] Genindlæs siden.
8. [ ] Kør **status**-kommandoen — bekræft `"1"`.
9. [ ] Kontrollér **renderPath = r2** (§2).
10. [ ] Kontrollér, at stacken **ikke** blander C2 og R2 (`mixedC2Svg` er tom).
11. [ ] Kontrollér, at den **obligatoriske R2-base** er til stede (`hasMandatoryBase: true`).
12. [ ] Kontrollér, at **ingen** obligatoriske billeder er ødelagte (`brokenImages` er tom).
13. [ ] Kontrollér avatar-siden visuelt (§11).
14. [ ] Åbn hub (`#profileAvatar`).
15. [ ] Kontrollér R2, render-path og stack på hub.
16. [ ] Åbn quiz (`#avatar-display`).
17. [ ] Kontrollér R2, render-path og stack i quiz.
18. [ ] Kontrollér, at avataridentiteten er **konsistent** på avatar, hub og quiz.
19. [ ] Kontrollér **blink**.
20. [ ] Kontrollér **breathing**.
21. [ ] Kontrollér, at blink, breathing og expressions **ikke tydeligt konflikter**.
22. [ ] Registrér resultatet dataminimalt (§12).

> Efter fase A er brugerens status fortsat **højst** `PERSISTENT_ONBOARDING_PENDING`.
> **Fase A alene må ikke give status `ONBOARDED`.**

---

## 4. Fase B — obligatorisk persistence-gate

Denne fase er **adskilt** fra fase A og er **bindende**.

1. [ ] Luk alle appfaner.
2. [ ] Luk **hele** browseren normalt.
3. [ ] Bekræft, at browseren er lukket.
4. [ ] Brug **ikke** taskkill eller anden tvungen procesafslutning.
5. [ ] Åbn den **samme** browserprofil igen.
6. [ ] Åbn appen.
7. [ ] Log ind igen, hvis nødvendigt.
8. [ ] Åbn udviklerværktøjerne.
9. [ ] Kør **status**-kommandoen.
10. [ ] Kontrollér, at opt-in **stadig er aktiv** (`"1"`).
11. [ ] Åbn avatar-siden.
12. [ ] Kontrollér **renderPath = r2**.
13. [ ] Kontrollér, at stacken **ikke** blander C2 og R2.
14. [ ] Kontrollér, at **ingen** obligatoriske billeder er ødelagte.
15. [ ] Kontrollér hub.
16. [ ] Kontrollér quiz.
17. [ ] Kontrollér, at avataren fortsat har **korrekt identitet**.
18. [ ] Registrér persistence-resultatet (§12).

**Ved bestået fase B** kan brugeren gå videre til opt-out-demonstrationen (§9).

**Ved fejl i fase B:**

- status = `BLOCKED`
- brugeren må **ikke** registreres som `ONBOARDED`
- fjern opt-in med **Deaktivér R2**-kommandoen
- genindlæs siden
- bekræft, at C2 eller standardstien anvendes
- registrér hændelsen dataminimalt
- **implementér ingen runtime-workaround**
- stop onboarding for denne bruger

---

## 5. Opt-out-demonstration

Bindende. Skal demonstreres på **mindst én** pilotbrowser i bølge 1.

1. [ ] Kør **Deaktivér R2**-kommandoen (§2).
2. [ ] Genindlæs siden.
3. [ ] Kør **status**-kommandoen.
4. [ ] Kontrollér, at opt-in er **væk** (`null`).
5. [ ] Kontrollér, at **standardstien eller C2** anvendes.
6. [ ] Kontrollér, at appen fortsat fungerer.
7. [ ] Aktivér **kun** R2 igen, hvis brugeren fortsat skal deltage.
8. [ ] Ved genaktivering:
   - [ ] kør **Aktivér R2**-kommandoen
   - [ ] genindlæs
   - [ ] kontrollér opt-in (`"1"`)
   - [ ] kontrollér **renderPath = r2**
   - [ ] kontrollér **ingen blandet stack**

---

## 6. Bindende afgørelse om ONBOARDED

### Status må kun sættes til `ONBOARDED`, når alle punkter er bestået

- [ ] Eligibility bestået
- [ ] R2 vist på avatar-siden
- [ ] R2 vist på hub
- [ ] R2 vist i quiz
- [ ] Ingen blandet C2/R2-stack
- [ ] Obligatorisk R2-base til stede
- [ ] Ingen ødelagte obligatoriske lag
- [ ] Browseren blev lukket helt
- [ ] Samme browserprofil blev genåbnet
- [ ] Opt-in overlevede browsergenstart
- [ ] renderPath = r2 efter genstart
- [ ] Avataridentiteten var fortsat korrekt
- [ ] Opt-out blev demonstreret
- [ ] Resultatet blev registreret dataminimalt

Hvis **ikke alle** er bestået, bruges én af: `PERSISTENT_ONBOARDING_PENDING` · `BLOCKED` · `OPTED_OUT`.

**Eksplicit:**

- **Teknisk live-verifikation alene giver ikke `ONBOARDED`.**
- **Playwright-verifikation alene giver ikke `ONBOARDED`.**
- **Et opt-in uden browsergenstart giver ikke `ONBOARDED`.**

---

## 7. Visuel kontrol

Normal zoom (100 %) er beslutningsgrundlag.

- [ ] North Star-identiteten ser korrekt ud
- [ ] hovedet er korrekt
- [ ] håret er korrekt
- [ ] øjnene er korrekte
- [ ] blink fungerer
- [ ] ansigtsudtryk ser korrekte ud
- [ ] arme og hænder ser korrekte ud
- [ ] sko ser korrekte ud
- [ ] breathing fungerer
- [ ] aura/back vises korrekt, når relevant
- [ ] ingen synlig rasterfringe ved 100 %
- [ ] ingen layoutfejl
- [ ] ingen blandet C2/R2-stack
- [ ] ingen ødelagte billeder

> **Kraftig diagnostisk forstørrelse må ikke bruges til at genåbne D-071** uden en faktisk
> re-audit-trigger (se pilotplanens §14). D-071's konklusion bygger på reel renderstørrelse.

---

## 8. Logskabelon (dataminimal)

```markdown
### Pilot-onboarding

- Anonymt pilot-id:
- Dato:
- Supervisor:
- Browser:
- Browserprofil:
- Enhedstype:
- Desktop/mobil:
- Eligibility verificeret:
- Enable udført:
- Avatar R2 verificeret:
- Hub R2 verificeret:
- Quiz R2 verificeret:
- Browser lukket helt:
- Samme profil genåbnet:
- Opt-in overlevede genstart:
- Render-path efter genstart:
- Blandet stack:
- Obligatorisk base til stede:
- Ødelagte billeder:
- Avataridentitet korrekt:
- Blink observeret:
- Breathing observeret:
- Expressions observeret:
- Opt-out demonstreret:
- Severity:
- Slutstatus:
- Opfølgningsbehov:
```

**Severity må kun være:** `INFO` · `MINOR` · `MAJOR` · `BLOCKING`.

**Slutstatus må kun være:** `ONBOARDED` · `PERSISTENT_ONBOARDING_PENDING` · `BLOCKED` · `OPTED_OUT`.

**Loggen må ikke indeholde:** fuldt navn · email · UID · adgangskoder · tokens · `localStorage`-indhold ·
følsomme personoplysninger · unødvendig fritekst om brugeren.

---

## 9. Fejltabel

| Problem | Status | Handling |
|---|---|---|
| Opt-in er væk efter browsergenstart | BLOCKED | Deaktivér, bekræft C2 eller standardsti, registrér og stop |
| renderPath er C2 efter opt-in | BLOCKED | Kontrollér eligibility og fallback, registrér og stop |
| Blandet R2/C2-stack | BLOCKING | Deaktivér, bekræft C2 og stop pilot-onboarding |
| Obligatorisk R2-base mangler | BLOCKING | Deaktivér, bekræft C2 og opret separat fejlspor |
| Ødelagt obligatorisk lag | BLOCKING | Deaktivér, bekræft C2 og opret separat fejlspor |
| Forkert avataridentitet | BLOCKING | Deaktivér og stop |
| Synlig rasterfringe ved 100 % | MAJOR | Pause onboarding og genåbn rasterauditten |
| Brugeren ønsker opt-out | INFO | Deaktivér og registrér OPTED_OUT |
| Udviklerværktøjer kan ikke anvendes | BLOCKED | Find en superviseret manuel onboardingform; ingen runtime-workaround |
| Browseren sletter site-data ved lukning | BLOCKED | Vælg en egnet persistent browserprofil eller stop onboarding |
| Opt-out virker ikke | BLOCKING | Stop piloten og opret separat fejlspor |

> **Ingen automatisk reparation eller runtimeændring** må beskrives eller udføres som en del af kittet.

---

## 10. Browsernoter

**Chrome og Edge:**

- brug en **normal** browserprofil
- brug **samme** profil før og efter genstart
- undgå gæsteprofil
- undgå incognito og InPrivate
- luk **hele** browseren, ikke kun fanen
- automatisk sletning af site-data kan **blokere** persistence-gaten
- flere browserprofiler har **adskilt** `localStorage`
- onboarding i én browserprofil aktiverer **ikke** andre profiler eller enheder

**Safari og Firefox:** følg samme generelle principper (normal profil, samme profil før/efter genstart,
undgå privat browsing, luk hele browseren). Der gives **ingen** konkret kompatibilitetsgaranti ud over det,
som eksisterende projektdokumentation måtte bevise.

---

## 11. Sammenhæng med pilotplanen

Dette kit er den praktiske udførelse af den bindende persistence-gate i
[167a-phase1-pilot-rollout.md](./167a-phase1-pilot-rollout.md) (§8), pilotloggen (§15) og de tilladte
slutstatusser. Pilotstatus er fortsat `AUTHORIZED_BUT_NOT_STARTED`, og test-studentens status er fortsat
`LIVE_VERIFIED_IN_EPHEMERAL_TEST_BROWSER`, indtil denne procedure faktisk er gennemført i en vedvarende
browserprofil. Beslutningsgrundlag: D-071 (rastergæld accepteret), D-072 (protokol) og D-073 (dette kit).
