# Intern dokumentationslevering — privat bucket, content-adresserede objekter

**Status:** `DELIVERY_DESIGN_LOCKED — CLEANUP_IS_OPEN_DEBT`.
**Type:** designnote + registreret gæld. Beskriver hvordan `docs.html` leverer intern dokumentation
i produktion, og hvorfor publiceringen **aldrig sletter noget**.
**Relateret:** `supabase/migrations/20260823000000_docs_private_bucket.sql` (bucket + RLS),
`tools/publish-docs.mjs` (publisher), `docs.html` (viewer),
`tests/unit/docs-publish-atomicity.test.mjs`.

---

## 1. Hvorfor ikke CDN'et

Frontenden er en **asset-only Cloudflare Worker**: alt buildet publicerer er verdenslæsbart. En
klient-side rollekontrol ville gate *siden*, mens `/docs/<fil>.md` fortsat kunne hentes direkte.

Dokumenterne ligger derfor i en **privat Supabase-bucket**, og adgangen håndhæves af RLS
(`docs_read_super_admin`), ikke af siden. Buildet publicerer **nul markdown**.

## 2. Formen på en publicering

```
1. list o/ FULDSTÆNDIGT      (pagineret — en ufuldstændig listing er en fejl, ikke et skuldertræk)
2. for hvert dokument:       opret o/<sha256>.md hvis fraværende, ellers VERIFICÉR bytes
3. overskriv manifest.json   SKIFTET, og det eneste mutable objekt i bucket
```

**Der er intet trin 4.**

Objekterne er content-adresserede, så en nøgles bytes ændrer sig aldrig. Før trin 3 ser en læser
hele den forrige generation; efter trin 3 hele den nye. En fejl på ethvert trin efterlader sidste
komplette publicering intakt og læsbar.

## 3. Hvorfor der ikke slettes

Det er den vigtigste beslutning i designet, og den er truffet bevidst.

En gammel generation koster kun lagerplads. At slette den koster **korrekthed**:

- **En åben fane** holder det manifest, den bootede med, indtil den genindlæses.
- **Browsercachen** har som standard ~1 times TTL (Supabase-standard).
- **CDN'et** bruger op til **60 sekunder** på at invalidere efter en overskrivning.
- **En samtidig publisher** kan være midt i sit forløb med objekter, kun dens eget manifest kender.

Sletning under en publicering kan strande alle fire. Derfor sletter `--write` intet, og `--gc`
findes ikke — værktøjet **afviser** flaget eksplicit frem for at lade som om.

Et dokument fjernet fra allowlisten forsvinder **straks** fra manifestet og dermed fra viewer'en.
Dets objekt bliver liggende i bucket — stadig privat, stadig bag super_admin-RLS.

## 4. Cachepolitik

| Objekt | `cacheControl` | Begrundelse |
|---|---|---|
| `o/<sha256>.md` | `31536000` (1 år) | Nøglen **er** indholdshashen. Kan ikke blive forældet. |
| `manifest.json` | `0` | Current-pointer på fast sti. Må aldrig serveres fra cache. |

Viewer'en læser manifestet gennem en **frisk signeret URL ved hvert kald**. Hver signeret URL har et
unikt token, og Supabase behandler hvert token som sin egen CDN-cachenøgle, så et nyt kald kan ikke
besvares fra et tidligere svar. Dertil `cache: "no-store"` og en eksplicit `cacheNonce`.

## 5. Viewer-genopretning

En fane, der har stået åben gennem en publicering, kender en nøgle, der ikke længere er den aktuelle.
Ved 404 **eller** hash-mismatch:

1. hent manifestet friskt (nyt token, ny nonce)
2. slå samme slug op igen
3. hent den nye nøgle
4. verificér SHA-256
5. render kun ved match

**Højst ét forsøg.** Anden fejl fejler lukket med en tydelig besked. Der er ingen løkke, og ingen vej
der renderer uverificerede bytes.

## 6. Åben gæld: oprydning

Gamle generationer akkumulerer. Det er acceptabelt i denne skala — fem dokumenter, sjælden
publicering, én operatør — men det er ikke gratis for evigt.

En fremtidig oprydning skal, hvis den bygges:

- være **opt-in**, aldrig aktiveret af `--write`
- have en dokumenteret **grace-periode længere end cachevinduet** (≫ 1 time)
- **aldrig** slette et objekt, det aktuelle manifest refererer
- **paginere** gennem hele prefixet og **fail-faste** ved ufuldstændig listing
- håndtere samtidighed sikkert — eller nægte at køre, hvis single-writer ikke kan bevises
- være dækket af rene tests uden Storage-mutation

**Den er bevidst ikke bygget nu.** En halv sikker GC er værre end ingen: den ville genindføre præcis
de fire strandingsveje, §3 lukker.
