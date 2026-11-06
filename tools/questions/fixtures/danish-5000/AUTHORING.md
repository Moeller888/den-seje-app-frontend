# Forfatterregler for de 5.000 danskopgaver

Opgaverne er til Lærlig, en dansk læringsplatform for elever i 3.–9. klasse. Læreplanen er dansk
folkeskole (Fælles Mål for dansk). Alt skrives i hånden: ingen skabelon-generering med script, ingen
tilfældige ord. Hver opgave skal kunne stå alene foran en elev.

## Format

En fil pr. cirka 60 opgaver: `tools/questions/fixtures/danish-5000/<slot>-NN.json` (`01`, `02`, …).
Filen er et JSON-array, ét objekt pr. linje, UTF-8:

```json
{"l":1234,"k":"s","q":"…","o":["…","…","…","…"],"a":"…","r":"…"}
```

- `l`: sværhedsniveau 1–10.000. Klassetrin og bånd følger af niveauet: 35 lige store celler
  (3. klasse = 1–1428, 4. = 1429–2857, 5. = 2858–4285, 6. = 4286–5714, 7. = 5715–7142,
  8. = 7143–8571, 9. = 8572–10000; hvert klassetrin har 5 bånd). Spred niveauerne jævnt, og lad
  niveauet afspejle reel sværhed.
- `k`: `s` stavning, `o` ordforråd, `g` grammatik, `t` tegnsætning, `l` læseforståelse, `f` litteratur.
- `q`: spørgsmålet. `o`: præcis fire svar. `a`: facit, ordret som i `o`. `r`: forklaring.
- Facit må stå på alle pladser; generatoren fordeler pladserne bagefter.

## Regler, der beskytter bedømmelsen

1. **Præcis ét rigtigt svar.** De tre andre skal være entydigt forkerte, også for en dygtig lærer.
   Ved tvivl: skriv en anden opgave. Dansk tillader ofte to former (f.eks. "nogen/nogle" i talesprog,
   valgfri kommaer, dobbeltformer i Retskrivningsordbogen). Spørg aldrig til noget, hvor en
   distraktor også er korrekt.
2. **Bedømmelsen skelner ikke store og små bogstaver.** To svar, der kun adskiller sig på den måde,
   tæller begge som rigtige. Opgaver om stort begyndelsesbogstav stilles derfor som "Hvilket ord i
   sætningen skal skrives med stort: '…'?" med fire forskellige ord som svar.
3. **Tegn tæller med i bedømmelsen,** så to sætninger, der kun adskiller sig i komma, er fine.
4. **Hvert svar skal indeholde bogstaver.** Svarene `.`, `,` og `?` alene er forbudt. Skriv tegnets
   navn ("komma", "punktum") eller hele sætningen.
5. **Ingen svar som "alle ovenstående", "ingen af dem" eller "ved ikke".**
6. **Facit må ikke være markant længere end de andre** (reglen: over 1,25 gange og mindst 10 tegn
   længere end det længste forkerte). Bliv også uden for reglen: gør distraktorerne lige så lange.
7. **Enten slutter alle fire svar med `.`, `!` eller `?`, eller også gør ingen.**

## Regler for spørgsmålsteksten

- **Teksten er unik i hele banken.** En bar ramme som "Hvilket ord er stavet rigtigt?" er forbudt.
  Hver opgave skal have sit eget stikord eller sin egen sætning, der ikke afslører stavemåden:
  "Hvilket ord er stavet rigtigt? Det er et dyr, der siger vov." eller
  "Hvilket ord er stavet rigtigt: 'Vi skal ___ på museum i morgen.'"
- Til stavning og ordforråd må facit ikke stå i spørgsmålet.
- Ét `___` højst pr. spørgsmål. Citerede ord og tekster står i enkelte citationstegn `'…'`.
  Læsetekster skrives `Læs: '…' Hvorfor …?`.
- Variér formuleringen. Banken må ikke ligne én skabelon gentaget.
- Sproget passer til klassetrinnet: korte, klare sætninger i 3.–4. klasse.

## Sprog og faglighed

- Rigtigt dansk med æ, ø og å, efter Retskrivningsordbogen. Ingen ae/oe/aa, ingen engelske vendinger.
- Forkerte stavemåder må kun forekomme som distraktorer i stavning og skal være **troværdige fejl**,
  som elever faktisk laver (stumme bogstaver, dobbeltkonsonant, -er/-ere, nutids-r, ng/nk, hv/v, sj/sk).
  De må ikke være et andet rigtigt ord. "hvor/vor", "ligge/lægge" og lignende spørges i sætning.
- Forklaringen er på dansk, 1–2 sætninger, venlig og lærerig: den siger, hvorfor facit er rigtigt,
  og gerne hvad fejlen i den oplagte distraktor er. Den må ikke bare gentage facit.
- Grammatik bruger skolens begreber: navneord, udsagnsord, tillægsord, biord, stedord, forholdsord,
  bindeord, grundled, udsagnsled, genstandsled, hovedsætning, ledsætning, kort/lang tillægsform.
  Fra 6. klasse må de latinske navne også bruges (substantiv, verbum, adjektiv osv.).
- Komma: brug kun regler, hvor valgfrihed ikke gør svaret tvetydigt. Komma før ledsætning og efter
  ledsætning er sikkert. Startkomma er valgfrit, så spørg aldrig, om det skal stå.

## Indhold

- Eleverne er børn. Ingen vold, sex, rusmidler, selvskade, politik eller religion som holdning.
  Ingen stereotyper. Bland navne, så de afspejler en dansk klasse.
- Ingen rigtige, nulevende privatpersoner. Ingen reklame for mærker.
- **Ophavsret:** læsetekster skrives fra bunden. Citér aldrig tekster af forfattere, sangskrivere eller
  medier, der stadig er beskyttet. Værker må gerne omtales ved titel, forfatter og handling.
- **Fakta skal være sikre.** Skriv kun litteraturhistoriske fakta, du er helt sikker på (årstal,
  forfattere, perioder). Er du i tvivl, så vælg et andet spørgsmål.

## Erfaringer fra piloten

- Niveauet følger ordets eller opgavens reelle sværhed. Læg ikke lette ord højt i klassetrinnet blot
  for at fylde et bånd op; vælg i stedet sværere ord til de høje bånd.
- Facit skal passe grammatisk i sætningen, også i køn og tal ("den ___ fugl" kræver bestemt form).
- Sammensatte ord med en særskrevet distraktor: tjek, at to ord ikke også er korrekt ("bag ved").
- Skriv kun regler som "altid" og "aldrig", hvis de faktisk gælder uden undtagelser.
- Skriv i én fil ad gangen, og hold hver fil på højst ca. 60 opgaver.

## Når du er færdig

Kør `node tools/questions/check-danish-items.mjs <slot>` fra repoets rod, og ret, til der er 0 problemer.
Værktøjet tjekker struktur og mængder, ikke om dansken er rigtig. Det ansvar er dit: læs hver opgave
igennem, som var du dansklæreren, der skal stå på mål for den. Ret eller erstat den, hvis du er i tvivl.
