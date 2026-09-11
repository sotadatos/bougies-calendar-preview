#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("build-pages-site.py")
SPEC = importlib.util.spec_from_file_location("build_pages_site", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def run(repo: Path, *args: str) -> str:
    return subprocess.run(list(args), cwd=repo, check=True, text=True, stdout=subprocess.PIPE).stdout.strip()


class PagesSiteTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Path(self.temp.name) / "repo"
        self.repo.mkdir()
        run(self.repo, "git", "init", "-q")
        run(self.repo, "git", "config", "user.email", "test@example.invalid")
        run(self.repo, "git", "config", "user.name", "Test")
        for name, value in {
            "calendar.html": "customer html", "calendar.png": "customer png", "calendar.pdf": "customer pdf",
            "review/2026-09/v12/calendar.html": "approved web", "review/2026-09/v12/evidence.json": "{}",
            "mobile/review/2026-09/mobile-v10/calendar.html": "approved mobile",
            "mobile/review/2026-09/mobile-v10/prototype-manifest.json": "{}",
            "review/2026-08/v30/calendar.html": "old web",
            "mobile/review/2026-08/mobile-v10-h4/calendar.html": "old mobile",
            "mobile/current/calendar.html": "current mobile",
        }.items():
            self.write(name, value)
        self.write_current_manifest()
        run(self.repo, "git", "add", ".")
        run(self.repo, "git", "commit", "-qm", "initial")
        for name, value in {
            "review/2026-08/v31/calendar.html": "active web",
            "review/2026-08/v31/evidence.json": "active evidence",
            "mobile/review/2026-08/mobile-v10-h5/calendar.html": "active mobile",
            "mobile/review/2026-08/mobile-v10-h5/prototype-manifest.json": "{}",
        }.items():
            self.write(name, value)
        run(self.repo, "git", "add", ".")
        run(self.repo, "git", "commit", "-qm", "active pair")
        self.policy = self.repo / "pages-live-policy.json"
        self.policy.write_text((SCRIPT.parent.parent / "pages-live-policy.json").read_text())

    def tearDown(self):
        self.temp.cleanup()

    def write(self, name: str, value: str):
        path = self.repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value)

    def write_current_manifest(self):
        self.write("mobile/current/prototype-manifest.json", json.dumps({
            "approvedImmutableReviewUrl": "https://sotadatos.github.io/bougies-calendar-preview/mobile/review/2026-09/mobile-v10/calendar.html",
            "approvedImmutableManifestUrl": "https://sotadatos.github.io/bougies-calendar-preview/mobile/review/2026-09/mobile-v10/prototype-manifest.json",
            "sourceDesktopReview": {"htmlUrl": "https://sotadatos.github.io/bougies-calendar-preview/review/2026-09/v12/calendar.html"},
        }))

    def build(self):
        output = Path(self.temp.name) / "site"
        head = run(self.repo, "git", "rev-parse", "HEAD")
        return MODULE.build(self.repo, self.policy, output, head), output

    def test_builds_exact_bounded_live_set(self):
        manifest, output = self.build()
        self.assertEqual(manifest["activeReviews"]["web"], "review/2026-08/v31")
        self.assertEqual(manifest["activeReviews"]["mobile"], "mobile/review/2026-08/mobile-v10-h5")
        self.assertEqual((output / "calendar.html").read_text(), "customer html")
        self.assertEqual((output / "review/2026-08/v31/calendar.html").read_text(), "active web")
        self.assertFalse((output / "review/2026-08/v30/calendar.html").exists())
        self.assertFalse((output / "mobile/review/2026-08/mobile-v10-h4/calendar.html").exists())

    def test_workflow_output_directory_inside_checkout_is_allowed(self):
        output = self.repo / "_site"
        head = run(self.repo, "git", "rev-parse", "HEAD")
        manifest = MODULE.build(self.repo, self.policy, output, head)
        self.assertEqual(manifest["payloadFileCount"], 13)
        self.assertTrue((output / "pages-live-manifest.json").is_file())

    def test_missing_required_file_fails_closed(self):
        (self.repo / "calendar.pdf").unlink()
        with self.assertRaises(MODULE.ContractError):
            self.build()

    def test_external_provenance_url_fails_closed(self):
        path = self.repo / "mobile/current/prototype-manifest.json"
        data = json.loads(path.read_text())
        data["approvedImmutableReviewUrl"] = "https://example.com/calendar.html"
        path.write_text(json.dumps(data))
        with self.assertRaises(MODULE.ContractError):
            self.build()

    def test_duplicate_policy_key_fails_closed(self):
        self.policy.write_text('{"schemaVersion":1,"schemaVersion":1}')
        with self.assertRaises(MODULE.ContractError):
            self.build()

    def test_ambiguous_active_review_commit_fails_closed(self):
        self.write("review/2026-08/v32/calendar.html", "one")
        self.write("review/2026-08/v33/calendar.html", "two")
        run(self.repo, "git", "add", ".")
        run(self.repo, "git", "commit", "-qm", "ambiguous web")
        with self.assertRaises(MODULE.ContractError):
            self.build()

    def test_link_to_excluded_history_fails_closed(self):
        self.write("calendar.html", '<a href="review/2026-08/v30/calendar.html">old</a>')
        with self.assertRaises(MODULE.ContractError):
            self.build()


if __name__ == "__main__":
    unittest.main()
