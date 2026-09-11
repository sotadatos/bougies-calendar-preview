#!/usr/bin/env python3
"""Build a byte-identical, fail-closed bounded GitHub Pages payload."""

from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
from urllib.parse import unquote, urlparse


class ContractError(RuntimeError):
    pass


class LinkCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, _tag, attrs):
        for name, value in attrs:
            if name in {"href", "src"} and value:
                self.links.append(value)


def reject_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ContractError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def load_json(path: Path):
    try:
        return json.loads(path.read_text(), object_pairs_hook=reject_duplicate_keys)
    except (OSError, json.JSONDecodeError) as exc:
        raise ContractError(f"cannot read valid JSON from {path}: {exc}") from exc


def run_git(root: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", "-C", str(root), *args], check=False, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    if proc.returncode:
        raise ContractError(f"git {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc.stdout.strip()


def safe_relative(value: str) -> Path:
    pure = PurePosixPath(value)
    if not value or pure.is_absolute() or ".." in pure.parts or str(pure) != value:
        raise ContractError(f"unsafe repository-relative path: {value!r}")
    return Path(*pure.parts)


def dereference(document, pointer: list[str]):
    value = document
    for key in pointer:
        if not isinstance(value, dict) or key not in value:
            raise ContractError(f"missing JSON pointer component: {key}")
        value = value[key]
    if not isinstance(value, str) or not value:
        raise ContractError("provenance URL must be a non-empty string")
    return value


def relative_url_path(url: str, site_base_url: str) -> Path:
    base = urlparse(site_base_url)
    parsed = urlparse(url)
    if parsed.scheme != "https" or (parsed.scheme, parsed.netloc) != (base.scheme, base.netloc):
        raise ContractError(f"provenance URL is outside the approved Pages origin: {url}")
    base_path = base.path.rstrip("/") + "/"
    if not parsed.path.startswith(base_path) or parsed.query or parsed.fragment:
        raise ContractError(f"provenance URL is not a clean site path: {url}")
    return safe_relative(unquote(parsed.path[len(base_path):]))


def active_review_directory(root: Path, entry: dict) -> Path:
    required = {"name", "gitPathspec", "pathRegex"}
    if set(entry) != required or not all(isinstance(entry[k], str) and entry[k] for k in required):
        raise ContractError("invalid activeReviews entry")
    try:
        pattern = re.compile(entry["pathRegex"])
    except re.error as exc:
        raise ContractError(f"invalid active review regex: {exc}") from exc
    commit = run_git(root, "log", "-1", "--format=%H", "--", entry["gitPathspec"])
    if not commit:
        raise ContractError(f"no durable history found for active {entry['name']} review")
    changed = run_git(
        root, "diff-tree", "--root", "--no-commit-id", "--name-only", "-r",
        commit, "--", entry["gitPathspec"],
    ).splitlines()
    matches = {safe_relative(path).parent for path in changed if pattern.fullmatch(path)}
    if len(matches) != 1:
        raise ContractError(
            f"active {entry['name']} review is ambiguous at {commit}: "
            f"expected one directory, found {len(matches)}"
        )
    return next(iter(matches))


def ensure_present(root: Path, paths: set[Path]) -> None:
    missing = [path for path in sorted(paths) if not (root / path).exists()]
    if not missing:
        return
    sparse = run_git(root, "sparse-checkout", "list")
    if sparse:
        run_git(root, "sparse-checkout", "add", *[path.as_posix() for path in missing])
    missing = [str(path) for path in sorted(paths) if not (root / path).exists()]
    if missing:
        raise ContractError(f"required live paths are missing: {', '.join(missing)}")


def files_under(root: Path, relative: Path) -> set[Path]:
    absolute = root / relative
    if absolute.is_symlink():
        raise ContractError(f"symlinks are forbidden in the live set: {relative}")
    if absolute.is_file():
        return {relative}
    if not absolute.is_dir():
        raise ContractError(f"required live path is neither file nor directory: {relative}")
    result = set()
    for path in absolute.rglob("*"):
        if path.is_symlink():
            raise ContractError(f"symlinks are forbidden in the live set: {path.relative_to(root)}")
        if path.is_file():
            result.add(path.relative_to(root))
    if not result:
        raise ContractError(f"required live directory is empty: {relative}")
    return result


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_navigation(output: Path, site_base_url: str, expected: set[str]) -> None:
    base = urlparse(site_base_url)
    base_path = base.path.rstrip("/") + "/"
    for html in output.rglob("*.html"):
        collector = LinkCollector()
        collector.feed(html.read_text(errors="strict"))
        document = html.relative_to(output)
        for link in collector.links:
            if link.startswith(("data:", "#", "mailto:", "tel:", "javascript:")):
                continue
            parsed = urlparse(link)
            if parsed.scheme or parsed.netloc:
                if (parsed.scheme, parsed.netloc) != (base.scheme, base.netloc):
                    continue
                if not parsed.path.startswith(base_path):
                    raise ContractError(f"same-site link is outside the configured base path: {link}")
                candidate = unquote(parsed.path[len(base_path):])
            else:
                candidate = (PurePosixPath(document.parent.as_posix()) / unquote(parsed.path)).as_posix()
            candidate = PurePosixPath(candidate).as_posix().lstrip("./")
            if not candidate or candidate.endswith("/"):
                continue
            if candidate not in expected:
                raise ContractError(f"live HTML links to excluded path: {document} -> {candidate}")


def validate_policy(policy: dict) -> None:
    expected = {"schemaVersion", "siteBaseUrl", "fixedFiles", "fixedDirectories", "provenanceUrls", "activeReviews"}
    if set(policy) != expected or policy.get("schemaVersion") != 1:
        raise ContractError("policy schema/keys do not match version 1 exactly")
    if not isinstance(policy["siteBaseUrl"], str) or not policy["siteBaseUrl"].endswith("/"):
        raise ContractError("siteBaseUrl must be an absolute directory URL")
    for key in ("fixedFiles", "fixedDirectories", "provenanceUrls", "activeReviews"):
        if not isinstance(policy[key], list) or not policy[key]:
            raise ContractError(f"{key} must be a non-empty list")


def build(root: Path, policy_path: Path, output: Path, expected_ref: str) -> dict:
    root, policy_path, output = root.resolve(), policy_path.resolve(), output.resolve()
    policy = load_json(policy_path)
    validate_policy(policy)
    head = run_git(root, "rev-parse", "HEAD")
    resolved_ref = run_git(root, "rev-parse", f"{expected_ref}^{{commit}}")
    if head != resolved_ref:
        raise ContractError(f"checkout HEAD {head} does not equal required source ref {resolved_ref}")
    if output == root or root in output.parents:
        raise ContractError("output directory must be outside the repository checkout")

    fixed_files = {safe_relative(value) for value in policy["fixedFiles"]}
    fixed_directories = {safe_relative(value) for value in policy["fixedDirectories"]}
    documents = set()
    for entry in policy["provenanceUrls"]:
        if set(entry) != {"document", "pointer"} or not isinstance(entry["pointer"], list):
            raise ContractError("invalid provenanceUrls entry")
        documents.add(safe_relative(entry["document"]))
    ensure_present(root, fixed_files | fixed_directories | documents)

    selected_roots = fixed_files | fixed_directories
    provenance_directories = set()
    for entry in policy["provenanceUrls"]:
        document = load_json(root / safe_relative(entry["document"]))
        target = relative_url_path(dereference(document, entry["pointer"]), policy["siteBaseUrl"])
        provenance_directories.add(target.parent)
    active_directories = {entry["name"]: active_review_directory(root, entry) for entry in policy["activeReviews"]}
    selected_roots |= provenance_directories | set(active_directories.values())
    ensure_present(root, selected_roots)

    selected_files = set()
    for relative in selected_roots:
        selected_files |= files_under(root, relative)
    if not selected_files:
        raise ContractError("bounded live set resolved to zero files")

    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    records = []
    for relative in sorted(selected_files):
        source = root / relative
        if not source.is_file() or source.is_symlink():
            raise ContractError(f"selected path is not a regular file: {relative}")
        destination = output / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        source_hash = sha256(source)
        shutil.copyfile(source, destination)
        if sha256(destination) != source_hash:
            raise ContractError(f"byte verification failed while copying {relative}")
        records.append({"path": relative.as_posix(), "sha256": source_hash, "bytes": source.stat().st_size})

    manifest = {
        "schemaVersion": 1,
        "sourceCommit": head,
        "policySha256": sha256(policy_path),
        "activeReviews": {name: path.as_posix() for name, path in sorted(active_directories.items())},
        "provenanceDirectories": sorted(path.as_posix() for path in provenance_directories),
        "payloadBytes": sum(record["bytes"] for record in records),
        "payloadFileCount": len(records),
        "files": records,
    }
    (output / "pages-live-manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    actual = {path.relative_to(output).as_posix() for path in output.rglob("*") if path.is_file()}
    expected = {record["path"] for record in records} | {"pages-live-manifest.json"}
    if actual != expected:
        raise ContractError("output contains files outside the resolved manifest")
    verify_navigation(output, policy["siteBaseUrl"], expected)
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--policy", type=Path, default=Path("pages-live-policy.json"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--ref", required=True)
    args = parser.parse_args()
    try:
        manifest = build(args.root, args.policy, args.output, args.ref)
    except ContractError as exc:
        print(f"PAGES_LIVE_SET_DENIED: {exc}", file=sys.stderr)
        return 1
    print(f"PAGES_LIVE_SET_OK commit={manifest['sourceCommit']} files={manifest['payloadFileCount']} bytes={manifest['payloadBytes']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
