# Bougies Calendar Preview

This repository receives generated public-safe Calendar outputs from the
private `bougies-calendar-system` repository.

Git retains the complete immutable review history. GitHub Pages serves a
smaller, explicit live window defined by `pages-live-policy.json` and resolved
by `scripts/build-pages-site.py`:

- customer/current Web artifacts at the repository root;
- `mobile/current`;
- the approved artifacts referenced by the current Mobile manifest; and
- the latest durably published Web and Mobile review candidates.

The assembler fails closed on missing, ambiguous, unsafe, or unlinked paths,
copies selected files byte-for-byte, records their SHA-256 digests, and rejects
live navigation to excluded history. Historical reviews outside the live window
remain reproducible from Git but are not guaranteed to stay simultaneously
served by Pages.

The custom Pages workflow retains its deployment artifact for at most one day
and removes only its own artifact after the deployed bytes have been verified.
To roll back, revert the bounded Pages source commit (or restore its exact tree
from Git) and rerun the workflow; source history is never deleted or rewritten.

No source code, Airtable data, or internal project documentation is ever
published to this repository — only already-reviewed, public-safe
rendered calendar files. See the private repository's
`docs/preview-deployment-architecture.md` and
`docs/preview-deployment-implementation.md` for the full design.
