# August 2026 Mobile-v10-h11 review

Immutable accepted Mobile bytes paired with Web v44 from source commit `b254d55149c996a82bcfefb4dcdf5fec09e7b929`.

- Web HTML SHA-256: `5e85dc066a63f384078b549c5324441fc8a91367862fcbe91a4a3c6e26657851`
- Web PNG SHA-256: `38ce4808056c839dda93b3475c54faae7e74194f984e4e355b2e112f0c286ee8`
- Mobile HTML SHA-256: `f7270bd5c59d27eb71575458070c9bbca6302068d9c2a2ffd2d196d3b5e94977` (unchanged accepted bytes)
- Mobile viewport-validation SHA-256: `0e664fee942258e78bde1ab47025518c7107e323674cae0c3c6d89be53987527` (unchanged accepted bytes)
- Content revision: `d0d7657d040ad334c87865d93bd1ef3ff709d2d5b8759b76408268db9dafdbe3`
- Accepted Mobile framework revision: `bd828906d77f1cef92a590a56c37d1fdba4c7f913c6ac200bb4c3c86b69746c4`
- Accepted Mobile presentation decision revision: `ef3dd9d29627374331cb9e5eb8a211d36c6df46162b0000107edb21c0266ded3`
- Pair render/review run: `069968d16d912f519a84a8a85231b462789bbe3488590aa7be5368bb6c8053d6`

The accepted Mobile HTML and five-width validation bytes are preserved exactly. The surface-specific binding is recorded in `review/2026-08/v44/mobile-accepted-render-binding.json`; all 30 visual comments are accounted for in the paired USER_VISUAL_ACCEPTANCE report. The full 551-test suite passes. BCA review of exact Web v44 plus accepted Mobile h11 is pending. No production/current or mobile/current pointer is changed.
