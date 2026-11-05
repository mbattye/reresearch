# Reading levels

Each file in this folder tells the thread writer how to pitch a paper for one point on the reader's
slider, from **1 Crayons** (explain it like I'm five) to **6 Referee #2** (expert in the field).
They are drafts for review and are not wired into the app yet.

A level file changes *who the thread is for*: vocabulary, how numbers and maths appear, whether
comparisons are allowed, how long the thread runs and what it dwells on. It never changes the
rules below, which stay in the base prompt in `src/lib/summarise.ts` and apply at every level.

## Rules every level keeps

- Use only what is in the paper. No invented numbers, comparisons or context.
- Every thread has at least one caveat post, and says when the paper is a preprint.
- Separate what was measured, what was inferred and what was speculated.
- No hype words, exclamation marks, emojis, hashtags or thread markers ("1/", "🧵").
- British English. Plain text, no markdown, posts readable on a phone.
- Hook length is set per level (about 240 characters at Crayons up to about 340 at the expert
  levels); the base prompt's "about 300" becomes the level's limit once these are wired in.
- The same five sections in the same order: context, approach, result, caveat, takeaway. A level
  may use fewer posts per section, never a different structure, so the app can show any level.

## File format

```
---
level: 1-6
slug: url-safe id
name: what the slider shows
tagline: one line under the name
---
```

Then the same headings in every file: **Who you're writing for**, **Language**, **Numbers and
maths**, **Comparisons**, **Shape**, **What to dwell on**, **Avoid**, and **Calibration**: the
headline and hook for the same paper at this level, so the steps between levels stay even.

The calibration paper throughout is *Earthquake Forecast via Neutrino Tomography at the DUNE
Baseline* (arXiv:2611.06755). Its facts: a fault zone with three times normal crustal electron
density, 100 km wide, on DUNE's 1300 km beam path would raise the νμ→νe appearance probability at
2.5 GeV by 0.55 percentage points (6.8% relative). A 3σ detection needs about 2,000 appearance
events per time window; DUNE expects 10³–10⁴ over several years, so a week-long earthquake
precursor is out of reach.
