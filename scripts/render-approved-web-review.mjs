#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
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

export function validateFinalCapture(attributes, viewportHeight, pageHeight) {
  const measuredHeight = validateRuntime(attributes);
  if (measuredHeight > viewportHeight || pageHeight > viewportHeight) {
    throw new Error(`Final page exceeds PNG viewport: measured ${measuredHeight}, page ${pageHeight}, viewport ${viewportHeight}.`);
  }
  return measuredHeight;
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

async function captureValidatedPng(chrome, fileUrl, pngPath) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "bougies-approved-chrome-"));
  const browser = spawn(chrome, ["--headless", "--disable-gpu", "--disable-dev-shm-usage",
    "--no-first-run", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank"],
  { stdio: "ignore" });
  let socket;
  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    const deadline = Date.now() + 60000;
    while (!fs.existsSync(portFile)) {
      if (browser.exitCode !== null || Date.now() > deadline) throw new Error("Linux Chrome did not start for approved export.");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((target) => target.type === "page");
    if (!page?.webSocketDebuggerUrl) throw new Error("Linux Chrome did not expose a page target.");
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      if (message.error) item.reject(new Error(`${item.method}: ${message.error.message}`));
      else item.resolve(message.result);
    });
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject, method });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(`Final page evaluation failed: ${result.exceptionDetails.text}`);
      return result.result.value;
    };
    await command("Page.enable");
    await command("Emulation.setDeviceMetricsOverride", { width: 1800, height: 1200, deviceScaleFactor: 1, mobile: false });
    const loaded = new Promise((resolve) => {
      const onMessage = ({ data }) => {
        if (JSON.parse(data).method !== "Page.loadEventFired") return;
        socket.removeEventListener("message", onMessage);
        resolve();
      };
      socket.addEventListener("message", onMessage);
    });
    await command("Page.navigate", { url: fileUrl });
    await loaded;
    const pageState = `new Promise(async (resolve, reject) => {
      try {
        if (document.readyState !== 'complete') await new Promise(r => addEventListener('load', r, {once:true}));
        await document.fonts.ready;
        for (let i=0;i<80;i++) {
          const root=document.documentElement;
          const names=['measured-height','promotion-overflow-count','inline-image-source-count','inline-image-target-count','inline-image-resolved-count'];
          if (names.every(n=>root.hasAttribute('data-'+n))) {
            const attrs=Array.from(root.attributes).filter(a=>a.name.startsWith('data-')).map(a=>a.name+'="'+a.value+'"').join(' ');
            resolve({tag:'<html '+attrs+'>',height:Math.ceil(Math.max(root.scrollHeight,document.body.scrollHeight))});return;
          }
          await new Promise(r=>setTimeout(r,100));
        }
        reject(Error('Calendar image checks did not complete'));
      } catch(e) { reject(e); }
    })`;
    const initial = await evaluate(pageState);
    const height = validateRuntime(initial.tag);
    await command("Emulation.setDeviceMetricsOverride", { width: 1800, height, deviceScaleFactor: 1, mobile: false });
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    const final = await evaluate(pageState);
    validateFinalCapture(final.tag, height, final.height);
    const captured = await command("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
    fs.writeFileSync(pngPath, Buffer.from(captured.data, "base64"));
    return height;
  } finally {
    socket?.close();
    if (browser.exitCode === null && browser.signalCode === null) {
      const exited = new Promise((resolve) => browser.once("exit", resolve));
      browser.kill();
      await exited;
    }
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch (error) {
      // Chrome subprocesses can still write the profile after the parent exits.
      // This isolated CI runner discards its temp directory at job teardown.
      if (error.code !== "ENOTEMPTY") throw error;
      console.warn(`Chrome profile cleanup deferred to runner teardown: ${error.code}`);
    }
  }
}

async function run() {
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
  const height = await captureValidatedPng(chrome, fileUrl, pngPath);
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

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  run().catch((error) => { console.error(error); process.exitCode = 1; });
}
