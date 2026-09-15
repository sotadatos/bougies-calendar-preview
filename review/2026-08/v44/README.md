# August 2026 Web v44 review

Immutable local Issue #129 candidate from source commit `b254d55` (full identity recorded in `review-evidence.json`).

- Web HTML SHA-256: `5e85dc066a63f384078b549c5324441fc8a91367862fcbe91a4a3c6e26657851`
- Web PNG SHA-256: `38ce4808056c839dda93b3475c54faae7e74194f984e4e355b2e112f0c286ee8`
- Web PDF SHA-256: `e8426a2162d21b1eb27384bf1d7c6377a770cda41868a05e8cbb06aefe47c04b`
- 1366px review PNG SHA-256: `e0f2449a5322836f9534435d9ea7e8d71fffed10477925dfe73ea5d458526409`
- 1000px review PNG SHA-256: `a742e943f52e7dbafb3baca0dff5f5320c85e0d92c180b5e5e1e54facd681c6f`
- 980px review PNG SHA-256: `930ca58f89aa612cb9a2295644fed2f37e1a363ad60de1e9a3320300dcfcd0d6`
- Mobile HTML SHA-256: `f7270bd5c59d27eb71575458070c9bbca6302068d9c2a2ffd2d196d3b5e94977` (unchanged accepted bytes)
- Content revision: `d0d7657d040ad334c87865d93bd1ef3ff709d2d5b8759b76408268db9dafdbe3`
- Web framework revision: `daeda4c3861351d39d7ea66638ae821af77dabb9df8a41819f488b8e2b0ef5da`
- Web presentation decision revision: `52ea8c455f3d6808e7205e095fef638434ff7e539ed9fd38e34bf39e6affd838`
- Accepted Mobile presentation decision revision: `ef3dd9d29627374331cb9e5eb8a211d36c6df46162b0000107edb21c0266ded3`

Browser QA reconciles 33 records with zero unexplained differences. v44 preserves every v43 artwork rectangle, scale, crop, byte identity, and split ratio at 1800, 1366, 1000, and 980px. It removes the renderer-wide split scrim, uses local text contrast, places split labels through a measured metadata-lane policy with protected face regions, and separates the 1000px navigation from the brand. The full 551-test suite passes. Mobile h11 was not regenerated. Pair render/review run: `069968d16d912f519a84a8a85231b462789bbe3488590aa7be5368bb6c8053d6`. BCA review is pending. No production or mobile production pointer is changed.
