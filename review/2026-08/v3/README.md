# Review render v3 — weekday identity artwork family review

Temporary, NOT approved, NOT production. All seven weekday identity
positions populated for the first time, using the calendar-position-
keyed model (docs/phase7c-graphic-language-plan.md §9) -- NOT YET
built in the renderer; this render used a temporary, disposable code
path to exercise it, fully reverted from the source repo afterward.

Sizing matches the validated v2 targets: month title ~140px, weekday
artwork ~100px height. Canvas confirmed unchanged (1800x1200, no
growth needed).

## Real finding from this review

`wednesday-v1-ladies-night.png` has **no alpha channel** (plain RGB,
not RGBA) -- confirmed by decoding the file directly, not just by eye.
It renders on an opaque white background, unlike all six sibling files
(confirmed real RGBA transparency, ~37-42% fully-transparent sampled
pixels each). This is a source-asset export defect, not a renderer bug
or a design choice.

## Filename note

The Monday candidate exists as `monday.png` in `candidates/`, not
`monday-v1.png` as the naming convention specifies -- used as-is for
this render (copied to `monday-v1.png` only inside this disposable
test's temporary approved/ copy, never renamed in candidates/ itself).

See `../v2/` and `../` for prior iterations, and `../../..` for the
real, unaffected production preview.
