# Vægtfragmenter for unit-shards

En ny eller ændret vægt lægges her som én fil pr. testfil, ikke i `tests/unit-ci-weights.json`:

```
tests/unit-ci-weights.d/<testfil>.test.mjs.json
{ "seconds": 2.5, "source": "PR #742, unit-kørsel 45601396882 (shard 3/4)" }
```

Hvorfor: hver PR, der tilføjede en vægt, omskrev den delte fils enlinjes `_comment` med sin egen målekilde. Derfor
konflikterede to sådanne PR'er altid (#746 og #742, 2026-11-25/26). Et fragment er sin egen fil, så to PR'er rører aldrig
de samme linjer. Kun to vægte for den SAMME testfil kan konflikte, og så er det en reel uenighed.

Et fragment tilsidesætter den delte fils værdi for samme testfil (`tests/support/unit-weights.mjs`). Et forkert navn,
manglende `source` eller `seconds` ≤ 0 får kørslen til at fejle højlydt. `tools/ci/unit-weights-refresh.mjs --write`
folder målingerne ind i den delte fil og sletter selv de fragmenter, målingen dækker. Ellers ville et efterladt fragment
tilsidesætte den nyere måling. Commit sletningerne sammen med den delte fil.
