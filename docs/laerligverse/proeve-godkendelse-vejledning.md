# Sådan godkender du prøverne (D-346, F9)

Siden viser de fire prøver (A, B, T, C) præcis som eleverne ser dem. Desuden viser den facit og bedømmelse
bag en fold, rubrikken med de fem tvivlstilfælde og beslutningerne om læringsprogression (LP-13). Intet er
forhåndsgodkendt, og intet sendes nogen steder.

## 1. Start siden

Kør i en terminal i repoets mappe (på F9-branchen):

```
node tools/laerligverse/serve-assessment-review.mjs
```

Åbn derefter:

```
http://127.0.0.1:4341/
```

Siden kan kun åbnes fra din egen computer. Ctrl+C i terminalen stopper serveren. Du kan også åbne filen
`docs/laerligverse/proeve-godkendelse.html` direkte i browseren uden server.

## 2. Gennemgå prøverne

Prøverne står i sidens afsnit B–D: prætest A, posttest B, transfertest T og forsinket test C. For hver prøve:

1. Læs den blå boks. Det er det, eleven ser.
2. Åbn »Til læreren«. Her finder du facit, bedømmelsen, kildeoplysninger, de historiske forbehold, den
   didaktiske begrundelse og de kendte svagheder.
3. Vælg **Godkendt**, **Skal rettes** eller **Afvist**. Udfyld de felter, du har noget til: faglig kommentar,
   historisk korrekthed, sproglig formulering, sværhedsgrad og forventet elevforståelse.
4. Ved **Skal rettes** skal du skrive i »Konkrete rettelser«. Ellers kan du ikke gemme.

**Vær især opmærksom på** den kendte svaghed i del 2: ja-påstanden nævner altid afsenderen. Under »Kendte
svagheder« står der et forslag til en ekstra påstand. Skriv i »Konkrete rettelser«, om du vil have den.

Du kan prøve oplæsning af elevteksten med afkrydsningsfeltet »Prøv oplæsning« øverst. Det bruger kun en lokal
dansk stemme på din computer, hvis der er en.

## 3. De fem tvivlstilfælde (afsnit E)

Hvert tvivlstilfælde viser:

- opgaven og det syntetiske elevsvar (konstrueret, ikke en elev);
- den foreslåede bedømmelse og hvorfor den er svær;
- 2–3 muligheder med konsekvensen for elevens delscore;
- min anbefaling.

Vælg én mulighed eller lad »Ikke besluttet« stå, og skriv gerne en kommentar. Dit valg ændrer ikke rubrikken
af sig selv. Rubrikken rettes bagefter, efter din beslutning, og derefter skal den godkendes igen.

Godkend eller afvis til sidst rubrikken som helhed nederst i afsnit E.

## 4. LP-13 (afsnit F)

Det er **ikke** en del af prøvegodkendelsen. Vælg det, du er klar til at beslutte. Valgene aktiverer intet.

## 5. Gem, genindlæs og aflever

1. Skriv dit navn og datoen (DD-MM-ÅÅÅÅ) øverst.
2. Tryk **Gem afgørelser som fil**. Browseren gemmer `proeve-godkendelse.json` i din Downloads-mappe.
3. Vil du fortsætte senere, så åbn siden igen og vælg filen under **Indlæs tidligere afgørelser**. Alt kommer
   tilbage.
4. Hvis prøveteksten er ændret siden din afgørelse, sætter siden den prøve tilbage til »Ikke gennemgået«. Den
   skriver, hvad du valgte før, og du skal gennemgå prøven igen.
5. **Aflevering:** Lad filen ligge i Downloads, og sig til i en ny opgave. Den registreres så byte for byte med
   SHA-256, ligesom Arkivskabets godkendelse blev det i F8.

## 6. Hvad sker der bagefter?

- **Godkendt:** prøven registreres og bindes til sit fingeraftryk. Ændres den senere, kræves en ny gennemgang.
- **Skal rettes:** rettelserne indføres, og prøven kommer frem til ny gennemgang.
- **Tvivlstilfælde:** rubrikken rettes efter dine valg og skal godkendes igen.
- **LP-13:** dine valg bliver til en pilotpolitik i et særskilt spor, og først efter et særskilt GO.
- **Ingen** godkendelse er et GO til en elevpilot, til produktion eller til merge.
