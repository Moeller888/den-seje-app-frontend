# Produktionslog

Alle handlinger, der ændrer eller kan ændre produktionen, registreres her. Det gælder migrationer, deployments, ændringer af flag og secrets, og tests eller scripts, der logger ind og kalder produktionens Edge Functions, REST eller RPC'er. Reglen står i [D-313](../../decisions/D-313.md), `CLAUDE.md` regel 49 og [`docs/migration-workflow-policy.md`](../../migration-workflow-policy.md) §6.

Loggen findes, fordi parallelle sessioner ellers ikke ved, hvad de andre har gjort i produktionen. Den 2026-11-02 blev G2 anvendt og en runtime-smoke kørt, uden at de øvrige sessioner kendte til det.

## Før du handler i produktionen

1. Læs filerne i denne mappe fra de seneste dage på en frisk `origin/main`, så du kender de seneste handlinger.
2. Sørg for, at du har ejerens GO til netop denne handling. Et GO skal nævne projektet, handlingen og ved tests kontoen samt de forventede skrivninger.

## Efter handlingen

Opret én ny fil pr. handling: `YYYY-MM-DDTHHMMZ-<kort-navn>.md` med tidspunktet i UTC. Hver handling har sin egen fil, så to sessioner aldrig redigerer samme linje. Filerne er append-only: en merget fil ændres ikke. En rettelse bliver en ny fil, der henviser til den gamle.

Filen skal indeholde disse felter:

```markdown
---
time: 2026-11-02T06:46:30Z
session: <sessions-id eller terminalnavn>
action: <hvad der blev gjort>
go: <ejerens GO, citeret eller henvist>
---

## Skrivninger

Hvad der blev ændret i produktionen, og hvad der kunne være ændret. Ved tests: konto (aldrig e-mail eller adgangskode), antal kald og forventede sideeffekter.

## Kontrol

Hvad der blev verificeret bagefter, og hvad der ikke kunne verificeres.
```

Skriv aldrig hemmeligheder, adgangskoder, tokens, e-mailadresser eller elevers identitet i loggen. Skriv kun det, der faktisk er målt. Ukendte før-værdier skrives som ukendte.

`tests/unit/production-testing-policy.test.mjs` kontrollerer, at hver fil har felterne og overskrifterne.
