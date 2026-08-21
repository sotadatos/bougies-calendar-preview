# Review render v4 — presentation wrapper fix only

Temporary, NOT approved, NOT production. **No renderer, config, or
asset changes** — the underlying calendar page (artwork, layout,
CSS) is byte-identical to `../v3/`. This round only fixes how the
review copy's outer wrapper presents that same v3 content in a
browser.

## What changed

v3's wrapper scaled the 1800px calendar to fit narrow viewports, but
pivoted the scale from the box's top-left corner with no horizontal
centering — so on any viewport under ~1824px, the poster shrank toward
the left edge instead of the middle, reading as left-weighted with
uneven margins.

Fixed by:
- `body { display: flex; justify-content: center; }` — genuinely
  centers the (possibly wider-than-viewport) wrapper box, which a
  plain `margin: auto` does not reliably do for an over-wide block in
  this browser (confirmed by testing — an earlier `margin: auto`
  attempt left the box flush left with the scale pivoting from its own
  midpoint, overflowing off the right edge instead).
- `transform-origin: top center` (was `top left`) — scales from the
  now-centered box's own horizontal middle, so it stays centered at
  every scale factor instead of shrinking toward one corner.

Verified headlessly at both a narrow viewport (1200px — scales down,
confirmed symmetric margins, nothing clipped) and a wide one (1920px —
scale clamps to 1, confirmed symmetric ~60px margins either side of
the full 1800px canvas).

## What did not change

Calendar artwork, dimensions, weekday identity candidates, renderer
code, `config/`, and the production preview root — none of it was
touched. This is a review-wrapper-only diff against `../v3/`.

See `../v3/`, `../v2/`, `../` for prior iterations, and `../../..` for
the real, unaffected production preview.
