#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function validateRuntime(attributes) {
  const get = (name) => {
    const match = attributes.match(new RegExp(`\\b${name}="(\\d+)"`));
    if (!match) throw new Error(`Rendered page did not report ${name}.`);
    return Number(match[1]);
  };
  const height = get("data-measured-height");
  if (height < 600 || height > 6000) throw new Error(`Invalid measured page height: ${height}.`);
  if (get("data-promotion-overflow-count") !== 0) throw new Error("Approved page has a clipped promotion.");

  const sources = get("data-inline-image-source-count");
  const targets = get("data-inline-image-target-count");
  if (sources < 1 || targets < 1
    || get("data-inline-image-source-loaded-count") !== sources
    || get("data-inline-image-source-failed-count") !== 0
    || get("data-inline-image-resolved-count") !== targets
    || get("data-inline-image-unresolved-count") !== 0) {
    throw new Error("Approved page did not resolve every inline image.");
  }
  return Math.max(1200, height + 4);
}

export function requireLinuxCi(platform = process.platform, actions = process.env.GITHUB_ACTIONS) {
  if (platform !== "linux" || actions !== "true") {
    throw new Error("Approved Web image export runs only on an isolated Linux GitHub Actions runner.");
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function findChrome() {
  for (const name of ["google-chrome-stable", "google-chrome", "chromium-browser", "chromium"]) {
    try { return execFileSync("which", [name], { encoding: "utf8" }).trim(); }
    catch { /* Try the next installed Linux browser. */ }
  }
  throw new Error("No Chrome/Chromium browser is available on the Linux runner.");
}

function run() {
  requireLinuxCi();
  const [sourcePath, outputDir, expectedSha] = process.argv.slice(2);
  if (!sourcePath || !outputDir || !/^[0-9a-f]{64}$/.test(expectedSha ?? "")) {
    throw new Error("Usage: render-approved-web-review.mjs SOURCE_HTML OUTPUT_DIR EXPECTED_SHA256");
  }
  const original = fs.readFileSync(sourcePath);
  if (sha256(original) !== expectedSha) throw new Error("Source HTML differs from the approved checksum.");
  fs.mkdirSync(outputDir, { recursive: true });
  const htmlPath = path.join(outputDir, "calendar.html");
  const pngPath = path.join(outputDir, "calendar.png");
  const pdfPath = path.join(outputDir, "calendar.pdf");
  if ([htmlPath, pngPath, pdfPath].some((p) => fs.existsSync(p))) {
    throw new Error("Immutable review destination already contains an output file.");
  }
  fs.writeFileSync(htmlPath, original);
  const chrome = findChrome();
  const browserArgs = ["--headless", "--disable-gpu", "--disable-dev-shm-usage"];
  const fileUrl = pathToFileURL(path.resolve(htmlPath)).href;
  const rendered = execFileSync(chrome,
    [...browserArgs, "--window-size=1800,1200", "--dump-dom", fileUrl],
    { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  const htmlTag = rendered.match(/<html\b[^>]*>/i)?.[0];
  if (!htmlTag) throw new Error("Chromium did not return a rendered HTML element.");
  const height = validateRuntime(htmlTag);
  execFileSync(chrome,
    [...browserArgs, `--window-size=1800,${height}`, `--screenshot=${pngPath}`, fileUrl],
    { maxBuffer: 1024 * 1024 });
  const png = fs.readFileSync(pngPath);
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
    || png.readUInt32BE(16) !== 1800 || png.readUInt32BE(20) !== height) {
    throw new Error("Rendered PNG is missing or has the wrong dimensions.");
  }
  // Print from a temporary copy so the approved HTML remains byte-identical.
  const printDir = fs.mkdtempSync(path.join(os.tmpdir(), "bougies-approved-print-"));
  const printPath = path.join(printDir, "calendar.html");
  const printCss = `<style>@page{size:1800px ${height}px;margin:0}@media print{html,body,.calendar-page{width:1800px;height:${height}px;margin:0}}</style>`;
  try {
    fs.writeFileSync(printPath, original.toString("utf8").replace("</head>", `${printCss}</head>`));
    execFileSync(chrome,
      [...browserArgs, `--print-to-pdf=${pdfPath}`, "--no-pdf-header-footer", pathToFileURL(printPath).href],
      { maxBuffer: 1024 * 1024 });
  } finally {
    fs.rmSync(printDir, { recursive: true, force: true });
  }
  if (fs.readFileSync(pdfPath).subarray(0, 4).toString() !== "%PDF") throw new Error("PDF export failed.");
  if (sha256(fs.readFileSync(htmlPath)) !== expectedSha) throw new Error("Approved HTML changed during export.");
  console.log(JSON.stringify({ htmlSha256: expectedSha, pngSha256: sha256(png), pngWidth: 1800,
    pngHeight: height, pdfSha256: sha256(fs.readFileSync(pdfPath)), chromeVersion: execFileSync(chrome, ["--version"], { encoding: "utf8" }).trim() }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) run();
