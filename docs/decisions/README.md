# D-registret

Lærligs beslutningsregister. Det er append-only og har to dele:

| Numre | Hvor | Regel |
|---|---|---|
| D-001 … D-223 | tabellen i [`../project-state.md`](../project-state.md) | **Frosset ved D-223.** Rækkerne står ordret, og der må ikke tilføjes nogen række over D-223. Numre op til D-223, der var reserveret før frysningen, må stadig lande i tabellen. |
| D-224 og frem | én fil pr. beslutning: `docs/decisions/D-NNN.md` | Én fil pr. nummer. En merget fil ændres ikke. En senere ændring bliver en ny D-fil, der nævner den tidligere under `relates`. |

Hver beslutning har sin egen fil, så to terminaler, der registrerer hver sin beslutning, redigerer aldrig samme linje. Deres PR'er kan merges i vilkårlig rækkefølge.

## 1. Reservér nummeret først

```
node tools/decisions/reserve.mjs --owner <terminalnavn> --task "<kort opgave>"
```

Værktøjet læser de højeste numre fra reservationstags (`d-number/*` på origin), fra den frosne tabel og fra filerne i denne mappe på `origin/main`. Det opretter så et annoteret tag `d-number/D-NNN` på det næste nummer og pusher det uden force.

GitHub afviser et tag, der allerede findes. Derfor kan to terminaler, der reserverer samtidig, ikke få samme nummer: taberen henter igen og prøver det næste nummer, højst 5 gange. Værktøjet sletter eller overskriver aldrig noget på remote.

`--dry-run` viser det næste ledige nummer uden at reservere det. Vælg aldrig et nummer i hånden.

## 2. Skriv filen

`docs/decisions/D-NNN.md`, UTF-8, med æøå:

```markdown
---
d: D-NNN
title: Kort titel
owner: <terminalnavn eller ejer>
status: <fx RECORDED, APPLIED, NOT APPLIED>
date: YYYY-MM-DD
relates: D-209, D-220        (eller: none)
---

## Beskrivelse

Hvad der er besluttet, og hvorfor.

## Resultater

Beviser: tests, commits, PR'er, remote-versioner, målinger.
```

Felterne `d`, `title`, `owner`, `status`, `date` og `relates` samt de to overskrifter er påkrævede. `d` skal svare til filnavnet. `tests/unit/decision-register.test.mjs` håndhæver reglerne:
- gyldige filer;
- ingen nye rækker over frysningen;
- intet nummer to gange;
- at der ikke ligger en committet oversigt i mappen.

## 3. Oversigt og opslag

```
node tools/decisions/index.mjs [--from D-NNN]
```

Kommandoen udskriver hele registret, altså tabellen og filerne, som én Markdown-tabel. Oversigten genereres og **committes aldrig**, fordi en fælles oversigtsfil ville give konflikterne tilbage.

Værktøjer og tests, der skal bruge en beslutning, uanset hvor den ligger, bruger `readDecision(root, "D-NNN")` fra `tools/decisions/register.mjs`.
