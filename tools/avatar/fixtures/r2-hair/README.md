# R2 hair — the owner-approved afro candidate

**This is a preserved candidate, not a promoted asset.** Nothing here is registered in
`R2_MANIFEST`, referenced by `hairSrcForR2`, or reachable by the runtime. `assets/avatar-r2/hair/`
still contains only `hair-northstar-v1.webp`. Promotion is a separate, separately authorised step.

| File | SHA-256 | What it is |
|---|---|---|
| `afro-original.png` | `14a037a044ddcd05df328cc47a4a92fda4bbcdb8f9bb9122b10b7fceaa9c2b3e` | The generated candidate, 1024×1536, exactly as it came back from the image model. Never edited. |
| `afro-cleaned.png` | `0dacc5ce56f9915bb1fb2abe2774355f8ebda60319b2daa8e4779cfd07fa6bfd` | The same file after deterministic orphan-dust removal. This is what the owner approved. |
| `afro-cleaned.alpha-report.json` | — | The sidecar the cleanup wrote: every measurement, invariant and postcondition from that run. |

## Why these are tracked

They were not, and that nearly cost them. Both files lived only in the gitignored
`tools/avatar/build/alpha-cleanup/` inside a git worktree, per the D-088 convention that
non-reproducible generation inputs stay outside git. On 2026-08-29 that worktree was removed
during a branch cleanup and the files went with it. They were recovered byte-exact only because
two earlier review pages happened to embed them as data URIs — luck, not a process.

The D-088 convention still holds for *generation inputs*: prompts, raw API responses, rejected
rounds. It does not fit an artefact a recorded owner decision now rests on. An approved candidate
that exists in exactly one deletable scratch directory is a decision without evidence.

`tools/avatar/fixtures/<tool>/` is this repository's tracked home for tool inputs — the same
convention as `face-clean/` and `r2-torso/` — so the tools run on a fresh clone. These two PNGs
are inputs to `check-r2-hair-candidate.mjs` and `clean-r2-hair-alpha.mjs`.

## Reproducing the cleaned file

```
node tools/avatar/clean-r2-hair-alpha.mjs \
  tools/avatar/fixtures/r2-hair/afro-original.png \
  tools/avatar/build/alpha-cleanup/afro.cleaned.png
```

The output is byte-identical to `afro-cleaned.png` — verified across three tool versions
(1.0.0, 2.0.0, 3.0.0). Expect 5 938 → 27 orphan-soft at authoring scale, 1 292 → 11 served,
5 911 pixels cleared in 255 components, highest removed alpha 23, geometry identical,
9/9 postconditions, 11/11 gates.

## What the approval covers

The owner approved the **cleaned** candidate on 2026-08-29 after reviewing it mounted on the R2
neutral stack at the four real render sizes (180×270, 112×168, 72×108, 52×78) on light and dark
grounds — the D-059 / D-105 sign-off at real render scale.

It approves how the artwork looks at those sizes. It is **not** a promotion, **not** a
registration, and **not** a runtime activation. The other six styles from the first round remain
failed, and the `ponytail` candidate remains rejected.
