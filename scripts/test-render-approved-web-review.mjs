import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { requireLinuxCi, stopProcessGroup, validateFinalCapture, validateRuntime } from "./render-approved-web-review.mjs";

const valid = '<html data-measured-height="1378" data-promotion-overflow-count="0" '
  + 'data-inline-image-source-count="31" data-inline-image-source-loaded-count="31" '
  + 'data-inline-image-source-failed-count="0" data-inline-image-target-count="58" '
  + 'data-inline-image-resolved-count="58" data-inline-image-unresolved-count="0">';

test("export height follows the rendered page after all images resolve", () => {
  assert.equal(validateRuntime(valid), 1382);
  assert.throws(() => validateRuntime(valid.replace('data-inline-image-resolved-count="58"',
    'data-inline-image-resolved-count="57"')), /inline image/);
  assert.throws(() => validateRuntime(valid.replace('data-promotion-overflow-count="0"',
    'data-promotion-overflow-count="1"')), /clipped promotion/);
});

test("macOS and other non-CI hosts fail before browser launch", () => {
  assert.throws(() => requireLinuxCi("darwin", "true"), /only on an isolated Linux/);
  assert.throws(() => requireLinuxCi("linux", "false"), /only on an isolated Linux/);
  assert.doesNotThrow(() => requireLinuxCi("linux", "true"));
});

test("process group shutdown stops orphaned helpers that ignore SIGTERM", async () => {
  // A shell stands in for Chrome: its background helper ignores SIGTERM and outlives the leader.
  const leader = spawn("sh", ["-c", "trap '' TERM; sleep 30 & exit 0"], { detached: true, stdio: "ignore" });
  await new Promise((resolve) => leader.once("exit", resolve));
  assert.doesNotThrow(() => process.kill(-leader.pid, 0));
  await stopProcessGroup(leader, { graceMs: 200, killMs: 2000 });
  assert.throws(() => process.kill(-leader.pid, 0), { code: "ESRCH" });
});

test("final capture fails when layout changes or overflows its screenshot viewport", () => {
  assert.equal(validateFinalCapture(valid, 1382, 1380), 1382);
  assert.throws(() => validateFinalCapture(valid, 1380, 1370), /exceeds PNG viewport/);
  assert.throws(() => validateFinalCapture(valid, 1382, 1390), /exceeds PNG viewport/);
  assert.throws(() => validateFinalCapture(valid.replace('data-inline-image-resolved-count="58"',
    'data-inline-image-resolved-count="57"'), 1382, 1380), /inline image/);
});
